import { describe, expect, it } from 'vitest';
import { DAILY_OPEN } from '../src/escape-daily';
import { beginDaily, dailyInfo } from '../src/escape-db';

// 나리 허락 전까지 오늘의 사건은 꺼져 있어요(합쳐도 화면에 안 보이고 시작도 안 돼요).
describe('오늘의 사건 스위치', () => {
  it('기본값은 꺼짐이고, 꺼져 있으면 DB를 건드리지 않아요', async () => {
    expect(DAILY_OPEN).toBe(false);
    const db = { prepare: () => { throw new Error('DB를 쓰면 안 돼요'); } } as unknown as D1Database;
    expect(await dailyInfo(db, 'me')).toBeNull();
    expect(await beginDaily(db, 'me')).toBeNull();
  });
});
