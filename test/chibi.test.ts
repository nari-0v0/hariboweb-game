import { describe, expect, it } from 'vitest';
import { chibiSig, chibiSvg, H, makeChibi, pickUniqueCharacter, W } from '../src/chibi';

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(700000000000000000n + BigInt(i) * 987654321n));

describe('chibi characters', () => {
  it('draws the same character for the same id', () => {
    expect(chibiSvg('123456789012345678')).toBe(chibiSvg('123456789012345678'));
    expect(makeChibi('123456789012345678').pixels).toHaveLength(W * H);
  });

  it('varies a lot even before deduplication', () => {
    expect(new Set(ids(300).map(chibiSig)).size).toBeGreaterThanOrEqual(295);
  });

  it('gives every member a different character after deduplication', () => {
    const taken = new Set<string>();
    for (const id of ids(1000)) {
      const { sig } = pickUniqueCharacter(id, taken);
      expect(taken.has(sig)).toBe(false);
      taken.add(sig);
    }
    expect(taken.size).toBe(1000);
  });
});
