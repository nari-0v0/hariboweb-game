import { describe, expect, it } from 'vitest';
import { ESCAPE_CASES, escapeUnlockIndex } from '../src/escape';
import { escapeNeed, journeyNeed, journeyOpenTo, meets, needText, type DogamProgress } from '../src/unlock';

const p = (cards: number, levels: number[] = []): DogamProgress => ({ cards, levels });

describe('도감으로 원정대·사건파일 열기', () => {
  it('원정대 1~3장은 그냥, 그 뒤는 카드 장 수, 더 깊으면 카드 레벨도 필요해요', () => {
    expect(journeyOpenTo(p(0))).toBe(3);
    expect(journeyOpenTo(p(10))).toBe(4);
    expect(journeyOpenTo(p(30))).toBe(6);
    expect(journeyOpenTo(p(35, [10, 10, 12, 14, 14]))).toBe(7);
    expect(journeyOpenTo(p(55, [20, 20, 20, 20, 20]))).toBe(9);
    expect(journeyOpenTo(p(55, [15, 15, 15, 15, 19]))).toBe(8);
    expect(journeyNeed(1).cards).toBe(0);
    expect(meets(journeyNeed(7), p(45, [10, 10]))).toBe(false);
  });
  it('사건파일은 입문 사건 포함 처음 5개가 무료, 뒤로 갈수록 조건이 올라가요', () => {
    const free = ESCAPE_CASES.filter((c) => escapeNeed(escapeUnlockIndex(c.id)).cards === 0);
    expect(free).toHaveLength(5);
    expect(ESCAPE_CASES.filter((c) => c.level === 1).every((c) => free.includes(c))).toBe(true);
    const needs = ESCAPE_CASES.map((c) => escapeNeed(escapeUnlockIndex(c.id)).cards);
    expect(Math.max(...needs)).toBe(55);
    for (const c of ESCAPE_CASES) expect(escapeUnlockIndex(c.id)).toBeGreaterThanOrEqual(0);
  });
  it('조건 글에 지금 몇 장인지도 보여 줘요', () => {
    expect(needText({ cards: 20, lv: 10, lvCards: 3 }, p(12, [11]))).toBe('도감 카드 20장 (지금 12장) · Lv10 이상 카드 3장 (지금 1장)');
  });
});
