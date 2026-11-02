import { describe, expect, it } from 'vitest';
import { QUESTS, type GroupCtx } from '../src/quests';
import { touchVisit } from '../src/db';

describe('전체 리뷰 3회차 고침', () => {
  it('짝꿍 퀘스트는 사람 수로 만들 수 있는 짝보다 많이 요구하지 않아요', () => {
    const q = QUESTS.find((x) => x.id === 'pairs:35')!;
    const ctx = { startSize: 7, current: ['1', '2', '3', '4', '5', '6', '7'] } as unknown as GroupCtx;
    expect(q.target(ctx)).toBe(21);
    const big = { startSize: 10, current: Array.from({ length: 10 }, (_, i) => String(i)) } as unknown as GroupCtx;
    expect(q.target(big)).toBe(35);
  });

  it('로그인한 채로 들어와도 한 시간에 한 번 들어온 때를 남겨요', async () => {
    const runs: unknown[][] = [];
    const db = {
      prepare: () => ({ bind: (...a: unknown[]) => ({ run: async () => { runs.push(a); return { meta: { changes: 1 } }; } }) }),
    } as unknown as D1Database;
    const now = Date.parse('2026-11-10T00:00:00Z');
    const m = { user_id: 'u', last_login_at: '2026-11-09T23:30:00.000Z' } as never;
    await touchVisit(db, m, now);
    expect(runs).toHaveLength(0);
    await touchVisit(db, { user_id: 'u', last_login_at: '2026-10-01T00:00:00.000Z' } as never, now);
    await touchVisit(db, { user_id: 'u', last_login_at: null } as never, now);
    expect(runs).toEqual([['2026-11-10T00:00:00.000Z', 'u'], ['2026-11-10T00:00:00.000Z', 'u']]);
  });
});
