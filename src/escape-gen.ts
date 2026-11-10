// 하리보 사건파일: 이야기 씨앗(escape-stories.ts)으로 방 3개짜리 방탈출 사건을 만들어요.
// 퍼즐 장치(논리 숫자 맞히기, 개수 세기, 색 암호, 저울 계산, 글자 조각, 시계 순서, 전등 합, 수수께끼, 물건 합치기)를
// 사건마다 다르게 섞고, 마지막엔 용의자 특징표와 증거 세 개를 맞춰 범인·방법·동기를 모두 맞혀야 해요.
// 같은 씨앗이면 늘 같은 사건이 나와요(무작위는 사건 id로 정해져요).
import { rng } from './expedition';
import type { EscAction, EscCase, EscObject } from './escape';

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
const WALL: [number, number][] = [[16, 12], [32, 12], [48, 12], [64, 12], [78, 12]];
const FLOOR: [number, number][] = [[24, 50], [42, 50], [60, 50], [76, 54], [22, 74], [38, 74], [54, 74], [70, 76]];
const CONTAINERS: [string, string][] = [
  ['금고', '🔐'], ['보석함', '💎'], ['사물함', '🗄️'], ['트렁크', '🧳'], ['공구함', '🧰'], ['오래된 궤짝', '📦'], ['서류 가방', '💼'], ['비밀 상자', '🎁'],
];

type Spot = Omit<EscObject, 'x' | 'y' | 'scene'> & { wall?: boolean };
type Built = { spots: Spot[]; hint: string; steps: EscAction[]; lockId: string };
type Reward = { take?: string[]; clue?: string | string[]; text: string };
type Ctx = { r: R; id: (k: string) => string; reward: Reward; lock?: Spot; used: Set<string> };

// 잠긴 상자 하나(혹은 문). 비밀번호를 맞히면 보상이 나와요.
function box(ctx: Ctx, code: string, ask: string, look: string): Spot {
  if (ctx.lock) return { ...ctx.lock, lock: { kind: 'code', code, ask }, look: `${ctx.lock.look} ${look}` };
  let c = pick(ctx.r, CONTAINERS);
  for (let i = 0; ctx.used.has(c[0]) && i < 20; i++) c = pick(ctx.r, CONTAINERS);
  ctx.used.add(c[0]);
  return {
    id: ctx.id('box'), name: c[0], emoji: c[1], big: true, look: `${c[0]}에 자물쇠가 달려 있어요. ${look}`,
    lock: { kind: 'code', code, ask }, openText: `철컥! ${c[0]}${josa(c[0], '이', '가')} 열렸어요. ${ctx.reward.text}`, again: `${c[0]}은(는) 이제 비어 있어요.`,
    take: ctx.reward.take, clue: ctx.reward.clue,
  };
}
const note = (id: string, name: string, emoji: string, look: string, wall = true): Spot => ({ id, name, emoji, look, memo: true, wall });

// 1) 논리 숫자 맞히기: 세 자리 숫자를 줄마다 "맞는 숫자 n개(제자리 m개)"로 좁혀요.
function mastermind(ctx: Ctx): Built {
  const { r } = ctx;
  const all: string[] = [];
  for (let n = 0; n < 1000; n++) {
    const t = String(n).padStart(3, '0');
    if (new Set(t).size === 3) all.push(t);
  }
  const fb = (g: string, s: string) => {
    let hit = 0, both = 0;
    for (let i = 0; i < 3; i++) {
      if (s.includes(g[i]!)) hit++;
      if (s[i] === g[i]) both++;
    }
    return [hit, both] as const;
  };
  for (;;) {
    const secret = pick(r, all);
    let cand = all;
    const rows: string[] = [];
    for (let k = 0; k < 40 && cand.length > 1 && rows.length < 6; k++) {
      const g = pick(r, all);
      if (g === secret) continue;
      const f = fb(g, secret);
      const next = cand.filter((c) => { const h = fb(g, c); return h[0] === f[0] && h[1] === f[1]; });
      if (next.length === cand.length) continue;
      cand = next;
      rows.push(`${g.split('').join(' ')} → 맞는 숫자 ${f[0]}개 (그중 제자리 ${f[1]}개)`);
    }
    if (cand.length !== 1 || rows.length < 4) continue;
    const paper = note(ctx.id('mm'), '구겨진 쪽지', '📝', `「세 자리 비밀번호, 숫자는 모두 달라요.」\n${rows.join('\n')}`);
    const lock = box(ctx, secret, '숫자 3자리', '세 자리 숫자를 넣어야 해요.');
    return { spots: [paper, lock], lockId: lock.id, hint: '구겨진 쪽지의 줄들을 비교해요. "맞는 숫자 0개"인 줄이 있으면 그 숫자부터 지우고, 제자리 개수로 자리를 좁혀 보세요.', steps: [{ a: 'tap', o: paper.id }, { a: 'code', o: lock.id, v: secret }] };
  }
}

// 2) 개수 세기: 쪽지에 적힌 순서대로 방 안 물건의 개수를 세요.
const COUNTABLE: { name: string; emoji: string; say: (a: number, b: number) => string; what: string }[] = [
  { name: '어항', emoji: '🐠', what: '물고기', say: (a, b) => `빨간 물고기 ${a}마리가 수초 사이를 돌고, 노란 물고기 ${b}마리는 바닥 돌 틈에 숨어 있어요.` },
  { name: '촛대', emoji: '🕯️', what: '초', say: (a, b) => `불 켜진 초 ${a}개, 다 타서 심지만 남은 초 ${b}개가 꽂혀 있어요.` },
  { name: '꽃병', emoji: '💐', what: '꽃', say: (a, b) => `활짝 핀 꽃 ${a}송이 옆에 아직 봉오리인 꽃 ${b}송이가 있어요.` },
  { name: '별 그림', emoji: '🌌', what: '별', say: (a, b) => `밤하늘 그림 위쪽에 큰 별 ${a}개, 구석에 작은 별 ${b}개가 그려져 있어요.` },
  { name: '과일 바구니', emoji: '🧺', what: '사과', say: (a, b) => `빨간 사과 ${a}개와 풋사과 ${b}개, 그리고 배 몇 개가 섞여 있어요.` },
  { name: '책꽂이', emoji: '📚', what: '책', say: (a, b) => `윗칸에 책 ${a}권, 아랫칸에 책 ${b}권이 꽂혀 있어요. 맨 아래 칸은 비었어요.` },
  { name: '화분 선반', emoji: '🪴', what: '선인장', say: (a, b) => `선반 위에 선인장 ${a}개, 바닥에 내려놓은 선인장 ${b}개가 있어요.` },
  { name: '단추 통', emoji: '🔘', what: '단추', say: (a, b) => `구멍 두 개짜리 단추 ${a}개와 구멍 네 개짜리 단추 ${b}개가 섞여 있어요.` },
];
function counting(ctx: Ctx): Built {
  const { r } = ctx;
  const kinds = shuffle(r, COUNTABLE).slice(0, 4);
  const nums = kinds.map(() => 2 + Math.floor(r() * 8));
  const parts = nums.map((n) => { const a = 1 + Math.floor(r() * (n - 1)); return [a, n - a] as const; });
  const order = kinds.slice(0, 3);
  const code = order.map((_, i) => nums[i]).join('');
  const spots: Spot[] = kinds.map((k, i) => ({ id: ctx.id(`cnt${i}`), name: k.name, emoji: k.emoji, look: k.say(parts[i]![0], parts[i]![1]), memo: true, wall: k.name.includes('그림') }));
  const paper = note(ctx.id('cntn'), '수수께끼 메모', '📌', `「${order.map((k) => k.what).join(' → ')}」\n「모두 세어라」`);
  const lock = box(ctx, code, '숫자 3자리', '숫자 세 개를 넣어야 해요.');
  return {
    spots: [paper, ...spots, lock], lockId: lock.id,
    hint: '메모에 적힌 것들을 방에서 찾아 종류에 상관없이 모두 더해 세어 보세요. 순서가 중요하고, 메모에 없는 물건은 함정이에요.',
    steps: [{ a: 'tap', o: paper.id }, ...spots.map((s) => ({ a: 'tap', o: s.id }) as const), { a: 'code', o: lock.id, v: code }],
  };
}

// 3) 색 암호: 색깔 숫자표 + 색 띠 그림
const COLORS = ['빨강', '파랑', '노랑', '초록', '보라', '주황'];
function colors(ctx: Ctx): Built {
  const { r } = ctx;
  const cs = shuffle(r, COLORS).slice(0, 5);
  const digits = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 5);
  const band = shuffle(r, cs).slice(0, 4);
  const code = band.map((c) => digits[cs.indexOf(c)]).join('');
  const legend = note(ctx.id('col1'), '물감 통', '🎨', `물감 통 뚜껑마다 숫자가 적혀 있어요: ${cs.slice(0, 3).map((c, i) => `${c} ${digits[i]}`).join(', ')}.`);
  const legend2 = note(ctx.id('col3'), '팔레트', '🖌️', `마른 팔레트 칸 아래에 숫자가 적혀 있어요: ${cs.slice(3).map((c, i) => `${c} ${digits[i + 3]}`).join(', ')}.`);
  const art = note(ctx.id('col2'), '줄무늬 그림', '🖼️', `오른쪽부터 색 띠가 이렇게 칠해져 있어요: ${[...band].reverse().join(', ')}. 서명은 왼쪽 아래에 있어요.`);
  const lock = box(ctx, code, '숫자 4자리', '네 자리 숫자를 넣어야 해요.');
  return { spots: [legend, legend2, art, lock], lockId: lock.id, hint: '물감 통과 팔레트에서 색마다 숫자를 모으고, 줄무늬 그림은 서명이 있는 왼쪽부터 읽어요.', steps: [{ a: 'tap', o: legend.id }, { a: 'tap', o: legend2.id }, { a: 'tap', o: art.id }, { a: 'code', o: lock.id, v: code }] };
}

// 4) 저울 계산: 그림 세 개의 값을 식 세 줄로 구해요.
const SETS: [string, string, string][] = [['🍎', '🍌', '🍇'], ['🍬', '🍭', '🍫'], ['🐱', '🐶', '🐰'], ['⭐', '🌙', '☀️'], ['🍩', '🍪', '🧁']];
function algebra(ctx: Ctx): Built {
  const { r } = ctx;
  const [x, y, z] = pick(r, SETS);
  for (;;) {
    const a = 1 + Math.floor(r() * 9), b = 1 + Math.floor(r() * 9), c = 1 + Math.floor(r() * 9);
    if (new Set([a, b, c]).size < 3) continue;
    const code = `${a}${b}${c}`;
    const lines = [`${x} + ${x} + ${y} = ${2 * a + b}`, `${y} + ${z} = ${b + c}`, `${x} + ${z} = ${a + c}`];
    const board = note(ctx.id('alg'), '칠판', '🧮', `칠판에 그림 식이 적혀 있어요.\n${lines.join('\n')}\n아래에 「${x}${y}${z} 순서로」`);
    const lock = box(ctx, code, '숫자 3자리', '세 자리 숫자를 넣어야 해요.');
    return { spots: [board, lock], lockId: lock.id, hint: `칠판 식 두 개를 빼 보면 ${y}와 ${x}의 차이를 알 수 있어요. 그걸 첫 줄에 넣어 보세요.`, steps: [{ a: 'tap', o: board.id }, { a: 'code', o: lock.id, v: code }] };
  }
}

// 5) 글자 조각: 여기저기 숨은 번호 붙은 글자를 모아 낱말을 만들어요.
const WORDS = ['젤리곰', '무지개', '별사탕', '솜사탕', '도토리', '말랑이', '하리보', '눈사람', '해바라기', '고양이', '보물상자', '초콜릿', '비눗방울', '오르골'];
const HIDES: [string, string, string][] = [
  ['쿠션', '🛋️', '쿠션 지퍼 안에'], ['우산꽂이', '☂️', '우산 손잡이에'], ['액자 뒤', '🖼️', '액자 뒤편에'], ['컵 받침', '☕', '컵 받침 밑면에'],
  ['달력', '📅', '달력 마지막 장에'], ['인형', '🧸', '인형 등에 붙은 쪽지에'], ['신발장', '👟', '신발장 문 안쪽에'], ['스탠드', '💡', '스탠드 갓 안쪽에'],
];
function letters(ctx: Ctx): Built {
  const { r } = ctx;
  const word = pick(r, WORDS);
  const chars = [...word];
  const hides = shuffle(r, HIDES).slice(0, chars.length);
  const spots: Spot[] = shuffle(r, chars.map((ch, i) => ({ ch, i })))
    .map(({ ch, i }, k) => ({ id: ctx.id(`let${k}`), name: hides[k]![0], emoji: hides[k]![1], look: `${hides[k]![2]} 「${ch}」 한 글자가 적혀 있어요.`, memo: true, wall: hides[k]![0] === '액자 뒤' || hides[k]![0] === '달력' }));
  const lock = box(ctx, word, `글자 ${chars.length}자`, `글자 ${chars.length}자 낱말을 넣어야 해요. 자물쇠에 「흩어진 글자는 하나의 낱말」이라고 새겨져 있어요.`);
  return { spots: [...spots, lock], lockId: lock.id, hint: `방 곳곳에 글자 ${chars.length}개가 숨어 있어요. 모두 모아 순서를 바꿔 가며 뜻이 있는 낱말을 만들어 보세요.`, steps: [...spots.map((s) => ({ a: 'tap', o: s.id }) as const), { a: 'code', o: lock.id, v: word }] };
}

// 6) 시계 순서: 오전·오후가 섞인 시계들을 이른 시각부터 줄 세워요.
function clocks(ctx: Ctx): Built {
  const { r } = ctx;
  const hours = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
  const pm = hours.map(() => r() < 0.5);
  if (pm.every((x) => x === pm[0])) pm[0] = !pm[0];
  const mins = hours.map(() => Math.floor(r() * 12) * 5);
  const t = (i: number) => (pm[i] ? 12 : 0) + hours[i]! + mins[i]! / 60;
  const order = [0, 1, 2].sort((a, b) => t(a) - t(b));
  const code = order.map((i) => hours[i]).join('');
  const names: [string, string][] = [['벽시계', '🕰️'], ['손목시계', '⌚'], ['자명종', '⏰']];
  const spots: Spot[] = [0, 1, 2].map((i) => ({ id: ctx.id(`clk${i}`), name: names[i]![0], emoji: names[i]![1], look: `${names[i]![0]}${josa(names[i]![0], '이', '가')} ${pm[i] ? '오후' : '오전'} ${hours[i]}시 ${mins[i] ? `${mins[i]}분` : '정각'}에 멈춰 있어요.`, memo: true, wall: i === 0 }));
  const paper = note(ctx.id('clkn'), '시간표 쪽지', '🗒️', '「이른 것부터. 시(時)만.」');
  const lock = box(ctx, code, '숫자 3자리', '세 자리 숫자를 넣어야 해요.');
  return { spots: [paper, ...spots, lock], lockId: lock.id, hint: '오전이 오후보다 이르다는 걸 잊지 마세요. 멈춘 시계 세 개의 시각을 이른 순서로 줄 세워 보세요.', steps: [{ a: 'tap', o: paper.id }, ...spots.map((s) => ({ a: 'tap', o: s.id }) as const), { a: 'code', o: lock.id, v: code }] };
}

// 7) 전등 합: 켜진 등 숫자 합과 꺼진 등 숫자 합을 두 자리씩
function lamps(ctx: Ctx): Built {
  const { r } = ctx;
  const nums = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
  const on = nums.map(() => r() < 0.5);
  if (on.every(Boolean)) on[0] = false;
  if (!on.some(Boolean)) on[0] = true;
  const sum = (b: boolean) => nums.filter((_, i) => on[i] === b).reduce((a, n) => a + n, 0);
  const code = `${String(sum(true)).padStart(2, '0')}${String(sum(false)).padStart(2, '0')}`;
  const spots: Spot[] = nums.map((n, i) => ({ id: ctx.id(`lmp${i}`), name: `${i + 1}번 전등`, emoji: on[i] ? '💡' : '🔌', look: `전등에 「${n}」이 새겨져 있어요. 불이 ${on[i] ? '켜져' : '꺼져'} 있어요.`, memo: true, wall: true }));
  const paper = note(ctx.id('lmpn'), '전기 설명서', '📘', '「빛의 합, 그다음 어둠의 합. 둘 다 두 자리로.」', false);
  const lock = box(ctx, code, '숫자 4자리', '네 자리 숫자를 넣어야 해요.');
  return { spots: [paper, ...spots, lock], lockId: lock.id, hint: '전등을 하나씩 눌러 숫자와 켜짐·꺼짐을 확인하고, 두 묶음으로 나눠 더해 보세요.', steps: [{ a: 'tap', o: paper.id }, ...spots.map((s) => ({ a: 'tap', o: s.id }) as const), { a: 'code', o: lock.id, v: code }] };
}

const CODE_MODULES = [mastermind, counting, colors, algebra, letters, clocks, lamps];
const SIZE = new Map<(c: Ctx) => Built, number>([[mastermind, 2], [counting, 6], [colors, 4], [algebra, 2], [letters, 5], [clocks, 5], [lamps, 6]]);

// 수수께끼: 답이 되는 물건을 눌러야 숨긴 물건이 나와요(틀린 물건은 그냥 비어 있어요).
const RIDDLES: { name: string; emoji: string; text: string }[] = [
  { name: '의자', emoji: '🪑', text: '다리가 넷인데 한 걸음도 못 걸어요.' },
  { name: '양초', emoji: '🕯️', text: '키가 클 때 가장 어리고, 늙을수록 작아져요.' },
  { name: '우산', emoji: '☂️', text: '비 오는 날에만 활짝 펴요.' },
  { name: '거울', emoji: '🪞', text: '나를 보면 네가 보여요.' },
  { name: '달력', emoji: '📅', text: '날마다 한 장씩 얇아져요.' },
  { name: '피아노', emoji: '🎹', text: '이는 많은데 아무것도 못 씹어요.' },
  { name: '주전자', emoji: '🫖', text: '화가 나면 머리에서 김이 나요.' },
  { name: '베개', emoji: '🛏️', text: '밤마다 머리를 받쳐 주고 꿈 이야기를 제일 먼저 들어요.' },
];
function riddle(ctx: Ctx): Built {
  const { r } = ctx;
  const opts = shuffle(r, RIDDLES).slice(0, 3);
  const ans = opts[0]!;
  const paper = note(ctx.id('rdn'), '수수께끼 카드', '🃏', `「${ans.text} 나는 무엇일까요? 내 곁을 살펴봐요.」`);
  const spots: Spot[] = opts.map((o, i) =>
    i === 0
      ? { id: ctx.id('rd0'), name: o.name, emoji: o.emoji, look: `${o.name} 곁을 살펴보니… ${ctx.reward.text}`, again: `${o.name} 곁엔 이제 아무것도 없어요.`, take: ctx.reward.take, clue: ctx.reward.clue, wall: o.name === '거울' || o.name === '달력' }
      : { id: ctx.id(`rd${i}`), name: o.name, emoji: o.emoji, look: `${o.name}${josa(o.name, '이에요', '예요')}. 특별한 건 없어요.`, wall: o.name === '거울' || o.name === '달력' },
  );
  return { spots: [paper, ...shuffle(r, spots)], lockId: spots[0]!.id, hint: '수수께끼 카드의 답이 되는 물건을 방에서 찾아 눌러 보세요.', steps: [{ a: 'tap', o: paper.id }, { a: 'tap', o: spots[0]!.id }] };
}

// 물건 합치기: 두 조각을 합쳐 도구를 만들고, 그 도구로 증거를 찾아요.
const COMBOS: { a: [string, string]; b: [string, string]; out: [string, string]; make: string; spot: [string, string]; spotLook: string; use: string }[] = [
  { a: ['빈 손전등', '🔦'], b: ['건전지', '🔋'], out: ['켜지는 손전등', '💡'], make: '건전지를 끼우자 손전등이 반짝 켜졌어요!', spot: ['깜깜한 침대 밑', '🛏️'], spotLook: '침대 밑이 너무 깜깜해서 아무것도 안 보여요.', use: '손전등을 비추자 침대 밑에서' },
  { a: ['자석', '🧲'], b: ['털실', '🧶'], out: ['자석 낚싯줄', '🎣'], make: '털실에 자석을 묶어 낚싯줄을 만들었어요!', spot: ['좁은 배수구', '🕳️'], spotLook: '배수구 안쪽에 뭔가 반짝이는데 손이 안 들어가요.', use: '자석 낚싯줄을 내리자 배수구 안에서' },
  { a: ['사다리 윗부분', '🪜'], b: ['사다리 아랫부분', '🪵'], out: ['접이식 사다리', '🪜'], make: '두 조각을 딸깍 맞추니 사다리가 됐어요!', spot: ['높은 선반', '🗄️'], spotLook: '선반이 너무 높아서 위가 안 보여요.', use: '사다리를 타고 올라가 보니 선반 위에서' },
  { a: ['돋보기 렌즈', '🔎'], b: ['돋보기 손잡이', '🥢'], out: ['돋보기', '🔍'], make: '렌즈를 손잡이에 끼워 돋보기를 만들었어요!', spot: ['깨알 글씨 액자', '🖼️'], spotLook: '액자에 깨알만 한 글씨가 빼곡해요. 맨눈으로는 못 읽어요.', use: '돋보기로 들여다보니 깨알 글씨 사이에서' },
  { a: ['빈 물뿌리개', '🪣'], b: ['물병', '🍶'], out: ['물 담은 물뿌리개', '🚿'], make: '물병의 물을 부어 물뿌리개를 채웠어요!', spot: ['바싹 마른 화분', '🪴'], spotLook: '흙이 돌처럼 굳어 있어요. 물을 주면 부드러워질 것 같아요.', use: '물을 주고 흙을 살살 파 보니 화분 속에서' },
  { a: ['열쇠 머리', '🔑'], b: ['열쇠 몸통', '🔩'], out: ['이어 붙인 열쇠', '🗝️'], make: '두 조각을 끼워 맞추니 열쇠 하나가 됐어요!', spot: ['낡은 장식장', '🗃️'], spotLook: '장식장이 잠겨 있어요. 열쇠 구멍 모양이 특이해요.', use: '열쇠를 돌려 장식장을 열어 보니' },
];

export function buildCase(seed: StorySeed, level = 3): EscCase {
  const r = rng(`escape:${seed.id}`);
  const used = new Set<string>();
  const scenes = seed.rooms.map((name, i) => {
    const [wall, floor] = PALETTE[(i * 3 + Math.floor(r() * PALETTE.length)) % PALETTE.length]!;
    return { id: `r${i + 1}`, name, wall, floor };
  });
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
  const combo = pick(r, COMBOS);
  items.key12 = { name: `${seed.rooms[1]} 열쇠`, emoji: '🗝️' };
  items.partA = { name: combo.a[0], emoji: combo.a[1] };
  items.partB = { name: combo.b[0], emoji: combo.b[1] };
  items.tool = { name: combo.out[0], emoji: combo.out[1] };

  // 퍼즐 장치 고르기: 서로 다른 4개, 방 2(장치 2개)는 너무 붐비지 않게
  let mods = shuffle(r, CODE_MODULES).slice(0, 4);
  for (let k = 0; k < 50 && (SIZE.get(mods[1]!)! + SIZE.get(mods[2]!)! > 9 || SIZE.get(mods[0]!)! > 6 || SIZE.get(mods[3]!)! > 6); k++) mods = shuffle(r, CODE_MODULES).slice(0, 4);
  let n = 0;
  const ctx = (reward: Reward, lock?: Spot): Ctx => ({ r, used, reward, lock, id: (k) => `${k}${++n}`, });

  const sceneSpots: Spot[][] = [[], [], []];
  const hints: EscCase['hints'] = [];
  const steps: EscAction[] = [];
  const add = (scene: number, b: Built) => {
    sceneSpots[scene]!.push(...b.spots);
    hints.push({ until: b.lockId, text: b.hint });
  };

  // 방 1: 용의자 파일, 장치 A(→ 방 2 열쇠), 수수께끼(→ 조각 A), 방 2로 가는 문
  const file = note('file', '용의자 파일', '📁', `용의자 네 명의 특징이에요.\n${sus.map((s) => `• ${s.name} (${s.role}): ${traits.map((t, i) => t.v[s.p[i]!]).join(' · ')}`).join('\n')}`, false);
  sceneSpots[0]!.push(file);
  steps.push({ a: 'tap', o: 'file' });
  const A = mods[0]!(ctx({ take: ['key12'], text: `안에서 ${items.key12.name}를 찾았어요!` }));
  add(0, A);
  steps.push(...A.steps);
  const R1 = riddle(ctx({ take: ['partA'], text: `${combo.a[0]}${josa(combo.a[0], '을', '를')} 찾았어요!` }));
  add(0, R1);
  steps.push(...R1.steps);
  const door12: Spot = { id: 'door12', name: `${seed.rooms[1]} 문`, emoji: '🚪', big: true, look: `${seed.rooms[1]}(으)로 가는 문이 잠겨 있어요.`, lock: { kind: 'item', item: 'key12' }, openText: '문이 열렸어요! 한 번 더 누르면 들어가요.', goto: 'r2' };
  hints.push({ until: 'door12', text: `찾은 열쇠로 ${seed.rooms[1]} 문을 열어 보세요.` });
  steps.push({ a: 'use', o: 'door12', i: 'key12' }, { a: 'tap', o: 'door12' });

  // 방 2: 장치 B(→ 증거 1 + 조각 B), 장치 C(= 방 3 문 비밀번호)
  const back21: Spot = { id: 'door21', name: `${seed.rooms[0]}(으)로`, emoji: '🚪', big: true, look: `${seed.rooms[0]}(으)로 돌아가요.`, goto: 'r1' };
  const B = mods[1]!(ctx({ take: ['partB'], clue: 'ev1', text: `${combo.b[0]}${josa(combo.b[0], '이', '가')} 들어 있고, 바닥에 이상한 흔적이 있어요. (수첩에 적었어요)` }));
  add(1, B);
  steps.push(...B.steps);
  steps.push({ a: 'combine', i: 'partA', j: 'partB' });
  const door23Base: Spot = { id: 'door23', name: `${seed.rooms[2]} 문`, emoji: '🚪', big: true, look: `${seed.rooms[2]}(으)로 가는 문에 비밀번호 자물쇠가 달려 있어요.`, openText: '문이 열렸어요! 한 번 더 누르면 들어가요.', goto: 'r3' };
  const C = mods[2]!(ctx({ text: '' }, door23Base));
  const door23 = C.spots.find((s) => s.id === 'door23')!;
  door23.goto = 'r3';
  add(1, C);
  steps.push(...C.steps, { a: 'tap', o: 'door23' });

  // 방 3: 도구 쓰는 곳(→ 증거 2 + 방법), 장치 D(→ 증거 3 + 동기)
  const back32: Spot = { id: 'door32', name: `${seed.rooms[1]}(으)로`, emoji: '🚪', big: true, look: `${seed.rooms[1]}(으)로 돌아가요.`, goto: 'r2' };
  const tool: Spot = { id: 'toolspot', name: combo.spot[0], emoji: combo.spot[1], big: true, look: combo.spotLook, lock: { kind: 'item', item: 'tool' }, openText: `${combo.use} 증거가 나왔어요! (수첩에 적었어요)`, again: '더 찾을 건 없어요.', clue: ['ev2', 'method'] };
  hints.push({ until: 'toolspot', text: `가방 속 ${combo.a[0]}와(과) ${combo.b[0]}을(를) 「합치기」로 합쳐서 ${combo.out[0]}${josa(combo.out[0], '을', '를')} 만들고, ${seed.rooms[2]}의 ${combo.spot[0]}에 써 보세요.` });
  steps.push({ a: 'use', o: 'toolspot', i: 'tool' });
  const D = mods[3]!(ctx({ clue: ['ev3', 'motive'], text: '안에 중요한 증거가 들어 있어요! (수첩에 적었어요)' }));
  add(2, D);
  steps.push(...D.steps);
  sceneSpots[1]!.unshift(back21);
  sceneSpots[2]!.unshift(back32, tool);
  sceneSpots[0]!.push(door12);
  const order = [A.lockId, R1.lockId, 'door12', B.lockId, C.lockId, 'toolspot', D.lockId];
  hints.sort((a, b) => order.indexOf(a.until) - order.indexOf(b.until));
  hints.push({ until: '', text: '용의자 파일과 수첩의 증거 세 개를 맞춰 보세요. 증거 하나만으로는 범인이 둘 이상 남지만, 세 개를 모두 맞추면 한 명만 남아요. 방법·동기도 수첩에 있어요.' });

  // 자리 배치
  const objects: EscObject[] = [];
  sceneSpots.forEach((list, si) => {
    const wall = [...WALL];
    const floor = [...FLOOR];
    for (const sp of list) {
      const { wall: onWall, ...o } = sp;
      if (o.goto) {
        const back = o.id === 'door21' || o.id === 'door32';
        objects.push({ ...o, scene: `r${si + 1}`, x: back ? 7 : 92, y: 50 });
        continue;
      }
      const slot = (onWall ? wall.shift() ?? floor.shift() : floor.shift() ?? wall.shift())!;
      if (!slot) throw new Error(`자리 부족: ${seed.id} r${si + 1}`);
      objects.push({ ...o, scene: `r${si + 1}`, x: slot[0], y: slot[1], big: o.big && slot[1] > 30 ? true : undefined });
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
  };
}
