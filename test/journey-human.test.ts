import { describe, expect, it } from 'vitest';
import { HUMAN_EVERY, humanCode, humanOk, humanWords, needsHuman } from '../src/journey-human';

describe('원정대 사람 확인', () => {
  it('오늘 50판째마다 물어봐요', () => {
    expect(needsHuman(0)).toBe(false);
    expect(needsHuman(HUMAN_EVERY - 1)).toBe(false);
    expect(needsHuman(HUMAN_EVERY)).toBe(true);
    expect(needsHuman(HUMAN_EVERY + 1)).toBe(false);
    expect(needsHuman(HUMAN_EVERY * 2)).toBe(true);
  });
  it('같은 사람·날·판 수면 같은 숫자, 바뀌면 다른 숫자', async () => {
    const a = await humanCode('s', 'u1', '2026-11-18', 50);
    expect(a).toMatch(/^\d{4}$/);
    expect(await humanCode('s', 'u1', '2026-11-18', 50)).toBe(a);
    const others = await Promise.all([humanCode('s', 'u2', '2026-11-18', 50), humanCode('s', 'u1', '2026-11-19', 50), humanCode('s', 'u1', '2026-11-18', 100), humanCode('t', 'u1', '2026-11-18', 50)]);
    expect(others.some((o) => o !== a)).toBe(true);
  });
  it('한글로 보여 주고 숫자로 받아요(띄어쓰기·전각 숫자 괜찮음)', () => {
    expect(humanWords('4709')).toBe('사 칠 영 구');
    expect(humanOk('4709', '4709')).toBe(true);
    expect(humanOk('4709', ' 4 7 0 9 ')).toBe(true);
    expect(humanOk('4709', '４７０９')).toBe(true);
    expect(humanOk('4709', '사 칠 영 구')).toBe(false);
    expect(humanOk('4709', '4708')).toBe(false);
    expect(humanOk('4709', undefined)).toBe(false);
  });
});
