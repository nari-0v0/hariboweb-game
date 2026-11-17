import { describe, expect, it } from 'vitest';
import { CARD_JELLY, nextCardReward } from '../src/card-rewards';
import { TITLES } from '../src/titles';

describe('도감 카드 장수 보상 표', () => {
  it('도감 칭호 단계와 같은 장수예요', () => {
    const steps = TITLES.filter((t) => t.rule.kind === 'cards').map((t) => (t.rule as { count: number }).count);
    expect(CARD_JELLY.map(([n]) => n)).toEqual(steps);
  });
  it('처음엔 빡빡하게: 다 모아도 16개', () => {
    expect(CARD_JELLY.reduce((a, [, j]) => a + j, 0)).toBe(16);
  });
  it('다음 단계와 칭호 이름', () => {
    expect(nextCardReward(0, new Set())).toEqual({ cards: 5, jelly: 1, title: '수집가', waiting: false });
    // 받은 기록으로 골라요: 5장 받은 뒤 상대가 떠나 4장이어도 다음은 10장
    expect(nextCardReward(4, new Set([5]))?.cards).toBe(10);
    // 장수는 채웠지만 아직 안 받았으면 기다리는 중
    expect(nextCardReward(12, new Set([5]))).toMatchObject({ cards: 10, waiting: true });
    expect(nextCardReward(120, new Set([5, 10, 15, 20, 30, 40, 50, 60, 80]))).toMatchObject({ cards: 100, waiting: true });
    expect(nextCardReward(100, new Set([5, 10, 15, 20, 30, 40, 50, 60, 80, 100]))).toBeNull();
  });
});
