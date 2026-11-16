import { describe, expect, it } from 'vitest';
import { QUESTS, type GroupCtx } from '../src/quests';
import { questProgress } from '../src/season';

describe('전체 리뷰 5회차 고침', () => {
  it('작은 모둠에서는 같이 통화할 모둠원 수를 모둠 크기에 맞춰요', () => {
    const ids = ['1', '2', '3', '4', '5'];
    const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => ({ group_no: 0, a, b, minutes: 60 })));
    const ctx = { startSize: 5, current: ids, startCurrent: ids, pairs } as unknown as GroupCtx;
    for (const id of ['partners:5', 'partners:5:5', 'partners:7:5']) {
      const q = QUESTS.find((x) => x.id === id)!;
      expect(questProgress(q, ctx).done).toBe(true);
    }
    expect(QUESTS.find((x) => x.id === 'partners:5')!.text(5, ctx)).toBe('모둠원 모두가 모둠원 4명 이상과 통화');
    // 큰 모둠은 그대로 5명이 필요해요
    const big = Array.from({ length: 10 }, (_, i) => String(i + 1));
    const bigCtx = { startSize: 10, current: big, startCurrent: big, pairs } as unknown as GroupCtx;
    expect(questProgress(QUESTS.find((x) => x.id === 'partners:5')!, bigCtx).done).toBe(false);
  });

  it('사람이 빠져 줄어든 모둠도 남은 사람 수에 맞춰요', () => {
    const left = ['1', '2', '3', '4'];
    const pairs = left.flatMap((a, i) => left.slice(i + 1).map((b) => ({ group_no: 0, a, b, minutes: 60 })));
    // 처음 10명 중 6명이 나가고 4명 남음: 각자 남은 3명과 통화하면 깨요
    const ctx = { startSize: 10, current: left, startCurrent: left, pairs } as unknown as GroupCtx;
    expect(questProgress(QUESTS.find((x) => x.id === 'partners:5')!, ctx).done).toBe(true);
  });

  it('단짝 만들기도 만들 수 있는 짝 수보다 많이 요구하지 않아요', () => {
    const q = QUESTS.find((x) => x.id === 'pairs60:10')!;
    // 2명 모둠은 짝이 1쌍뿐이에요
    expect(q.target({ startSize: 2, current: ['1', '2'] } as unknown as GroupCtx)).toBe(1);
  });
});
