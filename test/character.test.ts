import { describe, expect, it } from 'vitest';
import { CHARACTER_TOTAL, characterUrl, fallbackCharacter, isCharacterId, pickCharacter, poolOf, shouldRepick } from '../src/character';
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
    expect(characterUrl('girl-07-3', '123')).toBe('/char/girl-07-3.png');
    expect(characterUrl('basic-boy-0', '123')).toBe(`/char/${fallbackCharacter('123')}.png`);
  });

  it('never moves a member off a character they already have (only missing or removed art)', () => {
    expect(shouldRepick('girl-07-0')).toBe(false);
    // 여분 색이어도, 빈 디자인이 생겨도 저절로 안 바뀌어요(나리 2026-11-17)
    expect(shouldRepick('girl-07-2')).toBe(false);
    expect(shouldRepick('basic-boy-0')).toBe(true);
    expect(shouldRepick(null)).toBe(true);
  });

  it('picks inside the chosen girl or boy pool', () => {
    const taken = new Set<string>();
    for (const id of ids(60)) {
      const c = pickCharacter(id, taken, 'boy');
      expect(poolOf(c)).toBe('boy');
      expect(isCharacterId(c)).toBe(true);
      taken.add(c);
    }
    // 소년 50명이 다 차면 소년 여분 색으로 넘어가요
    expect([...taken].filter((c) => c.endsWith('-0')).length).toBe(50);
    expect(shouldRepick('boy-01-2')).toBe(false);
  });
});
