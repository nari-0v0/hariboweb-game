import { describe, expect, it } from 'vitest';
import { levelFromXp, levelName, progress, tierEffects, tierFor, xpForLevel } from '../src/levels';

describe('levels', () => {
  it('starts at level 1 and reaches each threshold exactly', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(-5)).toBe(1);
    for (let l = 1; l <= 100; l++) {
      expect(levelFromXp(xpForLevel(l))).toBe(l);
      if (l > 1) expect(levelFromXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
  });

  it('caps at 100', () => {
    expect(levelFromXp(10_000_000)).toBe(100);
    expect(progress(10_000_000)).toMatchObject({ level: 100, next: null, ratio: 1 });
  });

  it('names and tiers follow the plan', () => {
    expect([1, 10, 30, 60, 100].map(levelName)).toEqual(['첫 만남', '친구', '절친', '단짝', '평생 단짝']);
    expect([9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(tierFor)).toEqual([
      'plain', 'silver', 'gold', 'mint', 'sky', 'lavender', 'rose', 'sunset', 'night', 'ruby', 'legend',
    ]);
    expect(tierEffects(9)).toEqual([]);
    expect(tierEffects(10)).toEqual(['ring-silver']);
    expect(tierEffects(75)).toEqual(['ring-gold', 'fx-sparkle', 'fx-shine']);
  });

  it('takes about two years at one hour (60 XP) a day', () => {
    const days = xpForLevel(100) / 60;
    expect(days).toBeGreaterThan(700);
    expect(days).toBeLessThan(760);
  });

  it('reports progress inside a level', () => {
    const p = progress(xpForLevel(3) + 5);
    expect(p.level).toBe(3);
    expect(p.next).toBe(xpForLevel(4));
    expect(p.ratio).toBeCloseTo(5 / (xpForLevel(4) - xpForLevel(3)));
  });
});
