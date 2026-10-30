import { describe, expect, it } from 'vitest';
import { CHARACTER_TOTAL, characterUrl, fallbackCharacter, isCharacterId, pickCharacter } from '../src/character';
import { CHARACTERS } from '../src/characters';

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(700000000000000000n + BigInt(i) * 987654321n));

describe('member characters', () => {
  it('gives the first members all different base characters in their original colors', () => {
    const taken = new Set<string>();
    for (const id of ids(CHARACTERS.length)) taken.add(pickCharacter(id, taken));
    expect([...taken].every((c) => c.endsWith('-0'))).toBe(true);
    expect(taken.size).toBe(CHARACTERS.length);
  });

  it('never repeats a character until all variants are used', () => {
    const taken = new Set<string>();
    for (const id of ids(CHARACTER_TOTAL)) {
      const c = pickCharacter(id, taken);
      expect(taken.has(c)).toBe(false);
      expect(isCharacterId(c)).toBe(true);
      taken.add(c);
    }
    expect(taken.size).toBe(CHARACTER_TOTAL);
    expect(isCharacterId(pickCharacter('1', taken))).toBe(true);
  });

  it('falls back to a stable character', () => {
    expect(fallbackCharacter('123')).toBe(fallbackCharacter('123'));
    expect(characterUrl('nope-99', '123')).toBe(`/char/${fallbackCharacter('123')}.png`);
    expect(characterUrl('frog-3', '123')).toBe('/char/frog-3.png');
  });
});
