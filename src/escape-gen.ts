// 하리보 사건파일: 이야기 씨앗(escape-stories.ts)으로 방 3개짜리 방탈출 사건을 만들어요.
// 수수께끼 다섯 개를 푸는 방식(자물쇠, 말 거는 사람, 찢어진 쪽지, 멈춘 시계, 물건 찾기 카드, 다른 방 쪽지,
// 줄 세우기, 보물 칸)을 사건마다 다르게 섞고, 마지막엔 용의자 특징표와 증거 세 개로 범인·방법·동기를 맞혀요.
// 같은 씨앗이면 늘 같은 사건이 나와요(무작위는 사건 id로 정해져요).
import { rng } from './expedition';
import type { EscAction, EscCase, EscObject, Lock } from './escape';
import { TEASERS, type Teaser } from './escape-teasers';
import { GRIDS, ORDERS, type GridPuzzle, type OrderPuzzle } from './escape-puzzles';
import { ROOMS, ROOM_KEYS, roomByName, type Hotspot, type RoomKey } from './case-rooms';

export type StorySeed = {
  id: string;
  title: string;
  emoji: string;
  place: string;
  intro: string;
  rooms: [string, string, string];
  suspects: [string, string][]; // [이름, 하는 일] 4명
  method: { clue: string; right: string; wrong: [string, string] };
  motive: { clue: string; right: string; wrong: [string, string] };
  ending: string; // 「범인」 자리에 범인 이름이 들어가요
};

type R = () => number;
const pick = <T>(r: R, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
function shuffle<T>(r: R, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
const josa = (w: string, a: string, b: string) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 > 0 ? a : b);

// ── 용의자 특징 ────────────────────────────────────────
type Trait = { label: string; v: [string, string]; ev: [string, string] };
const TRAITS: Trait[] = [
  { label: '손', v: ['왼손잡이', '오른손잡이'], ev: ['가위 손잡이가 왼손 쪽으로 돌려져 있었다. 범인은 왼손잡이다.', '가위 손잡이가 오른손 쪽으로 돌려져 있었다. 범인은 오른손잡이다.'] },
  { label: '신발', v: ['운동화', '구두'], ev: ['바닥에 물결무늬 운동화 발자국이 찍혀 있었다. 범인은 운동화를 신었다.', '바닥에 동그란 구두 굽 자국이 찍혀 있었다. 범인은 구두를 신었다.'] },
  { label: '키', v: ['키가 큼', '키가 작음'], ev: ['높은 선반 맨 위 먼지만 닦여 있었다. 범인은 키가 크다.', '낮은 발판이 끌려온 자국이 있었다. 범인은 키가 작다.'] },
  { label: '향', v: ['박하 향 핸드크림', '바닐라 향 핸드크림'], ev: ['손잡이에서 박하 향이 났다. 범인은 박하 향 핸드크림을 쓴다.', '손잡이에서 바닐라 향이 났다. 범인은 바닐라 향 핸드크림을 쓴다.'] },
  { label: '털', v: ['고양이를 키움', '강아지를 키움'], ev: ['의자에 고양이 털이 붙어 있었다. 범인은 고양이를 키운다.', '의자에 강아지 털이 붙어 있었다. 범인은 강아지를 키운다.'] },
  { label: '머리', v: ['긴 머리', '짧은 머리'], ev: ['빗 사이에 긴 머리카락이 끼어 있었다. 범인은 머리가 길다.', '빗 사이에 짧은 머리카락이 끼어 있었다. 범인은 머리가 짧다.'] },
  { label: '펜', v: ['파란 펜', '빨간 펜'], ev: ['쪽지 글씨가 파란 잉크였다. 범인은 파란 펜을 쓴다.', '쪽지 글씨가 빨간 잉크였다. 범인은 빨간 펜을 쓴다.'] },
  { label: '음료', v: ['커피파', '녹차파'], ev: ['컵 바닥에 커피 자국이 남아 있었다. 범인은 커피를 마신다.', '컵 안에 녹차 티백이 남아 있었다. 범인은 녹차를 마신다.'] },
];

// ── 방 꾸밈 ────────────────────────────────────────
const PALETTE: [string, string][] = [
  ['#ffe9c7', '#e3b98a'], ['#e6dcff', '#c9a27c'], ['#d4f5ea', '#9fb6a8'], ['#fff3c2', '#b88c5e'], ['#cfe3f5', '#8a96a8'],
  ['#ffd9e4', '#c7a0a8'], ['#e0f0d0', '#a3b58a'], ['#f2e6d8', '#9c8670'], ['#dff3ff', '#90a8c0'], ['#f7e1ff', '#b49ac4'],
];

// 방 그림 속 자리 고르기. 한 자리엔 물건 하나만 둬요.
type Pool = { key: RoomKey; free: Hotspot[] };
type Want = (h: Hotspot) => boolean;
const plain: Want = (h) => !h.tag?.length && !h.rid && !h.tool?.length;
function take(r: R, pool: Pool, need: Want = () => true, prefer?: Want): Hotspot {
  const ok = pool.free.filter((h) => !h.tag?.includes('door') && need(h));
  const best = prefer ? ok.filter(prefer) : [];
  const soft = ok.filter(plain);
  const list = best.length ? best : soft.length && !prefer ? soft : ok.filter((h) => !h.tag?.length).length ? ok.filter((h) => !h.tag?.length) : ok;
  if (!list.length) throw new Error(`자리 부족: ${pool.key}`);
  const h = pick(r, list);
  pool.free = pool.free.filter((x) => x !== h);
  return h;
}
const has = (t: 'lock' | 'clock' | 'wall'): Want => (h) => !!h.tag?.includes(t);

type Spot = Omit<EscObject, 'x' | 'y' | 'scene'>;
type Built = { spots: Spot[]; hint: string; steps: EscAction[]; lockId: string; back?: Spot[] }; // back: 앞 방에 두는 것
type Reward = { take?: string[]; clue?: string | string[]; text: string; got?: string }; // got: 사람·카드가 줄 때 쓰는 말
type Ctx = { r: R; id: (k: string) => string; reward: Reward; lock?: Spot; pool: Pool; safe?: Hotspot };

// 잠긴 곳 하나(혹은 문). 비밀번호를 맞히면 보상이 나와요.
type CodeExtra = Pick<Extract<Lock, { kind: 'code' }>, 'choices' | 'order' | 'grid'>;
function box(ctx: Ctx, code: string, ask: string, look: string, extra: CodeExtra = {}): Spot {
  const lk: Lock = { kind: 'code', code, ask, ...extra };
  if (ctx.lock) return { ...ctx.lock, lock: lk, look: `${ctx.lock.look} ${look}` };
  const h = ctx.safe!;
  const n = h.label;
  return {
    id: ctx.id('box'), at: h.id, name: n, emoji: '🔐', look: `${n}${josa(n, '이', '가')} 자물쇠로 잠겨 있어요. ${look}`,
    lock: lk, openText: `철컥! ${n}${josa(n, '이', '가')} 열렸어요. ${ctx.reward.text}`, again: `${n}${josa(n, '은', '는')} 이제 비어 있어요.`,
    take: ctx.reward.take, clue: ctx.reward.clue,
  };
}
// 쪽지·글씨: 방 그림 속 어딘가에 붙어 있거나 숨어 있어요.
function note(ctx: Ctx, key: string, thing: string, emoji: string, text: string, wall = false): Spot {
  const h = take(ctx.r, ctx.pool, () => true, wall ? has('wall') : undefined);
  return { id: ctx.id(key), at: h.id, name: h.label, emoji, look: `${h.at} ${thing}${josa(thing, '이', '가')} 있어요.\n${text}`, memo: true };
}
const hide = (ctx: Ctx, key: string, emoji: string, text: (h: Hotspot) => string, prefer?: Want): Spot => {
  const h = take(ctx.r, ctx.pool, () => true, prefer);
  return { id: ctx.id(key), at: h.id, name: h.label, emoji, look: text(h), memo: true };
};

// 레이튼식 수수께끼: 잠긴 곳을 누르면 문제가 나오고, 답을 넣으면 열려요. 문제는 사건마다 다 달라요.
function teaser(ctx: Ctx, t: Teaser, no: number): Built {
  const lock = { ...box(ctx, t.a, t.choices ? '답 고르기' : t.ask, `자물쇠에 수수께끼가 새겨져 있어요.\n${t.q}`, t.choices ? { choices: t.choices } : {}), ref: no };
  return { spots: [lock], lockId: lock.id, hint: t.hint, steps: [{ a: 'code', o: lock.id, v: t.a }] };
}

// 말 거는 사람: 방에 서 있는 목격자가 수수께끼를 내고, 풀면 가진 것을 건네줘요.
const WITNESS = ['하늘', '바다', '별이', '구름', '라임', '나비', '두부', '콩이', '유자', '호두', '소금', '단비'];
const WITNESS_ROLE = ['경비원', '청소 담당', '이웃 주민', '배달원', '건물 관리인', '단골손님', '사진 기자', '야간 당번'];
function person(ctx: Ctx, t: Teaser, no: number, taken: readonly string[]): Built {
  const { r } = ctx;
  const name = pick(r, WITNESS.filter((n) => !taken.includes(n)));
  const role = pick(r, WITNESS_ROLE);
  const face = `${r() < 0.5 ? 'girl' : 'boy'}-${String(1 + Math.floor(r() * 50)).padStart(2, '0')}-${Math.floor(r() * 4)}`;
  const lock: Lock = t.choices ? { kind: 'code', code: t.a, ask: '답 고르기', choices: t.choices } : { kind: 'code', code: t.a, ask: t.ask };
  const who: Spot = {
    id: ctx.id('who'), name, emoji: '🙂', face,
    look: `「${role} ${name}이에요. 제 수수께끼를 풀면 아는 걸 알려 줄게요.」\n${t.q}`, ref: no,
    lock, openText: `「정답이에요! 약속대로 도와줄게요.」 ${ctx.reward.got ?? ctx.reward.text}`, again: `「제가 아는 건 다 말했어요.」`,
    take: ctx.reward.take, clue: ctx.reward.clue,
  };
  return { spots: [who], lockId: who.id, hint: t.hint, steps: [{ a: 'code', o: who.id, v: t.a }] };
}

// 찢어진 쪽지: 문제가 두 조각으로 찢겨 방 두 곳에 숨어 있어요. 둘 다 찾아야 문제를 읽을 수 있어요.
function halves(q: string): [string, string] {
  const parts = q.includes('\n') ? q.split('\n') : (q.match(/[^.?!]+[.?!]+\s*/g) ?? [q]).map((x) => x.trim());
  if (parts.length < 2) {
    const k = q.indexOf(' ', Math.floor(q.length / 2));
    return k > 0 ? [q.slice(0, k), q.slice(k + 1)] : [q, ''];
  }
  const k = Math.ceil(parts.length / 2);
  const sep = q.includes('\n') ? '\n' : ' ';
  return [parts.slice(0, k).join(sep), parts.slice(k).join(sep)];
}
function torn(ctx: Ctx, t: Teaser, no: number): Built {
  const [a, b] = halves(t.q);
  const p1 = note(ctx, 'tr', '찢어진 쪽지 윗부분', '📄', `${a} …(찢어짐)`);
  const p2 = note(ctx, 'tr', '찢어진 쪽지 아랫부분', '📄', `…(찢어짐) ${b}`);
  const lock = { ...box(ctx, t.a, t.choices ? '답 고르기' : t.ask, `자물쇠에 「찢어진 쪽지 두 장을 맞추면 문제가 보여요」라고 새겨져 있어요.`, t.choices ? { choices: t.choices } : {}), ref: no };
  return { spots: [p1, p2, lock], lockId: lock.id, hint: `방 안에 찢어진 쪽지가 두 장 있어요. 수첩에서 두 조각을 이어 읽어 보세요. ${t.hint}`, steps: [{ a: 'tap', o: p1.id }, { a: 'tap', o: p2.id }, { a: 'code', o: lock.id, v: t.a }] };
}

// 다른 방 쪽지: 자물쇠에는 문제가 없고, 문제 쪽지는 앞 방에 남아 있어요. 왔다 갔다 해야 해요.
function far(ctx: Ctx, t: Teaser, no: number, back: Ctx, backName: string): Built {
  const paper = note(back, 'far', '접힌 쪽지', '✉️', `「이 문제의 답이 다른 방 자물쇠를 열어요.」\n${t.q}`);
  const lock = { ...box(ctx, t.a, t.choices ? '답 고르기' : t.ask, `자물쇠에 「문제는 ${backName}에 두고 왔어요」라는 꼬리표가 달려 있어요.`, t.choices ? { choices: t.choices } : {}), ref: no };
  return { spots: [lock], back: [paper], lockId: lock.id, hint: `문제 쪽지는 ${backName}에 있어요. 돌아가서 접힌 쪽지를 찾아보세요. ${t.hint}`, steps: [{ a: 'code', o: lock.id, v: t.a }] };
}

// 멈춘 시계: 방 그림 속 벽시계를 눌러 크게 보고, 그 시각으로 계산해요(눌러야 바늘이 보여요).
const CLOCK_KINDS = 4;
function clockQuiz(ctx: Ctx, kind: number): Built | null {
  const { r } = ctx;
  const h = ctx.pool.free.find(has('clock'));
  if (!h) return null;
  ctx.pool.free = ctx.pool.free.filter((x) => x !== h);
  const n = h.label;
  const hm = (t: number) => {
    const hh = Math.floor(t / 60) % 12 || 12;
    const mm = t % 60;
    return `${hh}시 ${mm ? `${mm}분` : '정각'}`;
  };
  const four = (t: number) => `${String(Math.floor(t / 60) % 12 || 12).padStart(2, '0')}${String(t % 60).padStart(2, '0')}`;
  let shown: number, ask: string, code: string, q: string, hint: string, tail = '에 멈춰 있어요.';
  if (kind === 0) {
    // 두 바늘 사이 각도(분이 짝수라서 딱 떨어져요)
    shown = (1 + Math.floor(r() * 11)) * 60 + 2 * (1 + Math.floor(r() * 29));
    const a = Math.abs(30 * Math.floor(shown / 60) - 5.5 * (shown % 60));
    code = String(Math.min(a, 360 - a));
    ask = '도';
    q = `${n}의 긴바늘과 짧은바늘 사이, 작은 쪽 각도는 몇 도일까요?`;
    hint = '짧은바늘은 한 시간에 30도, 1분에 0.5도씩 움직여요. 긴바늘은 1분에 6도예요.';
  } else if (kind === 1) {
    // 거울에 비친 시계
    shown = (1 + Math.floor(r() * 11)) * 60 + 5 * Math.floor(r() * 12) + (r() < 0.5 ? 0 : 2);
    const real = (720 - shown) % 720 || 720;
    code = four(real);
    ask = '네 자리 (3시 5분 → 0305)';
    tail = '을 가리키고 있어요. 그런데 숫자판이 좌우로 뒤집혀 있어요!';
    q = `${n}${josa(n, '은', '는')} 거울에 비친 모습 그대로 만든 장난감 시계예요. 바늘 모양만 보면 지금 보이는 시각이지만, 진짜 시각은 거울을 다시 비춰야 알 수 있어요. 진짜 시각은 몇 시 몇 분일까요?`;
    hint = '거울에 비치면 12시와 6시를 잇는 선을 기준으로 좌우가 바뀌어요. 두 시각을 더하면 12시가 돼요.';
  } else if (kind === 2) {
    // 늦게 가는 시계
    const slow = pick(r, [3, 4, 5, 6, 10, 12]);
    const start = (18 + Math.floor(r() * 4)) * 60 + 5 * Math.floor(r() * 12);
    const hours = 2 + Math.floor(r() * 8);
    shown = (start + hours * (60 - slow)) % 720;
    code = four((start + hours * 60) % 720);
    ask = '네 자리 (7시 5분 → 0705)';
    tail = '을 가리키고 있어요. 똑딱똑딱, 지금도 가고 있어요.';
    q = `${n}${josa(n, '은', '는')} 한 시간마다 꼭 ${slow}분씩 늦게 가요. 어제 저녁 ${hm(start)}에 정확히 맞춰 놓았고, 그 뒤로 12시간이 지나지 않았어요. 지금 진짜 시각은 몇 시 몇 분일까요?`;
    hint = `시계는 진짜 1시간 동안 ${60 - slow}분만 가요. 맞춘 뒤 시계가 몇 분 갔는지 먼저 세어 보세요.`;
  } else {
    // 다음에 두 바늘이 겹칠 때까지
    do shown = (1 + Math.floor(r() * 11)) * 60 + Math.floor(r() * 60);
    while ((shown * 11) % 720 === 0);
    const k = Math.floor((shown * 11) / 720) + 1;
    code = String(Math.floor((k * 720) / 11 - shown));
    ask = '분 (소수점 아래는 버려요)';
    q = `지금 ${n}${josa(n, '이', '가')} 가리키는 시각부터, 긴바늘과 짧은바늘이 처음으로 딱 겹칠 때까지 몇 분이 걸릴까요?`;
    hint = '두 바늘은 12시간에 11번 겹쳐요. 그러니 겹치는 간격은 720÷11분, 약 65분 27초예요.';
  }
  const face: Spot = { id: ctx.id('clk'), at: h.id, name: n, emoji: '🕰️', look: `${n}${josa(n, '이', '가')} ${hm(shown)}${tail}`, memo: true };
  const lock = box(ctx, code, ask, `자물쇠에 문제가 새겨져 있어요.\n「시계 수수께끼」\n${q}`);
  return { spots: [face, lock], lockId: lock.id, hint: `${n}${josa(n, '을', '를')} 눌러 크게 보세요. ${hint}`, steps: [{ a: 'tap', o: face.id }, { a: 'code', o: lock.id, v: code }] };
}

// 줄 세우기: 문장 여러 개로 순서를 추리해서, 자리마다 이름을 골라요.
function lineUp(ctx: Ctx, p: OrderPuzzle): Built {
  const lock = box(ctx, p.a, `${p.ask} 고르기`, `자물쇠에 문제가 새겨져 있어요.\n「줄 세우기 수수께끼」\n${p.q}`, { order: p.names });
  return { spots: [lock], lockId: lock.id, hint: p.hint, steps: [{ a: 'code', o: lock.id, v: p.a }] };
}

// 보물 칸: 숫자는 둘레 여덟 칸에 숨은 젤리 개수. 젤리 칸을 모두 골라 표시해요.
function treasure(ctx: Ctx, g: GridPuzzle): Built {
  const q = `젤리 보물 지도예요. 숫자가 적힌 칸에는 젤리가 없고, 숫자는 그 칸을 둘러싼 여덟 칸(가로·세로·대각선)에 숨은 젤리 개수예요. 젤리는 모두 ${g.k}개예요. 젤리가 있는 칸을 모두 골라 표시하세요.`;
  const lock = box(ctx, g.a, `젤리 ${g.k}칸 고르기`, `자물쇠에 칸 그림이 새겨져 있어요.\n「보물 칸 수수께끼」\n${q}`, { grid: { w: g.w, h: g.h, nums: g.nums } });
  return { spots: [lock], lockId: lock.id, hint: '0 둘레에는 젤리가 없어요. 숫자 칸 둘레에 남은 빈칸이 그 숫자와 딱 같으면 거기는 모두 젤리예요.', steps: [{ a: 'code', o: lock.id, v: g.a }] };
}

// ── 사건마다 다섯 자리(방1 장치, 방1 조각, 방2 장치, 방2 문, 방3 장치)에 서로 다른 방식을 나눠요 ──
export type Fmt = 'lock' | 'person' | 'torn' | 'clock' | 'card' | 'far' | 'order' | 'grid';
export const FMT_NAME: Record<Fmt, string> = {
  lock: '자물쇠 수수께끼', person: '말 거는 사람', torn: '찢어진 쪽지', clock: '멈춘 시계', card: '물건 찾기 카드', far: '다른 방 쪽지', order: '줄 세우기', grid: '보물 칸',
};
const FMTS: Fmt[] = ['lock', 'person', 'torn', 'clock', 'card', 'far', 'order', 'grid'];
const SLOT_OK: Fmt[][] = [
  ['lock', 'person', 'torn', 'clock', 'card', 'order', 'grid'],
  ['lock', 'person', 'torn', 'clock', 'card', 'order', 'grid'],
  FMTS,
  ['lock', 'torn', 'clock', 'far', 'order', 'grid'],
  FMTS,
];
const TEASE = new Set<Fmt>(['lock', 'person', 'torn', 'far']);
type Plan = { f: Fmt[]; tz: number; ord: number; grid: number; clock: number };
const PLANS: Plan[] = [];
function planFor(no: number): Plan {
  while (PLANS.length <= no) {
    const i = PLANS.length;
    const r = rng(`fmt-plan:${i}`);
    const used = new Set(PLANS.map((p) => [...p.f].sort().join()));
    const prev = PLANS[i - 1];
    const sets: Fmt[][] = [];
    for (let m = 0; m < 256; m++) if (m.toString(2).split('1').length - 1 === 5) sets.push(FMTS.filter((_, k) => m & (1 << k)));
    const order = shuffle(r, sets).sort((a, b) => Number(used.has([...a].sort().join())) - Number(used.has([...b].sort().join())));
    let f: Fmt[] | null = null;
    for (const set of order) {
      if (prev && set.filter((x) => prev.f.includes(x)).length > 3) continue;
      for (let tries = 0; tries < 60 && !f; tries++) {
        const p = shuffle(r, set);
        if (p.every((x, k) => SLOT_OK[k]!.includes(x))) f = p;
      }
      if (f) break;
    }
    const sum = (k: keyof Omit<Plan, 'f'>, add: number) => (prev ? prev[k] : 0) + add;
    const pf = prev?.f ?? [];
    PLANS.push({
      f: f!,
      tz: sum('tz', pf.filter((x) => TEASE.has(x)).length),
      ord: sum('ord', pf.filter((x) => x === 'order').length),
      grid: sum('grid', pf.filter((x) => x === 'grid').length),
      clock: sum('clock', pf.filter((x) => x === 'clock').length),
    });
  }
  return PLANS[no]!;
}

// 사건마다 수수께끼 카드의 답이 겹치지 않게, 이미 쓴 수수께끼를 기억해 둬요.
const USED_RID = new Set<string>();
// 수수께끼: 방 그림 속 물건 중 답이 되는 것을 눌러야 숨긴 물건이 나와요(틀린 물건은 그냥 비어 있어요).
function riddle(ctx: Ctx): Built {
  const { r } = ctx;
  const fresh = ctx.pool.free.some((h) => !!h.rid && !h.tag?.includes('lock') && !USED_RID.has(h.rid));
  const ans = take(r, ctx.pool, (h) => !!h.rid && !h.tag?.includes('lock') && (!fresh || !USED_RID.has(h.rid)));
  USED_RID.add(ans.rid!);
  const opts = [ans, ...[0, 1].map(() => take(r, ctx.pool, (h) => !!h.rid && !h.tag?.includes('lock')))];
  const paper = note(ctx, 'rdn', '수수께끼 카드', '🃏', `「${ans.rid} 나는 무엇일까요? 내 곁을 살펴봐요.」`);
  const spots: Spot[] = opts.map((o, i) =>
    i === 0
      ? { id: ctx.id('rd0'), at: o.id, name: o.label, emoji: '❔', look: `${o.label} 곁을 살펴보니… ${ctx.reward.got ?? ctx.reward.text}`, again: `${o.label} 곁엔 이제 아무것도 없어요.`, take: ctx.reward.take, clue: ctx.reward.clue }
      : { id: ctx.id(`rd${i}`), at: o.id, name: o.label, emoji: '❔', look: `${o.label}${josa(o.label, '이에요', '예요')}. 특별한 건 없어요.` },
  );
  return { spots: [paper, ...shuffle(r, spots)], lockId: spots[0]!.id, hint: '수수께끼 카드의 답이 되는 물건을 방 그림에서 찾아 눌러 보세요.', steps: [{ a: 'tap', o: paper.id }, { a: 'tap', o: spots[0]!.id }] };
}

// 물건 합치기: 두 조각을 합쳐 도구를 만들고, 방 그림 속 알맞은 곳에 써서 증거를 찾아요.
type Need = NonNullable<Hotspot['tool']>[number];
const COMBOS: { need: Need; a: [string, string]; b: [string, string]; out: [string, string]; make: string; look: (n: string) => string; use: (n: string) => string }[] = [
  { need: 'dark', a: ['빈 손전등', '🔦'], b: ['건전지', '🔋'], out: ['켜지는 손전등', '💡'], make: '건전지를 끼우자 손전등이 반짝 켜졌어요!', look: (n) => `${n} 안쪽이 너무 깜깜해서 아무것도 안 보여요.`, use: (n) => `손전등을 비추자 ${n} 안쪽에서` },
  { need: 'deep', a: ['자석', '🧲'], b: ['털실', '🧶'], out: ['자석 낚싯줄', '🎣'], make: '털실에 자석을 묶어 낚싯줄을 만들었어요!', look: (n) => `${n} 깊숙한 바닥에 뭔가 반짝이는데 손이 안 닿아요.`, use: (n) => `자석 낚싯줄을 내리자 ${n} 바닥에서` },
  { need: 'high', a: ['사다리 윗부분', '🪜'], b: ['사다리 아랫부분', '🪵'], out: ['접이식 사다리', '🪜'], make: '두 조각을 딸깍 맞추니 사다리가 됐어요!', look: (n) => `${n}${josa(n, '이', '가')} 너무 높아서 손이 안 닿아요.`, use: (n) => `사다리를 타고 올라가 보니 ${n}에서` },
  { need: 'tiny', a: ['돋보기 렌즈', '🔎'], b: ['돋보기 손잡이', '🥢'], out: ['돋보기', '🔍'], make: '렌즈를 손잡이에 끼워 돋보기를 만들었어요!', look: (n) => `${n}에 깨알만 한 글씨가 빼곡해요. 맨눈으로는 못 읽어요.`, use: (n) => `돋보기로 들여다보니 ${n}의 깨알 글씨 사이에서` },
  { need: 'soil', a: ['빈 물뿌리개', '🪣'], b: ['물병', '🍶'], out: ['물 담은 물뿌리개', '🚿'], make: '물병의 물을 부어 물뿌리개를 채웠어요!', look: (n) => `${n} 흙이 돌처럼 굳어 있어요. 물을 주면 부드러워질 것 같아요.`, use: (n) => `물을 주고 흙을 살살 파 보니 ${n} 속에서` },
  { need: 'keyhole', a: ['열쇠 머리', '🔑'], b: ['열쇠 몸통', '🔩'], out: ['이어 붙인 열쇠', '🗝️'], make: '두 조각을 끼워 맞추니 열쇠 하나가 됐어요!', look: (n) => `${n}${josa(n, '이', '가')} 잠겨 있어요. 열쇠 구멍 모양이 특이해요.`, use: (n) => `열쇠를 돌려 ${n}${josa(n, '을', '를')} 열어 보니` },
];

// 사건의 방 세 개에 그림을 하나씩: 이름에 맞는 그림을 먼저, 겹치면 남은 그림 중에서 골라요.
function pickRooms(r: R, names: readonly string[]): RoomKey[] {
  const out: RoomKey[] = [];
  for (const name of names) {
    const want = roomByName(name);
    out.push(want && !out.includes(want) ? want : pick(r, ROOM_KEYS.filter((k) => !out.includes(k))));
  }
  return out;
}

export function buildCase(seed: StorySeed, level = 3, no = 0): EscCase {
  const r = rng(`escape:${seed.id}`);
  const bgs = pickRooms(r, seed.rooms);
  const pools: Pool[] = bgs.map((key) => ({ key, free: [...ROOMS[key].spots] }));
  const scenes = seed.rooms.map((name, i) => {
    const [wall, floor] = PALETTE[(i * 3 + Math.floor(r() * PALETTE.length)) % PALETTE.length]!;
    return { id: `r${i + 1}`, name, wall, floor, bg: bgs[i]! };
  });
  const doorAt = (i: number) => {
    const d = pools[i]!.free.find((h) => h.tag?.includes('door'))!;
    pools[i]!.free = pools[i]!.free.filter((h) => h !== d);
    return d.id;
  };
  // 용의자와 특징: 범인 (x,y,z), 나머지는 하나씩만 다르게 → 단서 세 개를 모두 맞춰야 범인 하나가 남아요.
  const traits = shuffle(r, TRAITS).slice(0, 3);
  const cv = traits.map(() => (r() < 0.5 ? 0 : 1));
  const profiles = shuffle(r, [[...cv], cv.map((v, i) => (i === 0 ? 1 - v : v)), cv.map((v, i) => (i === 1 ? 1 - v : v)), cv.map((v, i) => (i === 2 ? 1 - v : v))]);
  const culprit = profiles.findIndex((p) => p.every((v, i) => v === cv[i]));
  const sus = seed.suspects.map(([name, role], i) => ({ name, role, p: profiles[i]! }));
  const culpritName = sus[culprit]!.name;

  const items: EscCase['items'] = {};
  const clues: EscCase['clues'] = {};
  traits.forEach((t, i) => (clues[`ev${i + 1}`] = t.ev[cv[i]!]!));
  clues.method = seed.method.clue;
  clues.motive = seed.motive.clue;
  // 도구 쓰는 곳은 방 3 그림에 맞는 자리가 있는 것 중에서 먼저 골라 둬요.
  const combo = pick(r, COMBOS.filter((c) => pools[2]!.free.some((h) => h.tool?.includes(c.need))));
  const toolSpot = take(r, pools[2]!, (h) => !!h.tool?.includes(combo.need));
  items.key12 = { name: `${seed.rooms[1]} 열쇠`, emoji: '🗝️' };
  items.partA = { name: combo.a[0], emoji: combo.a[1] };
  items.partB = { name: combo.b[0], emoji: combo.b[1] };
  items.tool = { name: combo.out[0], emoji: combo.out[1] };

  let n = 0;
  // 잠긴 곳은 장치마다 먼저 하나 맡아 둬요(다른 쪽지가 자물쇠 자리를 차지하지 않게).
  const ctx = (scene: number, reward: Reward, lock?: Spot | 'none'): Ctx => ({ r, reward, lock: lock === 'none' ? undefined : lock, pool: pools[scene]!, safe: lock ? undefined : take(r, pools[scene]!, has('lock')), id: (k) => `${k}${++n}` });

  // 다섯 자리마다 정해 둔 방식으로 수수께끼를 만들어요. 그림에 시계·수수께끼 물건이 모자라면 자물쇠 수수께끼로 바꿔요.
  const plan = planFor(no);
  let tzi = plan.tz;
  const nextT = (): [Teaser, number] => {
    const t = TEASERS[tzi];
    if (!t) throw new Error(`수수께끼가 모자라요: ${seed.id}`);
    return [t, ++tzi];
  };
  const spare = (): [Teaser, number] => [TEASERS[TEASERS.length - 1 - no]!, TEASERS.length - no];
  const formats: Fmt[] = [];
  const people: string[] = seed.suspects.map(([name]) => name);
  const make = (k: number, scene: number, reward: Reward, lock?: Spot): Built => {
    const f = plan.f[k]!;
    const free = pools[scene]!.free;
    const ok = f === 'clock' ? free.some(has('clock')) : f === 'card' ? free.filter((h) => h.rid && !h.tag?.includes('lock')).length >= 3 : true;
    // 바꿀 땐 이 사건에 아직 없는 수수께끼 방식으로(남는 문제는 은행 끝에서 가져와요)
    const use: Fmt = ok ? f : ((['torn', 'far', 'person', 'lock'] as const).find((x) => !plan.f.includes(x) && SLOT_OK[k]!.includes(x)) ?? 'lock');
    formats.push(use);
    const tz = (): [Teaser, number] => (ok ? nextT() : spare());
    const cx = ctx(scene, reward, lock ?? (use === 'person' || use === 'card' ? 'none' : undefined));
    if (use === 'lock') return teaser(cx, ...tz());
    if (use === 'person') {
      const b = person(cx, ...tz(), people);
      people.push(b.spots[0]!.name);
      return b;
    }
    if (use === 'torn') return torn(cx, ...tz());
    if (use === 'far') return far(cx, ...tz(), ctx(scene - 1, reward, 'none'), seed.rooms[scene - 1]!);
    if (use === 'clock') return clockQuiz(cx, plan.clock % CLOCK_KINDS)!;
    if (use === 'card') return riddle(cx);
    if (use === 'order') return lineUp(cx, ORDERS[plan.ord]!);
    return treasure(cx, GRIDS[plan.grid]!);
  };

  const sceneSpots: Spot[][] = [[], [], []];
  const hints: EscCase['hints'] = [];
  const steps: EscAction[] = [];
  const add = (scene: number, b: Built) => {
    sceneSpots[scene]!.push(...b.spots);
    if (b.back) sceneSpots[scene - 1]!.push(...b.back);
    hints.push({ until: b.lockId, text: b.hint });
  };

  // 방 1: 용의자 파일, 장치 A(→ 방 2 열쇠), 수수께끼(→ 조각 A), 방 2로 가는 문
  const door12: Spot = { id: 'door12', at: doorAt(0), name: `${seed.rooms[1]} 문`, emoji: '🚪', look: `${seed.rooms[1]}(으)로 가는 문이 잠겨 있어요.`, lock: { kind: 'item', item: 'key12' }, openText: '문이 열렸어요! 한 번 더 누르면 들어가요.', goto: 'r2' };
  const got = (w: string) => `${w}${josa(w, '을', '를')} 손에 넣었어요!`;
  const A = make(0, 0, { take: ['key12'], text: `안에서 ${items.key12.name}를 찾았어요!`, got: got(items.key12.name) });
  const R1 = make(1, 0, { take: ['partA'], text: `${combo.a[0]}${josa(combo.a[0], '을', '를')} 찾았어요!`, got: got(combo.a[0]) });
  const fileAt = take(r, pools[0]!, () => true, has('lock'));
  const file: Spot = { id: 'file', at: fileAt.id, name: fileAt.label, emoji: '📁', look: `${fileAt.at} 용의자 파일이 있어요. 용의자 네 명의 특징이에요.\n${sus.map((s) => `• ${s.name} (${s.role}): ${traits.map((t, i) => t.v[s.p[i]!]).join(' · ')}`).join('\n')}`, memo: true };
  sceneSpots[0]!.push(file);
  steps.push({ a: 'tap', o: 'file' });
  add(0, A);
  steps.push(...A.steps);
  add(0, R1);
  steps.push(...R1.steps);
  hints.push({ until: 'door12', text: `찾은 열쇠로 ${seed.rooms[1]} 문을 열어 보세요.` });
  steps.push({ a: 'use', o: 'door12', i: 'key12' }, { a: 'tap', o: 'door12' });

  // 방 2: 장치 B(→ 증거 1 + 조각 B), 장치 C(= 방 3 문 비밀번호)
  const back21: Spot = { id: 'door21', name: `${seed.rooms[0]}(으)로`, emoji: '🚪', look: `${seed.rooms[0]}(으)로 돌아가요.`, goto: 'r1' };
  const door23Base: Spot = { id: 'door23', at: doorAt(1), name: `${seed.rooms[2]} 문`, emoji: '🚪', look: `${seed.rooms[2]}(으)로 가는 문에 비밀번호 자물쇠가 달려 있어요.`, openText: '문이 열렸어요! 한 번 더 누르면 들어가요.', goto: 'r3' };
  const B = make(2, 1, { take: ['partB'], clue: 'ev1', text: `${combo.b[0]}${josa(combo.b[0], '이', '가')} 들어 있고, 바닥에 이상한 흔적이 있어요. (수첩에 적었어요)`, got: `${combo.b[0]}${josa(combo.b[0], '을', '를')} 손에 넣고, 범인이 남긴 흔적 이야기도 들었어요. (수첩에 적었어요)` });
  add(1, B);
  steps.push(...B.steps);
  steps.push({ a: 'combine', i: 'partA', j: 'partB' });
  const C = make(3, 1, { text: '' }, door23Base);
  const door23 = C.spots.find((s) => s.id === 'door23')!;
  door23.goto = 'r3';
  add(1, C);
  steps.push(...C.steps, { a: 'tap', o: 'door23' });

  // 방 3: 도구 쓰는 곳(→ 증거 2 + 방법), 장치 D(→ 증거 3 + 동기)
  const back32: Spot = { id: 'door32', name: `${seed.rooms[1]}(으)로`, emoji: '🚪', look: `${seed.rooms[1]}(으)로 돌아가요.`, goto: 'r2' };
  const tl = toolSpot.label;
  const tool: Spot = { id: 'toolspot', at: toolSpot.id, name: tl, emoji: '🔎', look: combo.look(tl), lock: { kind: 'item', item: 'tool' }, openText: `${combo.use(tl)} 증거가 나왔어요! (수첩에 적었어요)`, again: '더 찾을 건 없어요.', clue: ['ev2', 'method'] };
  hints.push({ until: 'toolspot', text: `가방 속 ${combo.a[0]}와(과) ${combo.b[0]}을(를) 「합치기」로 합쳐서 ${combo.out[0]}${josa(combo.out[0], '을', '를')} 만들고, ${seed.rooms[2]}의 ${tl}에 써 보세요.` });
  steps.push({ a: 'use', o: 'toolspot', i: 'tool' });
  const D = make(4, 2, { clue: ['ev3', 'motive'], text: '안에 중요한 증거가 들어 있어요! (수첩에 적었어요)', got: '중요한 증거를 손에 넣었어요! (수첩에 적었어요)' });
  add(2, D);
  steps.push(...D.steps);
  sceneSpots[1]!.unshift(back21);
  sceneSpots[2]!.unshift(back32, tool);
  sceneSpots[0]!.push(door12);
  const order = [A.lockId, R1.lockId, 'door12', B.lockId, C.lockId, 'toolspot', D.lockId];
  hints.sort((a, b) => order.indexOf(a.until) - order.indexOf(b.until));
  hints.push({ until: '', text: '용의자 파일과 수첩의 증거 세 개를 맞춰 보세요. 증거 하나만으로는 범인이 둘 이상 남지만, 세 개를 모두 맞추면 한 명만 남아요. 방법·동기도 수첩에 있어요.' });

  // 자리: 그림 속 자리 가운데. 돌아가는 문은 그림 밖 버튼이에요.
  const objects: EscObject[] = [];
  sceneSpots.forEach((list, si) => {
    for (const [k, o] of list.entries()) {
      const h = o.at ? ROOMS[bgs[si]!].spots.find((x) => x.id === o.at)! : null;
      objects.push({ ...o, scene: `r${si + 1}`, x: h ? h.x : -20 - k, y: h ? h.y : -20 }); // 자리 없는 것(돌아가는 문·사람)은 그림 밖
    }
  });

  const methodOpts = shuffle(r, [seed.method.right, ...seed.method.wrong]);
  const motiveOpts = shuffle(r, [seed.motive.right, ...seed.motive.wrong]);
  const answer: EscAction = { a: 'answer', n: culprit, m: [methodOpts.indexOf(seed.method.right), motiveOpts.indexOf(seed.motive.right)] };
  return {
    id: seed.id, title: seed.title, emoji: seed.emoji, place: seed.place, intro: seed.intro, level,
    scenes, items, clues, objects,
    combos: [{ a: 'partA', b: 'partB', out: 'tool', text: combo.make }],
    question: { text: '범인은 누구일까요?', options: sus.map((s) => `${s.name} (${s.role})`), correct: culprit, needs: ['ev1', 'ev2', 'ev3', 'method', 'motive'] },
    more: [
      { text: '어떻게 했을까요?', options: methodOpts, correct: methodOpts.indexOf(seed.method.right) },
      { text: '왜 그랬을까요?', options: motiveOpts, correct: motiveOpts.indexOf(seed.motive.right) },
    ],
    hints,
    ending: seed.ending.replaceAll('「범인」', culpritName),
    solution: [...steps, answer],
    formats,
  };
}
