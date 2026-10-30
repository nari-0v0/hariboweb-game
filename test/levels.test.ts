import { describe, expect, it } from 'vitest';
import { levelFromXp, levelName, progress, tierFor, xpForLevel } from '../src/levels';

describe('levels', () => {
  it('starts at level 1 and reaches each threshold exactly', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(-5)).toBe(1);
    for (let l = 1; l <= 50; l++) {
      expect(levelFromXp(xpForLevel(l))).toBe(l);
      if (l > 1) expect(levelFromXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
  });

  it('caps at 50', () => {
    expect(levelFromXp(10_000_000)).toBe(50);
    expect(progress(10_000_000)).toMatchObject({ level: 50, next: null, ratio: 1 });
  });

  it('names and tiers follow the plan', () => {
    expect([1, 5, 10, 20].map(levelName)).toEqual(['첫 만남', '친구', '절친', '단짝']);
    expect([4, 5, 10, 20, 30, 50].map(tierFor)).toEqual(['plain', 'silver', 'gold', 'sparkle', 'holo', 'legend']);
  });

  it('reports progress inside a level', () => {
    const p = progress(xpForLevel(3) + 25);
    expect(p.level).toBe(3);
    expect(p.next).toBe(xpForLevel(4));
    expect(p.ratio).toBeCloseTo(25 / (xpForLevel(4) - xpForLevel(3)));
  });
});
