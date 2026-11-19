import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));
import app from '../src/index';
import { signSession } from '../src/crypto';
import type { Env } from '../src/env';
import { activityOn, isActivityLaunch, rewriteForActivity } from '../src/activity';

function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (query: string, args: unknown[] = []) => ({
    query,
    args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => ({ results: sql.prepare(query).all(...(args as never[])) }),
    first: async () => sql.prepare(query).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }),
  });
  return { sql, db: { prepare: (q: string) => stmt(q), batch: async (list: { run: () => Promise<unknown> }[]) => Promise.all(list.map((s) => s.run())) } as unknown as D1Database };
}

const A = '100000000000000001';
const CLIENT = '1420027662830669925';
const ACT = `https://${CLIENT}.discordsays.com`;
const LAUNCH = '/?instance_id=i-1&frame_id=f-1&platform=desktop&guild_id=1&channel_id=2';

function env(on: boolean, db?: D1Database): Env {
  return {
    DB: db ?? fakeD1().db,
    SESSION_SECRET: 'test',
    DISCORD_CLIENT_ID: CLIENT,
    DISCORD_CLIENT_SECRET: 'secret',
    GUILD_ID: '1261363193519935550',
    PUBLIC_URL: 'http://localhost',
    DISCORD_ACTIVITY: on ? '1' : undefined,
  } as Env;
}

afterEach(() => vi.unstubAllGlobals());

describe('디스코드 액티비티 도우미', () => {
  it('스위치는 1일 때만 켜져요', () => {
    expect(activityOn({ DISCORD_ACTIVITY: undefined })).toBe(false);
    expect(activityOn({ DISCORD_ACTIVITY: '' })).toBe(false);
    expect(activityOn({ DISCORD_ACTIVITY: '0' })).toBe(false);
    expect(activityOn({ DISCORD_ACTIVITY: '1' })).toBe(true);
  });
  it('디스코드가 붙여 준 값이 다 있어야 액티비티 첫 화면이에요', () => {
    expect(isActivityLaunch({ frame_id: 'f', instance_id: 'i', platform: 'mobile' })).toBe(true);
    expect(isActivityLaunch({ frame_id: 'f', instance_id: 'i' })).toBe(false);
    expect(isActivityLaunch({ frame_id: 'f', instance_id: 'i', platform: 'tv' })).toBe(false);
  });
  it('프로필 사진 주소를 디스코드 프록시 주소로 바꾸고 스크립트를 붙여요', () => {
    const html = '<html lang="ko"><head><title>x</title></head><body><img src="https://cdn.discordapp.com/avatars/1/a.png"></body></html>';
    const out = rewriteForActivity(html, '<script src="/x.js"></script>');
    expect(out).toContain('src="/.proxy/cdn/avatars/1/a.png"');
    expect(out).toContain('<html lang="ko" class="in-activity">');
    expect(out).toContain('<script src="/x.js"></script></head>');
  });
});

describe('디스코드 액티비티 화면', () => {
  it('스위치가 꺼져 있으면 지금 웹과 똑같아요', async () => {
    const res = await app.request(LAUNCH, {}, env(false));
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('activity-boot');
    expect((await app.request('/activity/login', { method: 'POST', headers: { Origin: ACT, 'Content-Type': 'application/json' }, body: '{"code":"x"}' }, env(false))).status).toBe(404);
    expect((await app.request('/activity/check', {}, env(false))).status).toBe(404);
  });

  it('스위치가 꺼져 있으면 hsa 쿠키로는 로그인되지 않아요', async () => {
    const { sql, db } = fakeD1();
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at, gender_chosen_at) VALUES (?, 'a', 1, 'x', 'x')").run(A);
    const session = await signSession('test', { uid: A, exp: Date.now() + 60_000 });
    const res = await app.request('/alerts', { headers: { Cookie: `hsa=${session}` } }, env(false, db));
    expect(res.status).toBe(302);
  });

  it('켜져 있으면 🚀 첫 화면이 디스코드 로그인 화면이에요', async () => {
    const res = await app.request(LAUNCH, {}, env(true));
    const html = await res.text();
    expect(html).toContain('id="activity-boot"');
    expect(html).toContain(`data-client-id="${CLIENT}"`);
    expect(html).toContain('/discord-activity.js?v=');
  });

  it('디스코드 안 주소에서 온 code로 로그인하면 칸 전용 쿠키를 넣어요', async () => {
    const { db } = fakeD1();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/oauth2/token')) {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get('code')).toBe('good');
        expect(body.has('redirect_uri')).toBe(false);
        return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      }
      if (url.includes('/users/@me/guilds/')) return new Response(JSON.stringify({ user: { id: A, username: 'a' } }), { status: 200 });
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await app.request('/activity/login', { method: 'POST', headers: { Origin: ACT, 'Content-Type': 'application/json' }, body: '{"code":"good"}' }, env(true, db));
    expect(res.status).toBe(200);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^hsa=/);
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Partitioned');
    expect(cookie).toContain('HttpOnly');
  });

  it('하리보 서버 멤버가 아니면 not_member', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/oauth2/token') ? new Response(JSON.stringify({ access_token: 'tok' })) : new Response('', { status: 404 })));
    const res = await app.request('/activity/login', { method: 'POST', headers: { Origin: ACT, 'Content-Type': 'application/json' }, body: '{"code":"good"}' }, env(true));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_member' });
  });

  it('다른 사이트에서 보낸 로그인 요청은 거절해요', async () => {
    const res = await app.request('/activity/login', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"code":"good"}' }, env(true));
    expect(res.status).toBe(403);
  });

  it('hsa 쿠키로 들어오면 화면에 디스코드 안 표시와 스크립트가 붙고, 사진 주소가 바뀌어요', async () => {
    const { sql, db } = fakeD1();
    sql.prepare("INSERT INTO members (user_id, display_name, avatar_url, active, updated_at, gender_chosen_at) VALUES (?, 'a', 'https://cdn.discordapp.com/avatars/1/a.png', 1, 'x', 'x')").run(A);
    const session = await signSession('test', { uid: A, exp: Date.now() + 60_000 });
    const res = await app.request('/alerts', { headers: { Cookie: `hsa=${session}` } }, env(true, db));
    expect(res.headers.get('Location')).toBeNull();
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="in-activity"');
    expect(html).toContain('discord-activity.js?v=');
    expect(html).not.toContain('https://cdn.discordapp.com/');
    expect((await (await app.request('/activity/check', { headers: { Cookie: `hsa=${session}` } }, env(true, db))).json())).toEqual({ in: true });
  });

  it('디스코드 안 주소에서 보낸 멤버 POST도 받아요', async () => {
    const { sql, db } = fakeD1();
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at, gender_chosen_at) VALUES (?, 'a', 1, 'x', 'x')").run(A);
    const session = await signSession('test', { uid: A, exp: Date.now() + 60_000 });
    const req = (e: Env) => app.request('/alerts/clear', { method: 'POST', headers: { Cookie: `hsa=${session}`, Origin: ACT } }, e);
    expect((await req(env(true, db))).status).not.toBe(403);
    expect((await req(env(false, db))).status).toBe(403);
  });
});
