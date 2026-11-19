import { readFile } from 'node:fs/promises';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import app from '../index';
import { safeEqual } from '../crypto';
import type { Env } from '../env';
import { workerHandlesPath } from '../origin-proxy';
import { openD1, type NodeD1Database } from './d1';
import { applyMigrations } from './migrations';

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

type Variables = NodeJS.ProcessEnv | Record<string, string | undefined>;

function assetFetcher(publicDirectory: string): Fetcher {
  const root = resolve(publicDirectory);
  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Not Found', { status: 404 });
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response('Not Found', { status: 404 });
      }
      const file = resolve(root, `.${pathname}`);
      if (file !== root && !file.startsWith(root + sep)) return new Response('Not Found', { status: 404 });
      try {
        if (!statSync(file).isFile()) return new Response('Not Found', { status: 404 });
        const bytes = await readFile(file);
        const headers = {
          'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Content-Length': String(bytes.byteLength),
        };
        return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { status: 200, headers });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    },
  } as Fetcher;
}

function workersAi(accountId: string | undefined, token: string | undefined): Ai | undefined {
  if (!accountId || !token) return undefined;
  return {
    async run(model: string, input: unknown) {
      const path = model.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as { success?: boolean; result?: unknown };
      if (!response.ok || body.success === false) throw new Error(`Workers AI 요청 실패 (${response.status})`);
      return body.result;
    },
  } as unknown as Ai;
}

function portOf(value: string | undefined): number {
  if (value === undefined || value === '') return 8787;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('PORT는 0~65535 사이 정수여야 해요');
  return port;
}

export type NodeRuntimeOptions = {
  variables?: Variables;
  databasePath?: string;
  migrationsDirectory?: string;
  publicDirectory?: string;
};

export type NodeRuntime = {
  database: NodeD1Database;
  env: Env;
  fetch(request: Request): Promise<Response>;
};

export async function createNodeRuntime(options: NodeRuntimeOptions = {}): Promise<NodeRuntime> {
  const variables = options.variables ?? process.env;
  const databasePath = resolve(options.databasePath ?? variables.DB_PATH ?? './data/dogam.sqlite');
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = openD1(databasePath);
  try {
    await applyMigrations(database, resolve(options.migrationsDirectory ?? 'migrations'));
  } catch (error) {
    database.close();
    throw error;
  }

  const env: Env = {
    DB: database.asD1(),
    ASSETS: assetFetcher(resolve(options.publicDirectory ?? 'public')),
    DISCORD_CLIENT_ID: variables.DISCORD_CLIENT_ID ?? '',
    DISCORD_CLIENT_SECRET: variables.DISCORD_CLIENT_SECRET ?? '',
    GUILD_ID: variables.GUILD_ID ?? '',
    PUBLIC_URL: variables.PUBLIC_URL ?? '',
    GAMBLE_TESTERS: variables.GAMBLE_TESTERS,
    SESSION_SECRET: variables.SESSION_SECRET ?? '',
    BOT_SYNC_SECRET: variables.BOT_SYNC_SECRET ?? '',
    GAME_PROGRESS_TOKEN: variables.GAME_PROGRESS_TOKEN,
    SCRIM_QUESTS: variables.SCRIM_QUESTS,
    MAINTENANCE: variables.MAINTENANCE,
    DISCORD_ACTIVITY: variables.DISCORD_ACTIVITY,
    AI: workersAi(variables.CF_ACCOUNT_ID, variables.CF_AI_TOKEN),
    // 광장은 제거되어 Node 서버에서는 이 바인딩을 사용하지 않아요.
    PLAZA: undefined as unknown as Env['PLAZA'],
  };
  const originSecret = variables.ORIGIN_SECRET;
  const publicOrigin = variables.PUBLIC_URL ? new URL(variables.PUBLIC_URL).origin : '';

  return {
    database,
    env,
    async fetch(request: Request): Promise<Response> {
      if (originSecret && !(await safeEqual(request.headers.get('X-Origin-Secret') ?? '', originSecret))) {
        return new Response('Forbidden', { status: 403 });
      }
      // 문지기 모드에서는 CSS·JS·글꼴 같은 일반 공개 파일도 Node 원본으로 와요.
      // 보호 그림 폴더는 %63har 처럼 글자를 바꿔 써도 알아보도록 풀어 쓴 경로로 판단해요(그림 보호 검사를 건너뛰지 못하게).
      let plainPath = new URL(request.url).pathname;
      try {
        plainPath = decodeURIComponent(plainPath);
      } catch {
        // 잘못된 %표기는 아래 파일 조회에서도 404가 돼요.
      }
      if (!workerHandlesPath(plainPath) && (request.method === 'GET' || request.method === 'HEAD')) {
        const asset = await env.ASSETS.fetch(request);
        if (asset.status !== 404) return asset;
      }
      // 문지기 뒤에서는 Node가 받은 주소가 http://127.0.0.1:8787 같은 내부 주소예요.
      // 다른 사이트 POST 막기(sameOrigin)와 쿠키 Secure 판단이 실제 주소를 보도록 PUBLIC_URL 주소로 바꿔 넘겨요.
      if (publicOrigin) {
        const incoming = new URL(request.url);
        if (incoming.origin !== publicOrigin) request = new Request(publicOrigin + incoming.pathname + incoming.search, request);
      }
      const executionCtx = {
        waitUntil(promise: Promise<unknown>) {
          void promise.catch((error) => console.error('waitUntil 작업 실패', error));
        },
        passThroughOnException() {},
      } as ExecutionContext;
      return app.fetch(request, env, executionCtx);
    },
  };
}

export type StartedNodeServer = NodeRuntime & {
  server: ServerType;
  address: AddressInfo;
  close(): Promise<void>;
};

export async function startNodeServer(options: NodeRuntimeOptions = {}): Promise<StartedNodeServer> {
  const variables = options.variables ?? process.env;
  const runtime = await createNodeRuntime({ ...options, variables });
  const hostname = variables.HOST || '127.0.0.1';
  const port = portOf(variables.PORT);

  let ready!: (address: AddressInfo) => void;
  let failed!: (error: unknown) => void;
  const listening = new Promise<AddressInfo>((resolveReady, rejectReady) => {
    ready = resolveReady;
    failed = rejectReady;
  });
  const server = serve({ fetch: runtime.fetch, hostname, port }, ready);
  server.once('error', failed);
  let address: AddressInfo;
  try {
    address = await listening;
  } catch (error) {
    runtime.database.close();
    throw error;
  } finally {
    server.off('error', failed);
  }

  return {
    ...runtime,
    server,
    address,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          runtime.database.close();
          if (error) rejectClose(error);
          else resolveClose();
        });
      }),
  };
}

const main = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (main) {
  startNodeServer()
    .then(({ address }) => console.log(`하리보 Node 서버: http://${address.address}:${address.port}`))
    .catch((error) => {
      console.error('Node 서버 시작 실패', error);
      process.exitCode = 1;
    });
}
