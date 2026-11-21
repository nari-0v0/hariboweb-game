import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startNodeServer, type StartedNodeServer } from '../src/node/server';

const temporary: string[] = [];
let active: StartedNodeServer | undefined;

afterEach(async () => {
  if (active) await active.close();
  active = undefined;
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it('Node 서버가 문지기 비밀을 확인하고 앱과 봇 동기화를 처리해요', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hariboweb-server-'));
  temporary.push(directory);
  active = await startNodeServer({
    databasePath: join(directory, 'dogam.sqlite'),
    variables: {
      HOST: '127.0.0.1',
      PORT: '0',
      ORIGIN_SECRET: 'origin-test-secret',
      SESSION_SECRET: 'session-test-secret',
      BOT_SYNC_SECRET: 'bot-test-secret',
      PUBLIC_URL: 'https://dogam.example',
      DISCORD_CLIENT_ID: 'client',
      DISCORD_CLIENT_SECRET: 'discord-test-secret',
      GUILD_ID: 'guild',
    },
  });
  const url = `http://127.0.0.1:${active.address.port}`;

  expect((await fetch(`${url}/`)).status).toBe(403);
  const home = await fetch(`${url}/`, { headers: { 'X-Origin-Secret': 'origin-test-secret' } });
  expect(home.status).toBe(200);
  expect(await home.text()).toContain('하리보 멤버 도감');
  const css = await fetch(`${url}/styles.css`, {
    headers: { 'X-Origin-Secret': 'origin-test-secret' },
  });
  expect(css.status).toBe(200);
  expect(css.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
  const image = await fetch(`${url}/char/girl-14-0.png`, {
    headers: { 'X-Origin-Secret': 'origin-test-secret' },
  });
  expect(image.status).toBe(200);
  expect(image.headers.get('Content-Type')).toBe('image/png');
  const traversal = await fetch(`${url}/char/%2e%2e%2f%2e%2e%2fpackage.json`, {
    headers: { 'X-Origin-Secret': 'origin-test-secret' },
  });
  expect(traversal.status).toBe(404);
  // 보호 그림 폴더 이름을 %63har 처럼 바꿔 써도 정적 파일로 바로 주지 않아요(그림 보호 검사를 건너뛰지 못하게).
  const encoded = await fetch(`${url}/%63har/girl-14-0.png`, {
    headers: { 'X-Origin-Secret': 'origin-test-secret', 'Sec-Fetch-Dest': 'document', Referer: 'https://evil.example/' },
  });
  expect(encoded.status).not.toBe(200);
  // 다른 폴더를 거쳐 ..%2F로 그림 폴더에 들어가도 공개 파일로 주지 않아요.
  for (const sneaky of ['/x/..%2Fchar/girl-14-0.png', '/x/..%5Cchar/girl-14-0.png', '/styles.css/..%2F..%2Fchar/girl-14-0.png']) {
    const res = await fetch(`${url}${sneaky}`, {
      headers: { 'X-Origin-Secret': 'origin-test-secret', 'Sec-Fetch-Dest': 'document', Referer: 'https://evil.example/' },
    });
    expect(res.headers.get('Content-Type') ?? '', sneaky).not.toContain('image');
  }

  // 슬래시를 겹치거나 %2F·%2f로 써도 그림 확인을 거쳐요(2026-11-21 점검: 전에는 200 image/png로 바로 나갔어요).
  for (const odd of ['//char/girl-14-0.png', '/%2Fchar/girl-14-0.png', '/%2fchar/girl-14-0.png', '/%5Cchar/girl-14-0.png']) {
    const res = await fetch(`${url}${odd}`, {
      headers: { 'X-Origin-Secret': 'origin-test-secret', 'Sec-Fetch-Dest': 'document', Referer: 'https://evil.example/' },
    });
    expect(res.headers.get('Content-Type') ?? '', odd).not.toContain('image');
    expect(res.status, odd).not.toBe(200);
  }
  // 우리 화면에서 부른 그림은 다르게 써도 그대로 보여요
  const odd = await fetch(`${url}//char/girl-14-0.png`, { headers: { 'X-Origin-Secret': 'origin-test-secret' } });
  expect(odd.status).toBe(200);
  expect(odd.headers.get('Content-Type')).toBe('image/png');
  const cross = await fetch(`${url}/char/girl-14-0.png`, { headers: { 'X-Origin-Secret': 'origin-test-secret', 'Sec-Fetch-Site': 'cross-site' } });
  expect(cross.status).toBe(403);

  // 문지기 뒤에서도 실제 주소(PUBLIC_URL) 기준으로 같은 사이트 요청을 알아봐요(내부 주소로 비교하면 모든 POST가 막혀요).
  const sameSite = await fetch(`${url}/auth/logout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: 'https://dogam.example', 'X-Origin-Secret': 'origin-test-secret' },
  });
  expect(sameSite.status).toBe(302);
  const crossSite = await fetch(`${url}/auth/logout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: 'https://evil.example', 'X-Origin-Secret': 'origin-test-secret' },
  });
  expect(crossSite.status).toBe(403);

  const synced = await fetch(`${url}/api/bot/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer bot-test-secret',
      'X-Origin-Secret': 'origin-test-secret',
    },
    body: JSON.stringify({
      batch_id: `${new Date().toISOString()}-node-test`,
      members: [
        {
          id: '111111111111111111',
          name: '노드테스트',
          avatar_url: null,
          joined_at: null,
          is_newbie: false,
        },
      ],
    }),
  });
  expect(synced.status).toBe(200);
  expect(await synced.json()).toEqual({ ok: true, result: 'applied', burning: null });
  expect(await active.database.prepare('SELECT display_name FROM members').first()).toEqual({ display_name: '노드테스트' });
});
