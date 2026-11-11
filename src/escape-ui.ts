// 사건파일 조작 퍼즐: 화면에서 직접 움직여 푸는 레이튼식 문제들.
// 화면(public/escape-ui.js)은 움직임을 기록해 답(v)으로 보내고, 여기서 처음부터 다시 따라가 정답인지 확인해요.
// 답이 여러 가지일 수 있는 문제(블록 밀기, 강 건너기 등)도 규칙만 맞으면 정답이에요.
// 움직임 기록은 '.'으로 이어요(예: "AR.BU.AL").

export type Cell = number; // 왼쪽 위부터 가로로 0, 1, 2…

export type Ui =
  // 블록 밀기: 조각을 위아래·좌우로 밀어요. ice=멈출 때까지 미끄러짐, push=P만 움직이고 앞의 상자를 밀어요
  | { t: 'slide'; w: number; h: number; pieces: Piece[]; walls?: Cell[]; goal: Record<string, [number, number]>; ice?: boolean; push?: boolean; max?: number; exit?: { id: string; side: 'R' | 'L' | 'U' | 'D' } }
  // 물 붓기: 병 a에서 b로 따르기(넘치기 전까지), F=수도에서 가득, E=버리기
  | { t: 'pour'; names: string[]; cap: number[]; init: number[]; goal: { jug?: number; amount?: number; state?: number[]; any?: number }; fill?: boolean; empty?: boolean; max?: number }
  // 강 건너기: 배에 태울 사람을 고르면 반대편으로 건너요
  | { t: 'river'; items: { id: string; name: string; emoji: string; w?: number; time?: number }[]; cap: number; rowers?: string[]; rules?: RiverRule[]; maxW?: number; limit?: number; max?: number; place?: [string, string]; boat?: string }
  // 스위치: 칸을 누르면 정해진 모양으로 켜고 꺼져요(mod 3이면 색이 세 가지로 돌아요)
  | { t: 'lights'; w: number; h: number; init: string; shape: [number, number][]; goal: string; mod?: number; max?: number; skin?: string }
  // 성냥개비: 막대를 옮겨 식을 맞춰요
  | { t: 'match'; glyphs: string; moves: number; mode: 'move' | 'remove' | 'add'; goal?: 'true' | string }
  // 저울·시소: 추(아이)를 자리마다 놓아 균형을 맞춰요
  | { t: 'balance'; items: { name: string; w: number }[]; arms: number[]; left?: { name: string; w: number; at: number }; useAll?: boolean; maxUse?: number; distinct?: boolean; count?: number }
  // 길 긋기: 칸을 이어 길을 만들어요
  | { t: 'path'; w: number; h: number; blocked?: Cell[]; walls?: [Cell, Cell][]; start?: Cell; end?: Cell; all?: boolean; step: 'orth' | 'king' | 'knight'; marks?: (string | null)[]; must?: Cell[]; inOrder?: Cell[]; max?: number; noStraight?: boolean; turnEvery?: boolean; loop?: boolean; noCross?: boolean }
  // 타일 돌리기: 관(또는 거울)을 돌려 이어요
  | { t: 'rotate'; w: number; h: number; tiles: string; rot: string; mode: 'pipe' | 'beam'; fixed?: string }
  // 쌓기: 탑·시험관·팬케이크
  | { t: 'stacks'; stacks: string[][]; rule: 'hanoi' | 'color' | 'free' | 'flip'; cap?: number; goal: string[][] | 'sorted'; adj?: boolean; max?: number; names?: string[] }
  // 숫자 칸 채우기: 정답 하나(만들 때 확인)와 비교해요
  | { t: 'numgrid'; w: number; h: number; given: (number | null | -1)[]; max: number; min?: number; marks?: (string | null)[]; ineq?: [Cell, Cell, '<' | '>'][]; cages?: { cells: Cell[]; label: string }[]; answer: string }
  // 칸 고르기: 정답 하나(만들 때 확인)와 비교해요
  | { t: 'mark'; w: number; h: number; cells: (string | null)[]; text?: (string | null)[]; regions?: number[]; rowClues?: string[]; colClues?: string[]; icon: string; answer: string }
  // 여러 개 고르기
  | { t: 'multi'; options: string[]; answer: string }
  // 뛰어넘기: 개구리 자리 바꾸기, 페그 솔리테어
  | { t: 'jump'; w: number; h: number; holes: Cell[]; init: string; rule: 'frogs' | 'peg' | 'knight'; goal: string; max?: number; faces?: string[] }
  // 다이얼: 버튼마다 정해진 다이얼이 함께 돌아요
  | { t: 'dials'; faces: string[][]; init: number[]; buttons: { label: string; turns: number[] }[]; goal: number[]; max?: number }
  // 색칠: 맞닿은 구역은 다른 색
  | { t: 'color'; w: number; h: number; regions: number[]; colors: number; given?: Record<number, number>; extra?: 'rowsDiff' }
  // 땅 나누기: 칸을 묶어 똑같은 크기(모양) 조각으로 나눠요
  | { t: 'divide'; w: number; h: number; marks: (string | null)[]; parts: number; same?: boolean; holes?: Cell[] };

export type Piece = { id: string; x: number; y: number; w: number; h: number; axis: 'h' | 'v' | 'any'; label: string; color?: string; fixed?: boolean };
export type RiverRule = { all: string[]; none?: string[] } | { few: string[]; many: string[] };

const toks = (v: string) => (v ? v.split('.') : []);
const xy = (w: number, c: number): [number, number] => [c % w, Math.floor(c / w)];

// ── 블록 밀기 ──
function slide(u: Extract<Ui, { t: 'slide' }>, v: string): boolean {
  const ps = u.pieces.map((p) => ({ ...p }));
  const walls = new Set(u.walls ?? []);
  const D: Record<string, [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const occ = (x: number, y: number, skip: string) => ps.find((p) => p.id !== skip && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  const fits = (p: Piece, x: number, y: number) => {
    for (let i = 0; i < p.w; i++) for (let j = 0; j < p.h; j++) {
      const cx = x + i, cy = y + j;
      if (cx < 0 || cy < 0 || cx >= u.w || cy >= u.h || walls.has(cy * u.w + cx) || occ(cx, cy, p.id)) return false;
    }
    return true;
  };
  const moves = toks(v);
  if (u.max && moves.length > u.max) return false;
  for (const m of moves) {
    const p = ps.find((q) => q.id === m[0]);
    const d = D[m[1] ?? ''];
    if (!p || !d || m.length !== 2 || p.fixed) return false;
    if (u.push && p.id !== 'P') return false;
    if (p.axis === 'h' && d[1]) return false;
    if (p.axis === 'v' && d[0]) return false;
    // 출구: 목표 조각이 출구 쪽 벽을 넘어 나가면 끝
    if (u.exit && p.id === u.exit.id && m[1] === u.exit.side) {
      let x = p.x, y = p.y;
      while (fits(p, x + d[0], y + d[1])) (x += d[0]), (y += d[1]);
      const out = u.exit.side === 'R' ? x + p.w === u.w : u.exit.side === 'L' ? x === 0 : u.exit.side === 'D' ? y + p.h === u.h : y === 0;
      if (out && m === moves.at(-1)) return true;
    }
    let steps = 0;
    do {
      const nx = p.x + d[0], ny = p.y + d[1];
      if (u.push) {
        const box = occ(nx, ny, p.id);
        if (box) {
          if (box.fixed || !fits(box, box.x + d[0], box.y + d[1])) break;
          box.x += d[0];
          box.y += d[1];
        }
      }
      if (!fits(p, nx, ny)) break;
      p.x = nx;
      p.y = ny;
      steps++;
    } while (u.ice);
    if (!steps) return false;
  }
  if (u.exit) return false;
  return Object.entries(u.goal).every(([id, [x, y]]) => {
    const p = ps.find((q) => q.id === id);
    return p && p.x === x && p.y === y;
  });
}

// ── 물 붓기 ──
function pour(u: Extract<Ui, { t: 'pour' }>, v: string): boolean {
  const s = [...u.init];
  const moves = toks(v);
  if (u.max && moves.length > u.max) return false;
  for (const m of moves) {
    const a = Number(m[1]), b = Number(m[1]);
    if (m.length !== 2 || !(a >= 0 && a < s.length)) return false;
    if (m[0] === 'F') {
      if (!u.fill) return false;
      s[a] = u.cap[a]!;
    } else if (m[0] === 'E') {
      if (!u.empty) return false;
      s[a] = 0;
    } else {
      const from = Number(m[0]);
      if (!(from >= 0 && from < s.length) || from === b) return false;
      const k = Math.min(s[from]!, u.cap[b]! - s[b]!);
      if (!k) return false;
      s[from]! -= k;
      s[b]! += k;
    }
  }
  const g = u.goal;
  if (g.state) return g.state.every((x, i) => x === s[i]);
  if (g.jug !== undefined) return s[g.jug] === g.amount;
  if (g.any !== undefined) return s.includes(g.any);
  return false;
}

// ── 강 건너기 ──
function river(u: Extract<Ui, { t: 'river' }>, v: string): boolean {
  const ids = u.items.map((i) => i.id);
  const right = new Set<string>();
  let side = 0; // 0 = 배가 왼쪽
  let time = 0;
  const loads = toks(v);
  if (u.max && loads.length > u.max) return false;
  const bad = (bank: string[]) =>
    (u.rules ?? []).some((r) => ('all' in r ? r.all.every((x) => bank.includes(x)) && !(r.none ?? []).some((x) => bank.includes(x)) : r.few.filter((x) => bank.includes(x)).length > 0 && r.many.filter((x) => bank.includes(x)).length > r.few.filter((x) => bank.includes(x)).length));
  for (const load of loads) {
    const who = [...load];
    if (!who.length || who.length > u.cap || new Set(who).size !== who.length) return false;
    if (who.some((x) => !ids.includes(x) || right.has(x) !== (side === 1))) return false;
    if (u.rowers && !who.some((x) => u.rowers!.includes(x))) return false;
    const item = (x: string) => u.items.find((i) => i.id === x)!;
    if (u.maxW && who.reduce((a, x) => a + (item(x).w ?? 0), 0) > u.maxW) return false;
    time += Math.max(...who.map((x) => item(x).time ?? 0));
    for (const x of who) side === 0 ? right.add(x) : right.delete(x);
    side = 1 - side;
    const L = ids.filter((x) => !right.has(x)), Rt = ids.filter((x) => right.has(x));
    if (bad(L) || bad(Rt)) return false;
  }
  if (u.limit !== undefined && time > u.limit) return false;
  return right.size === ids.length;
}

// ── 스위치 ──
function lights(u: Extract<Ui, { t: 'lights' }>, v: string): boolean {
  const mod = u.mod ?? 2;
  const s = [...u.init].map(Number);
  const moves = toks(v);
  if (u.max && moves.length > u.max) return false;
  for (const m of moves) {
    const c = Number(m);
    if (!/^\d+$/.test(m) || c >= u.w * u.h) return false;
    const [x, y] = xy(u.w, c);
    for (const [dx, dy] of u.shape) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < u.w && ny < u.h) s[ny * u.w + nx] = (s[ny * u.w + nx]! + 1) % mod;
    }
  }
  return s.join('') === u.goal;
}

// ── 성냥개비 ──
// 숫자 하나는 막대 일곱 자리(a 위, b 오른쪽 위, c 오른쪽 아래, d 아래, e 왼쪽 아래, f 왼쪽 위, g 가운데),
// 기호 하나는 막대 세 자리(가로 위, 세로, 가로 아래): '-' = 100, '+' = 110, '=' = 101.
export const SEG: Record<string, string> = { '0': '1111110', '1': '0110000', '2': '1101101', '3': '1111001', '4': '0110011', '5': '1011011', '6': '1011111', '7': '1110000', '8': '1111111', '9': '1111011' };
export const OPS: Record<string, string> = { '-': '100', '+': '110', '=': '101', ' ': '000' };
export const matchBits = (glyphs: string) => [...glyphs].map((g) => SEG[g] ?? OPS[g] ?? '').join('');
export function matchRead(glyphs: string, bits: string): string | null {
  let i = 0;
  let out = '';
  for (const g of glyphs) {
    const n = SEG[g] ? 7 : 3;
    const b = bits.slice(i, i + n);
    i += n;
    const hit = Object.entries(n === 7 ? SEG : OPS).find(([, x]) => x === b);
    if (!hit) return null;
    out += hit[0];
  }
  return out;
}
function equationTrue(e: string): boolean {
  const t = e.replace(/ /g, '');
  const parts = t.split('=');
  if (parts.length < 2 || parts.some((p) => !/^-?\d+([+-]\d+)*$/.test(p) || /^0\d/.test(p) || /[+-]0\d/.test(p))) return false;
  const val = (p: string) => (p.match(/-?\d+|[+-]\d+/g) ?? []).reduce((a, x) => a + Number(x), 0);
  const vs = parts.map(val);
  return vs.every((x) => x === vs[0]);
}
function match(u: Extract<Ui, { t: 'match' }>, v: string): boolean {
  const from = matchBits(u.glyphs);
  if (!new RegExp(`^[01]{${from.length}}$`).test(v)) return false;
  let off = 0, on = 0;
  for (let i = 0; i < from.length; i++) {
    if (from[i] === '1' && v[i] === '0') off++;
    if (from[i] === '0' && v[i] === '1') on++;
  }
  if (u.mode === 'move' ? !(off === u.moves && on === u.moves) : u.mode === 'remove' ? !(off === u.moves && on === 0) : !(on === u.moves && off === 0)) return false;
  const read = matchRead(u.glyphs, v);
  if (!read) return false;
  return !u.goal || u.goal === 'true' ? equationTrue(read) : read.replace(/ /g, '') === u.goal;
}

// ── 저울·시소 ── 답: 물건마다 놓은 자리(팔 번호, 0 = 안 씀). 팔 거리는 arms(왼쪽은 음수)
function balance(u: Extract<Ui, { t: 'balance' }>, v: string): boolean {
  if (v.length !== u.items.length || !/^[0-9]+$/.test(v)) return false;
  let m = u.left ? u.left.w * u.left.at : 0;
  let used = 0;
  for (let i = 0; i < v.length; i++) {
    const k = Number(v[i]);
    if (k > u.arms.length) return false;
    if (!k) continue;
    used++;
    m += u.items[i]!.w * u.arms[k - 1]!;
  }
  if (u.useAll && used !== u.items.length) return false;
  if (u.distinct && new Set([...v].filter((k) => k !== '0')).size !== used) return false;
  if (u.maxUse && used > u.maxUse) return false;
  if (u.count && used !== u.count) return false;
  return m === 0 && used > 0;
}

// ── 길 긋기 ──
function path(u: Extract<Ui, { t: 'path' }>, v: string): boolean {
  const cells = toks(v).map(Number);
  if (!cells.length || cells.some((c) => !Number.isInteger(c) || c < 0 || c >= u.w * u.h)) return false;
  const blocked = new Set(u.blocked ?? []);
  if (cells.some((c) => blocked.has(c))) return false;
  if (u.max && cells.length - 1 > u.max) return false;
  const wall = new Set((u.walls ?? []).flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]));
  const seen = new Set<number>();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (seen.has(c) && !(u.loop && i === cells.length - 1 && c === cells[0])) return false;
    seen.add(c);
    if (i) {
      const [ax, ay] = xy(u.w, cells[i - 1]!), [bx, by] = xy(u.w, c);
      const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
      const ok = u.step === 'orth' ? dx + dy === 1 : u.step === 'king' ? Math.max(dx, dy) === 1 : (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
      if (!ok || wall.has(`${cells[i - 1]}-${c}`)) return false;
      if (i >= 2) {
        const [px, py] = xy(u.w, cells[i - 2]!);
        const straight = ax - px === bx - ax && ay - py === by - ay;
        if (u.noStraight && straight) return false;
        if (u.turnEvery && straight) return false;
      }
    }
  }
  if (u.noCross && u.step === 'king') {
    const diag = new Set<string>();
    for (let i = 1; i < cells.length; i++) {
      const [ax, ay] = xy(u.w, cells[i - 1]!), [bx, by] = xy(u.w, cells[i]!);
      if (ax !== bx && ay !== by) {
        const other = `${Math.min(ax, bx)},${Math.min(ay, by)},${(bx - ax) * (by - ay) > 0 ? '/' : '\\'}`;
        const mine = `${Math.min(ax, bx)},${Math.min(ay, by)},${(bx - ax) * (by - ay) > 0 ? '\\' : '/'}`;
        if (diag.has(other)) return false;
        diag.add(mine);
      }
    }
  }
  if (u.start !== undefined && cells[0] !== u.start) return false;
  if (u.end !== undefined && cells.at(-1) !== u.end) return false;
  if (u.loop && (cells.at(-1) !== cells[0] || cells.length < 4)) return false;
  if (u.all) for (let c = 0; c < u.w * u.h; c++) if (!blocked.has(c) && !seen.has(c)) return false;
  if (u.must && u.must.some((c) => !seen.has(c))) return false;
  if (u.inOrder) {
    const idx = u.inOrder.map((c) => cells.indexOf(c));
    if (idx.some((k) => k < 0) || idx.some((k, i) => i && k < idx[i - 1]!)) return false;
  }
  return true;
}

// ── 타일 돌리기 ── 관 모양: 위(1) 오른쪽(2) 아래(4) 왼쪽(8) 열림. 돌리면 시계 방향으로 한 칸씩.
const PIPE: Record<string, number> = { I: 5, L: 3, T: 7, X: 15, E: 1, S: 1, '.': 0 };
const turn = (m: number, r: number) => {
  let x = m;
  for (let i = 0; i < r % 4; i++) x = ((x << 1) | (x >> 3)) & 15;
  return x;
};
function rotate(u: Extract<Ui, { t: 'rotate' }>, v: string): boolean {
  const n = u.w * u.h;
  if (!new RegExp(`^[0-3]{${n}}$`).test(v)) return false;
  for (let i = 0; i < n; i++) if (u.fixed?.[i] === '1' && v[i] !== u.rot[i]) return false;
  if (u.mode === 'pipe') {
    const open = (i: number) => turn(PIPE[u.tiles[i]!] ?? 0, Number(v[i]));
    const D = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]] as const;
    // 모든 관이 빈틈없이 이어지고(새는 곳 없음), 출발(S)에서 모든 끝(E)과 관에 닿아야 해요
    for (let i = 0; i < n; i++) {
      const [x, y] = xy(u.w, i);
      for (const [dx, dy, me, them] of D) {
        if (!(open(i) & me)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= u.w || ny >= u.h || !(open(ny * u.w + nx) & them)) return false;
      }
    }
    const start = u.tiles.indexOf('S');
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const i = q.pop()!;
      const [x, y] = xy(u.w, i);
      for (const [dx, dy, me] of D) {
        const j = (y + dy) * u.w + x + dx;
        if (open(i) & me && !seen.has(j)) seen.add(j), q.push(j);
      }
    }
    for (let i = 0; i < n; i++) if (u.tiles[i] !== '.' && !seen.has(i)) return false;
    return true;
  }
  // 빛: 왼쪽 위 바깥(L 칸의 왼쪽)에서 오른쪽으로 쏜 빛이 거울(/ \)에 꺾여 모든 별(*)을 지나 출구(E) 칸 밖으로 나가야 해요
  const mir = (i: number) => (u.tiles[i] === 'M' ? (Number(v[i]) % 2 ? '\\' : '/') : u.tiles[i]);
  let i = u.tiles.indexOf('L');
  let [dx, dy] = [1, 0];
  const lit = new Set<number>();
  for (let k = 0; k < 400; k++) {
    lit.add(i);
    const c = mir(i);
    if (c === '#') return false;
    if (c === '/') [dx, dy] = [-dy, -dx];
    else if (c === '\\') [dx, dy] = [dy, dx];
    if (c === 'E') return [...u.tiles].every((t, j) => t !== '*' || lit.has(j));
    const [x, y] = xy(u.w, i);
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= u.w || ny >= u.h) return false;
    i = ny * u.w + nx;
  }
  return false;
}

// ── 쌓기 ──
function stacks(u: Extract<Ui, { t: 'stacks' }>, v: string): boolean {
  const s = u.stacks.map((x) => [...x]);
  const moves = toks(v);
  if (u.max && moves.length > u.max) return false;
  for (const m of moves) {
    if (u.rule === 'flip') {
      const k = Number(m);
      const st = s[0]!;
      if (!Number.isInteger(k) || k < 2 || k > st.length) return false;
      s[0] = [...st.slice(0, st.length - k), ...st.slice(st.length - k).reverse()];
      continue;
    }
    const a = Number(m[0]), b = Number(m[1]);
    if (m.length !== 2 || !s[a] || !s[b] || a === b || !s[a]!.length) return false;
    if (u.adj && Math.abs(a - b) !== 1) return false;
    const top = s[a]!.at(-1)!, under = s[b]!.at(-1);
    if (u.cap && s[b]!.length >= u.cap) return false;
    if (u.rule === 'hanoi' && under !== undefined && Number(under) < Number(top)) return false;
    if (u.rule === 'color' && under !== undefined && under !== top) return false;
    s[b]!.push(s[a]!.pop()!);
  }
  if (u.goal === 'sorted') return s.every((st) => !st.length || (u.cap ? st.length === u.cap : true) && st.every((x) => x === st[0]));
  return u.goal.every((g, i) => g.join() === s[i]!.join());
}

// ── 뛰어넘기 ── 칸 상태: 0 빈칸, 1/2 말(개구리 두 편), 페그는 1만
function jump(u: Extract<Ui, { t: 'jump' }>, v: string): boolean {
  const s = [...u.init];
  const holes = new Set(u.holes);
  const moves = toks(v);
  if (u.max && moves.length > u.max) return false;
  for (const m of moves) {
    const [a, b] = m.split('-').map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b) || holes.has(a!) || holes.has(b!) || s[a!] === '0' || s[b!] !== '0') return false;
    const [ax, ay] = xy(u.w, a!), [bx, by] = xy(u.w, b!);
    const dx = bx - ax, dy = by - ay;
    if (u.rule === 'frogs') {
      // 1은 오른쪽(아래)으로, 2는 왼쪽(위)으로만. 한 칸 가거나 말 하나를 뛰어넘어요
      const dir = s[a!] === '1' ? 1 : -1;
      const along = u.h === 1 ? dx : dy;
      const across = u.h === 1 ? dy : dx;
      if (across || !(along === dir || along === 2 * dir)) return false;
      if (along === 2 * dir) {
        const mid = u.h === 1 ? a! + dir : a! + dir * u.w;
        if (s[mid] === '0') return false;
      }
    } else if (u.rule === 'knight') {
      // 나이트: ㄱ자로 빈칸에 가요
      if (!((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1))) return false;
    } else {
      // 페그: 가로·세로로 말 하나를 뛰어넘어 빈칸에 가고, 넘은 말은 빠져요
      if (!((Math.abs(dx) === 2 && !dy) || (Math.abs(dy) === 2 && !dx))) return false;
      const mid = (ay + dy / 2) * u.w + ax + dx / 2;
      if (s[mid] !== '1') return false;
      s[mid] = '0';
    }
    s[b!] = s[a!]!;
    s[a!] = '0';
  }
  return s.join('') === u.goal;
}

// ── 다이얼 ──
function dials(u: Extract<Ui, { t: 'dials' }>, v: string): boolean {
  const s = [...u.init];
  const moves = toks(v);
  if (u.max && moves.length > u.max) return false;
  for (const m of moves) {
    const b = u.buttons[Number(m)];
    if (!b || !/^\d+$/.test(m)) return false;
    b.turns.forEach((k, i) => (s[i] = (s[i]! + k + u.faces[i]!.length * 10) % u.faces[i]!.length));
  }
  return s.every((x, i) => x === u.goal[i]);
}

// ── 색칠 ──
function color(u: Extract<Ui, { t: 'color' }>, v: string): boolean {
  const n = Math.max(...u.regions) + 1;
  if (!new RegExp(`^[1-${u.colors}]{${n}}$`).test(v)) return false;
  for (const [r, c] of Object.entries(u.given ?? {})) if (v[Number(r)] !== String(c)) return false;
  for (let i = 0; i < u.regions.length; i++) {
    const [x, y] = xy(u.w, i);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx!, ny = y + dy!;
      if (nx >= u.w || ny >= u.h) continue;
      const a = u.regions[i]!, b = u.regions[ny * u.w + nx]!;
      if (a !== b && v[a] === v[b]) return false;
    }
  }
  if (u.extra === 'rowsDiff') {
    for (let y = 0; y < u.h; y++) {
      const row = new Set(Array.from({ length: u.w }, (_, x) => v[u.regions[y * u.w + x]!]));
      if (row.size !== Math.min(u.colors, new Set(Array.from({ length: u.w }, (_, x) => u.regions[y * u.w + x])).size)) return false;
    }
  }
  return true;
}

// ── 땅 나누기 ── 답: 칸마다 조각 번호(1~parts), 구멍 칸은 0
function divide(u: Extract<Ui, { t: 'divide' }>, v: string): boolean {
  const n = u.w * u.h;
  const holes = new Set(u.holes ?? []);
  if (v.length !== n || !/^[0-9]+$/.test(v)) return false;
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const g = Number(v[i]);
    if (holes.has(i) !== (g === 0)) return false;
    if (g > u.parts) return false;
    if (g) groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  if (groups.size !== u.parts) return false;
  const size = (n - holes.size) / u.parts;
  const shapes: string[] = [];
  for (const cells of groups.values()) {
    if (cells.length !== size) return false;
    if (cells.filter((c) => u.marks[c]).length !== 1) return false;
    const seen = new Set([cells[0]!]);
    const q = [cells[0]!];
    while (q.length) {
      const c = q.pop()!;
      const [x, y] = xy(u.w, c);
      for (const d of [-1, 1, -u.w, u.w]) {
        const j = c + d;
        const [jx] = xy(u.w, j);
        if (cells.includes(j) && !seen.has(j) && Math.abs(jx - x) + Math.abs(Math.floor(j / u.w) - y) === 1) seen.add(j), q.push(j);
      }
    }
    if (seen.size !== cells.length) return false;
    shapes.push(canon(cells.map((c) => xy(u.w, c))));
  }
  if (u.same && new Set(shapes).size !== 1) return false;
  // 모양이 같은 조각은 표시(marks)도 같은 종류여야 해요 — 표시 종류가 여러 가지면 조각마다 하나씩
  return true;
}
// 모양 비교: 돌리고 뒤집어 가장 작은 표현으로
function canon(pts: [number, number][]): string {
  const forms: string[] = [];
  let p = pts;
  for (let f = 0; f < 2; f++) {
    for (let r = 0; r < 4; r++) {
      p = p.map(([x, y]) => [y, -x]);
      const mx = Math.min(...p.map((q) => q[0])), my = Math.min(...p.map((q) => q[1]));
      forms.push(p.map(([x, y]) => `${x - mx},${y - my}`).sort().join(' '));
    }
    p = p.map(([x, y]) => [-x, y]);
  }
  return forms.sort()[0]!;
}

export function checkUi(u: Ui, v: string): boolean {
  if (v.length > 900) return false;
  switch (u.t) {
    case 'slide': return slide(u, v);
    case 'pour': return pour(u, v);
    case 'river': return river(u, v);
    case 'lights': return lights(u, v);
    case 'match': return match(u, v);
    case 'balance': return balance(u, v);
    case 'path': return path(u, v);
    case 'rotate': return rotate(u, v);
    case 'stacks': return stacks(u, v);
    case 'jump': return jump(u, v);
    case 'dials': return dials(u, v);
    case 'color': return color(u, v);
    case 'divide': return divide(u, v);
    case 'numgrid':
    case 'mark':
    case 'multi':
      return v === u.answer;
  }
}
