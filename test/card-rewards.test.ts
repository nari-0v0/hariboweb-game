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
    expect(nextCardReward(0)).toEqual({ cards: 5, jelly: 1, title: '수집가' });
    expect(nextCardReward(5)?.cards).toBe(10);
    expect(nextCardReward(100)).toBeNull();
  });
});
