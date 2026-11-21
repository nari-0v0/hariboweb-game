// 다시 푸는 판(재수사·오늘의 사건, vr > 0)에서 쓰는 수수께끼 (나리 2026-11-21: 「답이랑 수수께끼가 달라져야」 → 「숫자만 바꾸기」).
// - 글 문제·줄 세우기·손으로 푸는 장치 일부: escape-bank-re-data.ts 에 숫자·조건을 바꾼 새 판을 적어 뒀어요.
// - 칸 판 장치(스위치·길·숫자 칸·칸 고르기·색칠·땅 나누기·블록 밀기 등): 판을 좌우·상하로 뒤집거나 대각선으로 돌려 놓고,
//   색칠·스도쿠는 색·숫자도 바꿔요. 정답 기록도 같이 바꿔서, 처음 판의 답을 그대로 넣으면 틀려요.
// - 시계 문제는 원래 판마다 시각이 새로 섞여요. 물건 찾기 카드는 escape-gen 에서 다른 물건을 골라요.
import type { BankItem } from './escape-bank';
import { RE_OVER } from './escape-bank-re-data';
import type { Ui } from './escape-ui';

type Flip = 'lr' | 'ud' | 'tr';
// 문장이 「왼쪽 위」「오른쪽 출구」처럼 방향을 말하는 판은 그 말이 그대로 맞는 쪽으로만 돌려요.
const FLIP: Record<string, Flip> = {
  'lights-cross': 'lr', 'lights-x': 'lr', 'lights-knight': 'lr', 'lights-ring': 'lr', 'lights-color': 'lr', 'lights-picture': 'lr',
  'jump-peg': 'lr', 'rotate-pipe': 'lr', 'rotate-beam': 'ud',
  'path-onestroke': 'lr', 'path-maze': 'tr', 'path-knight': 'tr', 'path-order': 'lr', 'path-stars': 'lr', 'path-zigzag': 'lr', 'path-loop': 'lr', 'path-kingcross': 'lr',
  'num-magic': 'lr', 'num-fillomino': 'lr', 'num-sudoku6': 'lr', 'num-futoshiki': 'lr', 'num-kenken': 'lr', 'num-pyramid': 'lr', 'num-sky': 'lr', 'num-chain': 'lr', 'num-noconsec': 'lr', 'num-suguru': 'lr', 'num-kakuro': 'tr', 'num-killer': 'lr',
  'mark-queens': 'lr', 'mark-tents': 'lr', 'mark-ships': 'lr', 'mark-nonogram': 'lr', 'mark-twins': 'lr', 'mark-binary': 'lr', 'mark-akari': 'lr', 'mark-hitori': 'lr', 'mark-mines': 'lr',
  'color-map3': 'lr', 'color-map4': 'lr', 'divide-same4': 'lr', 'divide-five': 'lr', 'divide-two': 'lr',
  'slide-rush': 'ud', 'slide-ice': 'lr', 'slide-ice2': 'lr', 'slide-iceexit': 'ud', 'slide-push': 'lr',
};
// 판을 뒤집으면 문장이 달라지는 곳
const FIX: Record<string, Partial<BankItem>> = {
  'jump-peg': { q: '4×4 구슬 판에 구슬 15개가 있고 한 칸만 비어 있어요. 구슬은 가로·세로로 바로 옆 구슬을 뛰어넘어 빈칸에 갈 수 있고, 뛰어넘긴 구슬은 빠져요. 마지막에 아랫줄 둘째 칸에 구슬 하나만 남기세요.' },
  'path-kingcross': { q: '왕(♚)이 4×4 판 오른쪽 위에서 왼쪽 아래까지 모든 칸을 한 번씩 밟아요. 가로·세로·대각선으로 한 칸씩 가는데, 대각선 걸음 두 개가 X자로 엇갈리면 안 돼요. 대각선 걸음은 꼭 네 번 이상 써야 해요.' },
  'path-zigzag': { hint: '계단 모양(가로 한 칸, 세로 한 칸, 가로 한 칸…)이 기본 걸음이에요. 벽 앞에서는 지그재그로 돌아가요.' },
};
// 색칠·스도쿠는 색·숫자 이름도 바꿔요(1→2→3…).
const SHIFT: Record<string, number> = { 'color-map3': 1, 'color-map4': 2, 'num-sudoku6': 1 };

const OVER = new Map(RE_OVER.map((o) => [o.idea, o]));

type G = { w: number; h: number; f: Flip };
const W = (g: G) => (g.f === 'tr' ? g.h : g.w);
const H = (g: G) => (g.f === 'tr' ? g.w : g.h);
const cell = (g: G, c: number) => {
  const x = c % g.w, y = Math.floor(c / g.w);
  const [nx, ny] = g.f === 'lr' ? [g.w - 1 - x, y] : g.f === 'ud' ? [x, g.h - 1 - y] : [y, x];
  return ny * W(g) + nx;
};
// 칸마다 값이 있는 배열(또는 글자열)을 새 판 자리로 옮겨요.
function grid<T>(g: G, arr: readonly T[]): T[] {
  const out: T[] = new Array(arr.length);
  arr.forEach((v, c) => (out[cell(g, c)] = v));
  return out;
}
const gstr = (g: G, s: string) => grid(g, [...s]).join('');
const cells = (g: G, cs: readonly number[]) => cs.map((c) => cell(g, c));
const dot = (g: G, v: string) => (v ? v.split('.').map((c) => String(cell(g, Number(c)))).join('.') : v);
const dxy = (g: G, [dx, dy]: [number, number]): [number, number] => (g.f === 'lr' ? [-dx, dy] : g.f === 'ud' ? [dx, -dy] : [dy, dx]);
const DIR: Record<Flip, Record<string, string>> = { lr: { L: 'R', R: 'L', U: 'U', D: 'D' }, ud: { L: 'L', R: 'R', U: 'D', D: 'U' }, tr: { L: 'U', U: 'L', R: 'D', D: 'R' } };
const shift = (k: number, n: number, d: string) => (/^[1-9]$/.test(d) && Number(d) <= n ? String(((Number(d) - 1 + k) % n) + 1) : d);

// 관 모양(위 1, 오른쪽 2, 아래 4, 왼쪽 8)과 시계 방향 돌리기 — escape-ui 와 같아요.
const PIPE: Record<string, number> = { I: 5, L: 3, T: 7, X: 15, E: 1, S: 1, '.': 0 };
const turn = (m: number, r: number) => {
  let x = m;
  for (let i = 0; i < r % 4; i++) x = ((x << 1) | (x >> 3)) & 15;
  return x;
};
const mirrorMask = (f: Flip, m: number) => {
  const b = (k: number) => (m & k ? 1 : 0);
  const [u, r, d, l] = [b(1), b(2), b(4), b(8)];
  const [nu, nr, nd, nl] = f === 'lr' ? [u, l, d, r] : f === 'ud' ? [d, r, u, l] : [l, d, r, u];
  return nu | (nr << 1) | (nd << 2) | (nl << 3);
};

// 처음 판 ui 와 답을 뒤집은 판으로 바꿔요.
export function flipUi(u: Ui, a: string, f: Flip, k = 0): { ui: Ui; a: string } {
  if (!('w' in u) || !('h' in u)) throw new Error(`판이 아니에요: ${u.t}`);
  const g: G = { w: u.w, h: u.h, f };
  const wh = { w: W(g), h: H(g) };
  switch (u.t) {
    case 'lights':
      return { ui: { ...u, ...wh, init: gstr(g, u.init), goal: gstr(g, u.goal), shape: u.shape.map((d) => dxy(g, d)) }, a: dot(g, a) };
    case 'jump':
      return { ui: { ...u, ...wh, init: gstr(g, u.init), goal: gstr(g, u.goal), holes: cells(g, u.holes) }, a: a.split('.').map((m) => m.split('-').map((c) => cell(g, Number(c))).join('-')).join('.') };
    case 'rotate': {
      const n = u.w * u.h;
      const rot = (s: string) => {
        const out = [...s];
        for (let i = 0; i < n; i++) {
          const t = u.tiles[i]!;
          let r = Number(s[i]);
          if (u.mode === 'pipe') {
            const want = mirrorMask(f, turn(PIPE[t] ?? 0, r));
            r = [0, 1, 2, 3].find((q) => turn(PIPE[t] ?? 0, q) === want) ?? r;
          } else if (t === 'M' && f !== 'tr') r = (r + 1) % 4; // 거울은 좌우·상하로 뒤집으면 ╱ ↔ ╲
          out[i] = String(r);
        }
        return gstr(g, out.join(''));
      };
      return { ui: { ...u, ...wh, tiles: gstr(g, u.tiles), rot: rot(u.rot), ...(u.fixed ? { fixed: gstr(g, u.fixed) } : {}) }, a: rot(a) };
    }
    case 'path': {
      const c1 = (c: number | undefined) => (c === undefined ? undefined : cell(g, c));
      const ui: Ui = { ...u, ...wh };
      if (u.blocked) ui.blocked = cells(g, u.blocked);
      if (u.walls) ui.walls = u.walls.map(([p, q]) => [cell(g, p), cell(g, q)]);
      if (u.start !== undefined) ui.start = c1(u.start);
      if (u.end !== undefined) ui.end = c1(u.end);
      if (u.marks) ui.marks = grid(g, u.marks);
      if (u.must) ui.must = cells(g, u.must);
      if (u.inOrder) ui.inOrder = cells(g, u.inOrder);
      return { ui, a: dot(g, a) };
    }
    case 'numgrid': {
      // 답은 -1(칸 아님)을 뺀 칸들을 차례로 적은 글자열이에요.
      const open = u.given.map((v, i) => (v === -1 ? -1 : i)).filter((i) => i >= 0);
      const given2 = grid(g, u.given);
      const ans = (s: string) => {
        const full: string[] = new Array(u.w * u.h).fill('');
        open.forEach((c, j) => (full[c] = shift(k, u.max, s[j]!)));
        const moved = grid(g, full);
        return moved.filter((_, i) => given2[i] !== -1).join('');
      };
      const ui: Ui = { ...u, ...wh, given: grid(g, u.given.map((v) => (typeof v === 'number' && v > 0 ? Number(shift(k, u.max, String(v))) : v))), answer: ans(u.answer) };
      if (u.answers) ui.answers = u.answers.map(ans);
      if (u.marks) ui.marks = grid(g, u.marks).map((m) => (m && f === 'tr' ? m.replace(/[↓→]/g, (x) => (x === '↓' ? '→' : '↓')) : m));
      if (u.cages) ui.cages = u.cages.map((c) => ({ ...c, cells: cells(g, c.cells).sort((p, q) => p - q) }));
      if (u.ineq) {
        ui.ineq = u.ineq.map(([p, q, op]) => {
          const [np, nq] = [cell(g, p), cell(g, q)];
          return np < nq ? [np, nq, op] : [nq, np, op === '<' ? '>' : '<'];
        });
      }
      return { ui, a: ans(a) };
    }
    case 'mark': {
      const ui: Ui = { ...u, ...wh, cells: grid(g, u.cells), answer: gstr(g, u.answer) };
      if (u.answers) ui.answers = u.answers.map((s) => gstr(g, s));
      if (u.text) ui.text = grid(g, u.text);
      if (u.regions) ui.regions = grid(g, u.regions);
      if (f === 'tr') throw new Error('칸 고르기는 대각선으로 돌리지 않아요');
      const rev = (s: string) => s.split(' ').reverse().join(' ');
      const revCol = (s: string) => s.split('\n').reverse().join('\n');
      if (f === 'lr') {
        if (u.rowClues) ui.rowClues = u.rowClues.map(rev);
        if (u.colClues) ui.colClues = [...u.colClues].reverse();
      } else {
        if (u.rowClues) ui.rowClues = [...u.rowClues].reverse();
        if (u.colClues) ui.colClues = u.colClues.map(revCol);
      }
      return { ui, a: gstr(g, a) };
    }
    case 'color': {
      // 칠해 둔 나라가 없는 지도는 한 나라를 칠해 둬요(아무 색칠이나 맞으면 처음 판의 답도 맞아 버려요).
      const given = u.given ? Object.fromEntries(Object.entries(u.given).map(([r, c]) => [r, Number(shift(k, u.colors, String(c)))])) : { 0: Number(shift(k, u.colors, a[0]!)) };
      return { ui: { ...u, ...wh, regions: grid(g, u.regions), given }, a: [...a].map((d) => shift(k, u.colors, d)).join('') };
    }
    case 'divide':
      return { ui: { ...u, ...wh, marks: grid(g, u.marks), ...(u.holes ? { holes: cells(g, u.holes) } : {}) }, a: gstr(g, a) };
    case 'slide': {
      if (f === 'tr') throw new Error('블록 밀기는 대각선으로 돌리지 않아요');
      const pos = (x: number, y: number, pw: number, ph: number): [number, number] => (f === 'lr' ? [u.w - x - pw, y] : [x, u.h - y - ph]);
      const pieces = u.pieces.map((p) => {
        const [x, y] = pos(p.x, p.y, p.w, p.h);
        return { ...p, x, y };
      });
      const goal = Object.fromEntries(Object.entries(u.goal).map(([id, [x, y]]) => {
        const p = u.pieces.find((q) => q.id === id)!;
        return [id, pos(x, y, p.w, p.h)];
      }));
      const exit = u.exit ? { ...u.exit, side: DIR[f][u.exit.side] as 'R' | 'L' | 'U' | 'D' } : undefined;
      const ui: Ui = { ...u, pieces, goal, ...(u.walls ? { walls: cells(g, u.walls) } : {}), ...(exit ? { exit } : {}) };
      return { ui, a: a.split('.').map((m) => m[0] + DIR[f][m[1]!]!).join('.') };
    }
  }
  throw new Error(`뒤집을 수 없는 판이에요: ${(u as Ui).t}`);
}

// 다시 푸는 판에서 쓸 수수께끼. 바꿀 게 없는 것(시계·카드)은 그대로 돌려줘요.
export function reItem(b: BankItem): BankItem {
  const o = OVER.get(b.idea);
  if (o) {
    const { idea: _i, ui, ...rest } = o;
    return { ...b, ...rest, ...(ui && b.ui ? { ui: { ...b.ui, ...ui } as Ui } : {}) };
  }
  const f = FLIP[b.idea];
  if (f && b.ui && b.a !== undefined) {
    const { ui, a } = flipUi(b.ui, b.a, f, SHIFT[b.idea] ?? 0);
    return { ...b, ...FIX[b.idea], ui, a };
  }
  return b;
}
