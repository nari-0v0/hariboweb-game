import { describe, expect, it, vi } from 'vitest';
import { beginDaily, dailyInfo } from '../src/escape-db';

// 스위치(DAILY_OPEN)를 끄면 오늘의 사건은 화면에 안 보이고 시작도 안 돼요(나리 2026-11-19에 켰어요). 다시 끌 때를 위해 시험해 둬요.
vi.mock('../src/escape-daily', async (orig) => ({ ...(await orig<typeof import('../src/escape-daily')>()), DAILY_OPEN: false }));
describe('오늘의 사건 스위치', () => {
  it('꺼져 있으면 DB를 건드리지 않아요', async () => {
    const db = { prepare: () => { throw new Error('DB를 쓰면 안 돼요'); } } as unknown as D1Database;
    expect(await dailyInfo(db, 'me')).toBeNull();
    expect(await beginDaily(db, 'me')).toBeNull();
  });
});
