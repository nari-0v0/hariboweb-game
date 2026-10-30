import { describe, expect, it } from 'vitest';
import { chibiSvg, H, makeChibi, W } from '../src/chibi';

describe('chibi characters', () => {
  it('draws the same character for the same id', () => {
    expect(chibiSvg('123456789012345678')).toBe(chibiSvg('123456789012345678'));
  });

  it('gives 300 members 300 different characters', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const { pixels } = makeChibi(String(700000000000000000n + BigInt(i) * 987654321n));
      expect(pixels).toHaveLength(W * H);
      seen.add(pixels.join(','));
    }
    expect(seen.size).toBe(300);
  });
});
