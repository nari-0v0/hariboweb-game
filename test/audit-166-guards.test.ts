import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';
import { markRefunded, settleNickJob, settleService } from '../src/db';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (query: string, args: unknown[] = []) => ({
    query, args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => ({ results: sql.prepare(query).all(...(args as never[])) }),
    first: async () => sql.prepare(query).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }),
  });
  const db = { prepare: (q: string) => stmt(q), batch: async (list: ReturnType<typeof stmt>[]) => list.map((s) => ({ meta: { changes: Number(sql.prepare(s.query).run(...(s.args as never[])).changes) } })) };
  return { sql, db: db as unknown as D1Database };
}

const SITE = 'http://localhost';
const post = (path: string, headers: Record<string, string>) =>
  app.request(`${SITE}${path}`, { method: 'POST', headers }, { DB: { prepare: () => { throw new Error('no db'); } } } as unknown as Env);

describe('W04 다른 사이트에서 온 POST 막기', () => {
  it('다른 사이트 Origin이면 403이에요', async () => {
    expect((await post('/alerts/clear', { Origin: 'https://evil.example' })).status).toBe(403);
  });
  it('Origin이 없어도 Sec-Fetch-Site가 cross-site면 403이에요', async () => {
    expect((await post('/alerts/clear', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  });
  it('Origin이 없어도 Referer가 다른 사이트면 403이에요', async () => {
    expect((await post('/api/me/profile', { Referer: 'https://evil.example/page' })).status).toBe(403);
  });
  it('같은 사이트 요청은 로그인 확인으로 넘어가요', async () => {
    expect((await post('/alerts/clear', { Origin: SITE })).status).toBe(401);
    expect((await post('/alerts/clear', { 'Sec-Fetch-Site': 'same-origin' })).status).toBe(401);
    expect((await post('/alerts/clear', { Referer: `${SITE}/alerts` })).status).toBe(401);
  });
  it('로그아웃도 다른 사이트 요청은 막아요', async () => {
    expect((await post('/auth/logout', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  });
});

const bot = (path: string, body: unknown, db: D1Database) =>
  app.request(path, {
    method: 'POST', headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, { DB: db, BOT_SYNC_SECRET: 's' } as unknown as Env);

describe('W17 봇 API 크기 제한', () => {
  it('동기화가 아닌 봇 API는 256 KiB를 넘으면 413이에요', async () => {
    const { db } = fakeD1();
    const res = await bot('/api/bot/ai-logs/posted', { ids: [1], pad: 'x'.repeat(300 * 1024) }, db);
    expect(res.status).toBe(413);
  });
});

describe('W18/W19 축하 완료 입력', () => {
  it.each([
    [{ a: '200000000000000002', b: '100000000000000001', level: 10 }],
    [{ a: '100000000000000001', b: '100000000000000001', level: 10 }],
    [{ a: '100000000000000001', b: '200000000000000002', level: 15 }],
  ])('반대 방향·같은 사람·10의 배수가 아닌 레벨은 400이에요 %#', async (body) => {
    const { db } = fakeD1();
    expect((await bot('/api/bot/cheers', body, db)).status).toBe(400);
  });
});

describe('W27–W29 없는 번호는 404', () => {
  it('없는 디스코드 물건·닉네임 작업·환불 번호는 404, 이미 처리한 번호는 200 changed:false예요', async () => {
    const { db, sql } = fakeD1();
    expect(await settleService(db, 'nope', true, null)).toBeNull();
    expect(await settleNickJob(db, 'nope', true, null)).toBeNull();
    expect(await markRefunded(db, 'nope')).toBeNull();
    expect((await bot('/api/bot/services/nope', { ok: true }, db)).status).toBe(404);
    expect((await bot('/api/bot/nicks/nope', { ok: true }, db)).status).toBe(404);
    expect((await bot('/api/bot/refunds/nope', {}, db)).status).toBe(404);
    expect((await bot('/api/bot/refunds/bad%20id', {}, db)).status).toBe(400);

    sql.prepare("INSERT INTO members (user_id, display_name, updated_at) VALUES ('1', 'a', 'x')").run();
    sql.prepare("INSERT INTO purchases (id, user_id, item_id, price, status, created_at, refund) VALUES ('p1', '1', 'theme:rose', 5, 'done', 'x', 'pending')").run();
    const first = await bot('/api/bot/refunds/p1', {}, db);
    expect(await first.json()).toEqual({ ok: true, changed: true });
    const again = await bot('/api/bot/refunds/p1', {}, db);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, changed: false });
  });
});

it('W18 축하 순서는 목록과 같은 문자열 비교예요(자릿수가 달라도)', async () => {
  const { db } = fakeD1();
  // 문자열로는 '2000…'(17자리) > '1000…'(18자리)지만 숫자로는 반대예요. 목록은 문자열 기준이에요.
  const res = await bot('/api/bot/cheers', { a: '100000000000000001', b: '20000000000000002', level: 10 }, db);
  expect(res.status).toBe(200);
});
