import { describe, expect, it } from 'vitest';
import { byCode, comma } from '../src/num';

describe('숫자 쉼표·글자 비교', () => {
  it('toLocaleString(ko-KR)과 같은 쉼표', () => {
    for (const n of [0, 7, 999, 1000, 12345, -1234567, 50000, 1234.5, 98765432101]) expect(comma(n)).toBe(n.toLocaleString('ko-KR'));
  });
  it('가나다·숫자 순서', () => {
    expect(['나', '가', '다'].sort(byCode)).toEqual(['가', '나', '다']);
    expect(byCode('2026-01-01', '2026-01-02')).toBe(-1);
    expect(byCode('a', 'a')).toBe(0);
  });
});
