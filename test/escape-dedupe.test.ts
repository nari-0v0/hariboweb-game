import { describe, expect, it } from 'vitest';
import { BANK } from '../src/escape-bank';

// 2026-11-18: 다른 사건과 겹치던 수수께끼 11개를 아무도 안 푼 사건 쪽에서, 이어서 양쪽 다 푼 짝 7개도 새 문제로 바꿨어요.
const puzzle = (id: string) => BANK.find((b) => b.idea === id)!;

describe('겹치던 수수께끼 바꾸기', () => {
  it('바꾼 옛 문제는 은행에 없어요', () => {
    for (const old of ['num-frame', 'num-sudoku4', 'tz031', 'tz123', 'tz001', 'tz093', 'tz164', 'tz169', 'tz064', 'tz074', 'tz100', 'num-triangle', 'num-crosssum', 'tz186', 'tz191', 'tz032', 'tz154', 'tz171']) {
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

  it('숫자 낱말 퍼즐은 단서에 맞는 답이 하나뿐이에요', () => {
    const sq = (n: number) => Number.isInteger(Math.sqrt(n));
    const cube = (n: number) => [125, 216, 343, 512, 729].includes(n);
    const nums = Array.from({ length: 900 }, (_, i) => i + 100).filter((n) => !String(n).includes('0'));
    const dec = (n: number) => { const s = String(n); return s[0]! > s[1]! && s[1]! > s[2]!; };
    const inc = (n: number) => { const s = String(n); return s[0]! < s[1]! && s[1]! < s[2]!; };
    const found: string[] = [];
    for (const a of nums.filter(sq)) for (const b of nums.filter(dec)) for (const c of nums.filter((n) => n % 11 === 0)) {
      const g = `${a}${b}${c}`;
      const col = (j: number) => Number(g[j]! + g[3 + j]! + g[6 + j]!);
      if (inc(col(0)) && cube(col(1)) && col(2) % 9 === 0) found.push(g);
    }
    expect(found).toEqual([puzzle('num-crossnumber').a]);
  });

  it('구역 숫자(스구루) 정답은 규칙에 맞고 답이 하나뿐이에요', () => {
    const b = puzzle('num-suguru');
    const u = b.ui as Extract<NonNullable<typeof b.ui>, { t: 'numgrid' }>;
    const W = 5, N = 25;
    const reg = new Array<number>(N);
    u.cages!.forEach((c, k) => c.cells.forEach((x) => (reg[x] = k)));
    const size = (i: number) => u.cages![reg[i]!]!.cells.length;
    const near = (i: number) => {
      const out: number[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const x = (i % W) + dx, y = Math.floor(i / W) + dy;
        if ((dx || dy) && x >= 0 && y >= 0 && x < W && y < 5) out.push(y * W + x);
      }
      return out;
    };
    const g = u.given.map((x) => (x === null || x === -1 ? 0 : x));
    const sols: string[] = [];
    const ok = (i: number, v: number) => v <= size(i) && !u.cages![reg[i]!]!.cells.some((j) => j !== i && g[j] === v) && !near(i).some((j) => g[j] === v);
    const rec = (i: number): void => {
      if (sols.length > 1) return;
      if (i === N) return void sols.push(g.join(''));
      if (g[i]) return ok(i, g[i]!) ? rec(i + 1) : undefined;
      for (let v = 1; v <= size(i); v++) if (ok(i, v)) (g[i] = v, rec(i + 1), (g[i] = 0));
    };
    rec(0);
    expect(sols).toEqual([u.answer]);
  });

  it('여섯 자리 abcabc 수와 배 만나기 답을 다시 계산해도 같아요', () => {
    let gcd = 0;
    const f = (a: number, b: number): number => (b ? f(b, a % b) : a);
    for (let n = 100; n < 1000; n++) gcd = f(gcd, n * 1001);
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23].filter((p) => gcd % p === 0);
    expect(String(Math.max(...primes))).toBe(puzzle('abcabc').a);
    // 오늘 떠난 배(0~7일)와 t일에 B를 떠난 배는 (t+7)/2일에 만나요. 0 < 그때 < 7 이고 상대 배도 바다 위여야 해요.
    let met = 0;
    for (let t = -20; t <= 20; t++) {
      const s = (t + 7) / 2;
      if (s > 0 && s < 7 && s > t && s < t + 7) met++;
    }
    expect(String(met)).toBe(puzzle('ships-meet').a);
  });
});
