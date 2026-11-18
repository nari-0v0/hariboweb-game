import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';
import { signSession } from '../src/crypto';
import { dbLimitKind, maintenanceOn, maintenanceWhen } from '../src/maintenance';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

const dbThrowing = (msg: string) => ({
  prepare() {
    throw new Error(msg);
  },
}) as unknown as D1Database;
const LIMIT = 'D1_ERROR: Exceeded maximum daily rows read';

async function asMember(path: string, env: Env) {
  const cookie = await signSession('s', { uid: '100000000000000001', exp: Date.now() + 60_000 });
  return app.request(path, { headers: { Cookie: `hs=${cookie}` } }, env);
}

describe('문제 생겼을 때 화면', () => {
  it('MAINTENANCE에 시간을 적으면 점검 화면에 그 시간이 나와요(503). 봇 API는 503 글자', async () => {
    const env = { MAINTENANCE: '11월 20일 22:00~23:00', DB: dbThrowing(LIMIT), SESSION_SECRET: 's' } as unknown as Env;
    const page = await app.request('/me', {}, env);
    expect(page.status).toBe(503);
    expect(page.headers.get('Retry-After')).toBe('600');
    const html = await page.text();
    expect(html).toContain('점검 중이에요!');
    expect(html).toContain('11월 20일 22:00~23:00 점검할 예정이에요!');
    expect(html).toContain('조금 더 오래 걸릴 수 있으니 조금만 기다려 주세요.');
    const bot = await app.request('/api/bot/titles', {}, env);
    expect(bot.status).toBe(503);
  });

  it('MAINTENANCE=1이면 시간 줄 없이 점검 화면', async () => {
    const env = { MAINTENANCE: '1', DB: dbThrowing(LIMIT), SESSION_SECRET: 's' } as unknown as Env;
    const html = await (await app.request('/guide', {}, env)).text();
    expect(html).toContain('점검 중이에요!');
    expect(html).not.toContain('점검할 예정이에요');
  });

  it('스위치가 꺼져 있으면 평소대로', async () => {
    for (const v of [undefined, '', '0']) {
      const env = { MAINTENANCE: v, DB: dbThrowing(LIMIT), SESSION_SECRET: 's' } as unknown as Env;
      expect((await app.request('/guide', {}, env)).status).toBe(200);
    }
  });

  it('DB 한도에 닿으면 "DB가 가득 찼어요!"', async () => {
    const res = await asMember('/', { DB: dbThrowing(LIMIT), SESSION_SECRET: 's' } as unknown as Env);
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain('DB가 가득 찼어요!');
    expect(html).toContain('방장에게 도움을 요청하세요!');
    expect(html).toContain('아침 9시');
  });

  it('저장 용량이 차면 아침 9시 안내는 빼요', async () => {
    const res = await asMember('/', { DB: dbThrowing('D1_ERROR: Exceeded maximum DB size.'), SESSION_SECRET: 's' } as unknown as Env);
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain('DB가 가득 찼어요!');
    expect(html).not.toContain('아침 9시');
  });

  it('멤버가 누른 폼(/api/…)도 점검 화면으로 보여요(봇 API만 글자)', async () => {
    const env = { MAINTENANCE: '1', DB: dbThrowing(LIMIT), SESSION_SECRET: 's' } as unknown as Env;
    const res = await app.request('/api/titles/buy', { method: 'POST', body: new URLSearchParams({ title: 'x' }) }, env);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('점검 중이에요!');
  });

  it('그 밖의 오류는 "오류가 생겼어요!"', async () => {
    const res = await asMember('/', { DB: dbThrowing('D1_ERROR: no such column: x'), SESSION_SECRET: 's' } as unknown as Env);
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).toContain('오류가 생겼어요!');
    expect(html).toContain('방장에게 도움을 요청하세요!');
  });

  it('판단 규칙', () => {
    expect(dbLimitKind(new Error(LIMIT))).toBe('daily');
    expect(dbLimitKind(new Error('D1_ERROR: Exceeded maximum DB size.'))).toBe('storage');
    expect(dbLimitKind(new Error('D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'))).toBe(null);
    expect(dbLimitKind(new Error('D1_ERROR: D1 DB is overloaded. Too many requests queued.'))).toBe(null);
    expect(dbLimitKind(new Error('D1_ERROR: no such column: x'))).toBe(null);
    expect(dbLimitKind(new Error('Exceeded something, not D1'))).toBe(null);
    expect(dbLimitKind(LIMIT)).toBe(null);
    expect(maintenanceOn('1')).toBe(true);
    expect(maintenanceOn('OFF')).toBe(false);
    expect(maintenanceWhen('1')).toBe('');
    expect(maintenanceWhen(' 22:00~23:00 ')).toBe('22:00~23:00');
  });
});
