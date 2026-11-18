import { describe, expect, it } from 'vitest';
import { BANK } from '../src/escape-bank';

// 2026-11-18: 다른 사건과 겹치던 수수께끼 11개를 아무도 안 푼 사건 쪽에서 새 문제로 바꿨어요.
const puzzle = (id: string) => BANK.find((b) => b.idea === id)!;

describe('겹치던 수수께끼 바꾸기', () => {
  it('바꾼 옛 문제는 은행에 없어요', () => {
    for (const old of ['num-frame', 'num-sudoku4', 'tz031', 'tz123', 'tz001', 'tz093', 'tz164', 'tz169', 'tz064', 'tz074', 'tz100']) {
      expect(BANK.some((b) => b.idea === old), old).toBe(false);
    }
  });

  it('조각 나누기(필로미노) 정답은 규칙에 맞고 주어진 숫자와 같아요', () => {
    const b = puzzle('num-fillomino');
    const u = b.ui as Extract<NonNullable<typeof b.ui>, { t: 'numgrid' }>;
    const g = [...u.answer].map(Number);
    const W = u.w, N = u.w * u.h;
    u.given.forEach((x, i) => x !== null && expect(g[i]).toBe(x));
    const nb = (i: number) => [i - W, i + W, i % W ? i - 1 : -1, i % W < W - 1 ? i + 1 : -1].filter((j) => j >= 0 && j < N);
    const seen = new Set<number>();
    for (let i = 0; i < N; i++) {
      if (seen.has(i)) continue;
      const comp = [i];
      seen.add(i);
      for (let k = 0; k < comp.length; k++) for (const d of nb(comp[k]!)) if (!seen.has(d) && g[d] === g[i]) (seen.add(d), comp.push(d));
      expect(comp.length, `칸 ${i}`).toBe(g[i]);
    }
  });

  it('이어지는 수 떼어 놓기 문제는 답 네 개가 모두 규칙에 맞아요', () => {
    const b = puzzle('num-noconsec');
    const u = b.ui as Extract<NonNullable<typeof b.ui>, { t: 'numgrid' }>;
    const cells = u.given.flatMap((x, i) => (x === -1 ? [] : [i]));
    for (const ans of u.answers!) {
      const v = new Map(cells.map((c, k) => [c, Number(ans[k])]));
      expect([...v.values()].sort().join('')).toBe('12345678');
      for (const a of cells) for (const c of cells) {
        const near = a !== c && Math.abs((a % u.w) - (c % u.w)) <= 1 && Math.abs(Math.floor(a / u.w) - Math.floor(c / u.w)) <= 1;
        if (near) expect(Math.abs(v.get(a)! - v.get(c)!), ans).not.toBe(1);
      }
    }
  });

  it('글 문제 답을 다시 계산해도 같아요', () => {
    // 책 낱장: 1..n 합 − (2k−1 + 2k) = 15000
    const torn: number[] = [];
    for (let n = 2; n < 400; n++) for (let k = 1; 2 * k <= n; k++) if ((n * (n + 1)) / 2 - (4 * k - 1) === 15000) torn.push(2 * k - 1);
    expect(torn).toEqual([Number(puzzle('torn-leaf').a)]);
    // 젤리 더미: 다섯 번 「5로 나눠 1 남김, 한 몫 숨김」 뒤 남은 것이 5로 나누어떨어지는 가장 작은 수
    const okPile = (n: number) => {
      for (let i = 0; i < 5; i++) {
        if (n % 5 !== 1) return false;
        n = ((n - 1) / 5) * 4;
      }
      return n > 0 && n % 5 === 0;
    };
    let pile = 1;
    while (!okPile(pile)) pile++;
    expect(String(pile)).toBe(puzzle('monkey-jelly').a);
    // 완벽한 섞기 52장
    const start = Array.from({ length: 52 }, (_, i) => i);
    let deck = start, times = 0;
    do {
      deck = deck.slice(0, 26).flatMap((x, i) => [x, deck[26 + i]!]);
      times++;
    } while (deck.join() !== start.join());
    expect(String(times)).toBe(puzzle('faro').a);
    // 연꽃: (d+1)² = d² + 3²
    expect(String([...Array(50).keys()].find((d) => d > 0 && (d + 1) ** 2 === d * d + 9))).toBe(puzzle('lotus').a);
  });
});
