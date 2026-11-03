// 하리보 원정대 1구역: 안개숲
// 한 판의 상태는 "시작할 때 정한 것(씨앗·대원)"과 "지금까지 고른 것"만으로 언제나 똑같이 다시 계산돼요.
// 그래서 DB에는 고른 번호만 적고, 주사위도 서버가 씨앗으로 굴려요(새로고침해도 결과가 바뀌지 않아요).

import { levelFromXp } from './levels';

// ── 역할 ───────────────────────────────────────────────

export const ROLES = [
  { id: 'scout', name: '탐색가', icon: '🔍', good: '숨은 길과 함정을 찾아요' },
  { id: 'guard', name: '수호자', icon: '🛡️', good: '부수고, 대신 맞아요' },
  { id: 'mage', name: '마법사', icon: '✨', good: '봉인과 마법을 다뤄요(마력을 써요)' },
  { id: 'healer', name: '치유사', icon: '🌿', good: '체력을 돌보고 독을 구별해요' },
  { id: 'talker', name: '협상가', icon: '💬', good: '상인·도둑과 말로 풀어요' },
  { id: 'scribe', name: '기록가', icon: '📜', good: '옛 글씨를 읽고 단서를 모아요' },
] as const;
export type RoleId = (typeof ROLES)[number]['id'];

export const isRole = (v: unknown): v is RoleId => ROLES.some((r) => r.id === v);
export const roleOf = (id: RoleId) => ROLES.find((r) => r.id === id)!;

// 아직 역할을 안 고른 멤버는 ID로 늘 같은 역할이에요
export function defaultRole(userId: string): RoleId {
  return ROLES[hash(userId) % ROLES.length]!.id;
}

// ── 오늘의 컨디션(판마다 무작위, 실제 성격과는 상관없어요) ───────────

export const CONDITIONS = [
  { id: 'lucky', name: '행운', text: '판정 +1' },
  { id: 'sleepy', name: '졸림', text: '판정 -1' },
  { id: 'hungry', name: '배고픔', text: '시작 식량 -1' },
  { id: 'cheer', name: '신남', text: '시작 체력 +1' },
  { id: 'plain', name: '보통', text: '' },
  { id: 'plain', name: '보통', text: '' },
] as const;
export type ConditionId = (typeof CONDITIONS)[number]['id'];
export const conditionOf = (id: ConditionId) => CONDITIONS.find((c) => c.id === id)!;

// ── 발견품(도감처럼 모아요) ───────────────────────────────

export const FINDS = [
  { id: 'moss', name: '빛나는 이끼', icon: '🍀', rare: 'common' },
  { id: 'acorn', name: '은빛 도토리', icon: '🌰', rare: 'common' },
  { id: 'feather', name: '안개새 깃털', icon: '🪶', rare: 'common' },
  { id: 'pebble', name: '노래하는 조약돌', icon: '🪨', rare: 'common' },
  { id: 'mushroom', name: '무지개 버섯', icon: '🍄', rare: 'common' },
  { id: 'bell', name: '녹슨 방울', icon: '🔔', rare: 'common' },
  { id: 'compass', name: '거꾸로 나침반', icon: '🧭', rare: 'rare' },
  { id: 'lantern', name: '꺼지지 않는 등불', icon: '🏮', rare: 'rare' },
  { id: 'map', name: '찢어진 옛 지도', icon: '🗺️', rare: 'rare' },
  { id: 'crystal', name: '안개 수정', icon: '🔮', rare: 'rare' },
  { id: 'crown', name: '숲의 왕관', icon: '👑', rare: 'legend' },
  { id: 'diary', name: '사라진 탐험대의 일기장', icon: '📔', rare: 'legend' },
] as const;
export type FindId = (typeof FINDS)[number]['id'];
export const findOf = (id: string) => FINDS.find((f) => f.id === id);

// ── 대원과 판 상태 ─────────────────────────────────────

export type Crew = {
  id: string | null; // null이면 견습 대원
  name: string;
  art: string;
  role: RoleId;
  bonus: number; // 카드 레벨 보너스(Lv30+ 1, Lv60+ 2)
  cond: ConditionId;
};

export const STEPS = 7;
export const START = { hp: 9, food: 7, mana: 3 } as const;
export const HEALER_USES = 2;

export function levelBonus(xp: number): number {
  const lv = levelFromXp(xp);
  return lv >= 60 ? 2 : lv >= 30 ? 1 : 0;
}

export type PathKind = 'danger' | 'treasure' | 'unknown' | 'rest' | 'boss';
export const PATH_INFO: Record<PathKind, { name: string; icon: string }> = {
  danger: { name: '위험해 보이는 길', icon: '⚔️' },
  treasure: { name: '반짝이는 길', icon: '💎' },
  unknown: { name: '안개가 짙은 길', icon: '❓' },
  rest: { name: '조용한 쉼터', icon: '⛺' },
  boss: { name: '숲의 가장 깊은 곳', icon: '🦌' },
};

export type Ending = 'treasure' | 'retreat' | 'hidden';
export const ENDINGS: Record<Ending, { name: string; text: string }> = {
  treasure: { name: '보물 발견', text: '숲의 주인을 지나 안개 너머의 보물을 찾았어요!' },
  retreat: { name: '무사 귀환', text: '더 가기는 힘들어서 마을로 돌아왔어요. 주운 물건은 그대로 가져왔어요.' },
  hidden: { name: '숨은 결말', text: '숲의 주인이 길을 열어 주었어요. 안쪽에서 사라진 탐험대의 일기장을 찾았어요.' },
};

export type LogLine = { text: string; good?: boolean; bad?: boolean };

export type Roll = { who: string; die: number; total: number; need: number; ok: boolean };
export type LastResult = {
  kind: 'move' | 'event';
  roll: Roll | null;
  delta: { hp: number; food: number; mana: number };
  finds: FindId[]; // 이번에 주운 물건
};

export type RunState = {
  step: number; // 지금 몇 번째 칸(1~7). 길을 고르기 전에는 이전 칸 번호
  phase: 'path' | 'event' | 'done';
  hp: number;
  food: number;
  mana: number;
  heals: number; // 치유사가 남은 횟수
  flags: string[];
  used: string[]; // 이미 만난 사건
  finds: FindId[];
  paths: PathKind[]; // phase = 'path'일 때 고를 수 있는 길
  event: string | null; // phase = 'event'일 때 지금 사건 id
  intro: string; // 지금 사건 소개 문장
  mood: number; // 대원 분위기(다음 판정 한 번에 더하거나 빼요)
  log: LogLine[]; // 바로 앞 선택의 결과
  last: LastResult | null; // 바로 앞 선택의 결과를 크게 보여 줄 때 쓰는 값(판정·변화량)
  journal: string[]; // 원정 일지(끝나면 보여 줘요)
  ending: Ending | null;
};

// ── 사건 ───────────────────────────────────────────────

type Delta = { hp?: number; food?: number; mana?: number };
type Outcome = Delta & { text: string; find?: 'common' | 'rare' | FindId; flag?: string; mood?: number; end?: Ending };

export type EventOption = {
  label: string;
  role?: RoleId; // 이 역할 대원이 있을 때만 보여요
  cost?: Delta; // 고르면 먼저 내는 것(음수)
  heal?: boolean; // 치유사 횟수를 써요
  need?: string[]; // 이 기록(flag)이 있어야 보여요
  check?: number; // 주사위(1~6)+보너스가 이 값 이상이면 성공. 없으면 판정 없이 win
  win: Outcome;
  lose?: Outcome;
  stay?: boolean; // 실패하면 같은 사건에 남아요(마지막 칸)
};

export type EventDef = { id: string; kind: PathKind; name: string; intros: string[]; options: EventOption[] };

export const EVENTS: EventDef[] = [
  {
    id: 'bridge',
    kind: 'danger',
    name: '무너지는 다리',
    intros: ['낡은 밧줄 다리가 삐걱거려요. 아래는 안개로 바닥이 보이지 않아요.', '계곡 위 나무다리 판자가 군데군데 빠져 있어요.'],
    options: [
      { label: '조심조심 건넌다', check: 4, win: { text: '{name}이(가) 앞장서서 무사히 건넜어요.' }, lose: { text: '판자가 부서져 다 같이 넘어졌어요.', hp: -3 } },
      { label: '돌아가는 길을 찾는다', role: 'scout', cost: { food: -1 }, win: { text: '{name}이(가) 안전한 옛길을 찾았어요. 길가에서 뭔가 주웠어요.', find: 'common' } },
      { label: '마법으로 다리를 고친다', role: 'mage', cost: { mana: -1 }, win: { text: '{name}의 마법으로 다리가 튼튼해졌어요.', mood: 1 } },
    ],
  },
  {
    id: 'door',
    kind: 'danger',
    name: '잠긴 돌문',
    intros: ['이끼 낀 커다란 돌문이 길을 막고 있어요. 열쇠 구멍은 보이지 않아요.', '나무뿌리에 감긴 돌문 너머에서 바람 소리가 나요.'],
    options: [
      { label: '비밀 통로를 찾는다', role: 'scout', check: 3, win: { text: '{name}이(가) 문 옆 틈을 찾아냈어요. 안에 떨어진 물건도 있었어요.', find: 'rare' }, lose: { text: '통로를 못 찾고 시간만 흘렀어요.', food: -2 } },
      { label: '힘껏 부순다', role: 'guard', check: 3, win: { text: '{name}이(가) 문을 밀어 부쉈어요!' }, lose: { text: '문은 열렸지만 돌 조각에 맞았어요.', hp: -2 } },
      { label: '봉인을 푼다', role: 'mage', cost: { mana: -1 }, win: { text: '{name}의 주문에 문이 스르르 열렸어요.' } },
      { label: '문을 두고 먼 길로 간다', win: { text: '먼 길로 돌아가느라 지치고 식량도 많이 썼어요.', food: -2, hp: -1 } },
    ],
  },
  {
    id: 'thief',
    kind: 'danger',
    name: '숲 도둑',
    intros: ['가면을 쓴 숲 도둑들이 길을 막았어요. "가진 걸 내놔!"', '나무 위에서 도둑들이 내려와 짐을 노려요.'],
    options: [
      { label: '맞서 싸운다', role: 'guard', check: 4, win: { text: '{name}이(가) 도둑들을 쫓아냈어요. 도둑이 떨군 물건을 주웠어요.', find: 'common' }, lose: { text: '이기긴 했지만 다들 다쳤어요.', hp: -3 } },
      { label: '말로 설득한다', role: 'talker', check: 3, win: { text: '{name}의 말솜씨에 도둑들이 길을 비켜 줬어요. 식량도 조금 나눠 줬어요.', food: 2 }, lose: { text: '설득이 통하지 않아 식량을 빼앗겼어요.', food: -3 } },
      { label: '짐을 지키며 도망친다', check: 3, win: { text: '안개 속으로 무사히 도망쳤어요.' }, lose: { text: '도망치다 식량 주머니를 떨어뜨렸어요.', food: -2 } },
    ],
  },
  {
    id: 'chest',
    kind: 'treasure',
    name: '수상한 보물상자',
    intros: ['풀숲 사이에 반짝이는 상자가 놓여 있어요. 너무 쉽게 놓여 있어서 수상해요.', '오래된 나무 아래 자물쇠 달린 상자가 반쯤 묻혀 있어요.'],
    options: [
      { label: '그냥 연다', check: 4, win: { text: '상자 안에서 귀한 물건이 나왔어요!', find: 'rare' }, lose: { text: '함정이었어요! 가시가 튀어나왔어요.', hp: -3 } },
      { label: '함정부터 살핀다', role: 'scout', win: { text: '{name}이(가) 함정을 풀고 상자를 열었어요.', find: 'rare' } },
      { label: '상자를 부순다', role: 'guard', win: { text: '{name}이(가) 상자를 부쉈어요. 안의 물건이 조금 깨졌지만 하나는 멀쩡해요.', find: 'common' } },
      { label: '건드리지 않는다', win: { text: '수상한 건 피하는 게 좋겠죠. 그냥 지나갔어요.' } },
    ],
  },
  {
    id: 'merchant',
    kind: 'treasure',
    name: '길 잃은 상인',
    intros: ['커다란 배낭을 멘 상인이 길을 잃고 울상이에요.', '수레바퀴가 진흙에 빠진 상인이 도움을 청해요.'],
    options: [
      { label: '길을 알려 준다', cost: { food: -1 }, win: { text: '고마워하던 상인이 작은 선물을 줬어요.', find: 'common', mood: 1 } },
      { label: '물건을 흥정한다', role: 'talker', check: 3, win: { text: '{name}이(가) 좋은 값에 귀한 물건을 얻었어요.', find: 'rare' }, lose: { text: '흥정이 꼬여서 식량만 내줬어요.', food: -2 } },
      { label: '식량을 산다', cost: { mana: -1 }, win: { text: '마력 돌을 주고 식량을 받았어요.', food: 3 } },
      { label: '바빠서 지나친다', win: { text: '상인에게 손만 흔들고 지나갔어요.' } },
    ],
  },
  {
    id: 'stone',
    kind: 'unknown',
    name: '오래된 비석',
    intros: ['안개 속에 글씨가 새겨진 비석이 서 있어요. 아무도 읽을 수 없는 옛 글씨예요.', '이끼 덮인 비석에서 희미한 빛이 새어 나와요.'],
    options: [
      { label: '글씨를 해독한다', role: 'scribe', check: 2, win: { text: '{name}이(가) 비석을 읽었어요. "숲의 주인은 싸움이 아닌 약속을 기억한다."', flag: 'stone' }, lose: { text: '글씨가 너무 닳아서 읽지 못했어요.' } },
      { label: '마력을 흘려 넣는다', role: 'mage', cost: { mana: -1 }, win: { text: '비석이 빛나며 숨겨 둔 물건을 내놓았어요.', find: 'rare' } },
      { label: '지나친다', win: { text: '수상한 비석은 그냥 두고 지나갔어요.' } },
    ],
  },
  {
    id: 'fork',
    kind: 'unknown',
    name: '안개 속 갈림길',
    intros: ['안개가 너무 짙어서 앞이 하나도 안 보여요. 길이 두 갈래로 나뉘어요.', '똑같이 생긴 길 두 개가 안개 속으로 이어져요.'],
    options: [
      { label: '왼쪽으로 간다', check: 4, win: { text: '왼쪽 길 끝에서 반짝이는 걸 주웠어요.', find: 'common' }, lose: { text: '빙빙 돌다 제자리로 왔어요.', food: -2 } },
      { label: '오른쪽으로 간다', check: 3, win: { text: '오른쪽 길은 지름길이었어요!', food: 1 }, lose: { text: '가시덤불에 긁혔어요.', hp: -2 } },
      { label: '안개가 걷힐 때까지 기다린다', cost: { food: -2 }, win: { text: '한참 기다리니 길이 보였어요.', hp: 1 } },
      { label: '발자국을 따라간다', role: 'scout', win: { text: '{name}이(가) 옛 탐험대의 발자국을 찾았어요.', find: 'common', flag: 'steps' } },
    ],
  },
  {
    id: 'shroom',
    kind: 'unknown',
    name: '버섯 밭',
    intros: ['알록달록한 버섯이 잔뜩 자라 있어요. 맛있어 보이지만…', '달콤한 냄새가 나는 버섯 밭을 만났어요.'],
    options: [
      { label: '따 먹는다', check: 4, win: { text: '맛있는 버섯이었어요! 배가 든든해요.', food: 3 }, lose: { text: '독버섯이었어요… 배가 아파요.', hp: -3 } },
      { label: '먹을 수 있는 것만 고른다', role: 'healer', win: { text: '{name}이(가) 좋은 버섯만 골라 냈어요. 희귀한 버섯도 하나 있었어요.', food: 3, find: 'mushroom' } },
      { label: '지나친다', win: { text: '버섯은 눈으로만 보고 지나갔어요.' } },
    ],
  },
  {
    id: 'fox',
    kind: 'unknown',
    name: '다친 여우',
    intros: ['덫에 걸린 하얀 여우가 낑낑거려요.', '다리를 다친 여우가 나무 밑에 웅크리고 있어요.'],
    options: [
      { label: '치료해 준다', role: 'healer', heal: true, win: { text: '{name}이(가) 여우를 치료했어요. 여우가 고개를 끄덕이고 사라졌어요.', flag: 'fox', mood: 1 } },
      { label: '식량을 나눠 준다', cost: { food: -2 }, win: { text: '여우가 식량을 먹고 기운을 차렸어요. 숲 안쪽을 한 번 쳐다봐요.', flag: 'fox' } },
      { label: '지나친다', win: { text: '마음이 쓰였지만 그냥 지나갔어요.', mood: -1 } },
    ],
  },
  {
    id: 'quarrel',
    kind: 'unknown',
    name: '대원끼리 다툼',
    intros: ['길이 힘들어지자 {a}와(과) {b}이(가) 어느 길로 갈지 다퉈요.', '{a}와(과) {b}이(가) 마지막 간식을 두고 티격태격해요.'],
    options: [
      { label: '화해시킨다', role: 'talker', win: { text: '{name}이(가) 둘을 화해시켰어요. 분위기가 좋아졌어요.', mood: 2 } },
      { label: '간식을 더 꺼낸다', cost: { food: -1 }, win: { text: '간식을 나눠 먹고 다시 웃었어요.', mood: 1 } },
      { label: '모른 척한다', win: { text: '둘이 삐쳐서 말이 없어졌어요.', mood: -2 } },
    ],
  },
  {
    id: 'camp',
    kind: 'rest',
    name: '모닥불 쉼터',
    intros: ['누군가 쓰던 모닥불 자리가 남아 있어요. 쉬어 가기 좋아 보여요.', '바람이 잔잔한 공터예요. 별이 보여요.'],
    options: [
      { label: '푹 쉰다', cost: { food: -1 }, win: { text: '모닥불 옆에서 푹 쉬었어요.', hp: 3, mood: 1 } },
      { label: '다친 곳을 돌본다', role: 'healer', heal: true, win: { text: '{name}이(가) 모두를 치료했어요.', hp: 5 } },
      { label: '밤새 걷는다', win: { text: '쉬지 않고 걸었어요. 피곤하지만 식량은 아꼈어요.', hp: -1, food: 1 } },
    ],
  },
  {
    id: 'boss',
    kind: 'boss',
    name: '숲의 주인',
    intros: ['안개가 갈라지고 거대한 사슴 정령, 숲의 주인이 나타났어요. "이 너머로 가려는 자, 자격을 보여라."'],
    options: [
      { label: '비석의 약속을 전한다', need: ['stone', 'fox'], win: { text: '여우가 나타나 주인 곁에 앉았어요. 주인이 조용히 길을 열어 줬어요.', end: 'hidden', find: 'diary' } },
      { label: '여우를 따라간다', need: ['fox'], win: { text: '그때 그 여우가 나타나 숨은 길로 안내했어요!', end: 'treasure', find: 'crown' } },
      { label: '수수께끼에 답한다', role: 'scribe', check: 5, stay: true, win: { text: '{name}이(가) 수수께끼를 풀었어요! 주인이 길을 비켜 줬어요.', end: 'treasure', find: 'crown' }, lose: { text: '답이 틀렸어요. 바람이 몰아쳐요.', hp: -3 } },
      { label: '마법으로 겨룬다', role: 'mage', cost: { mana: -1 }, check: 5, stay: true, win: { text: '{name}의 마법이 주인을 감탄하게 했어요!', end: 'treasure', find: 'crown' }, lose: { text: '마법이 튕겨 나왔어요.', hp: -3 } },
      { label: '정면으로 맞선다', check: 6, stay: true, win: { text: '{name}이(가) 끝까지 버텼어요. 주인이 인정했어요!', end: 'treasure', find: 'crown' }, lose: { text: '주인의 뿔에 밀려났어요.', hp: -4 } },
      { label: '돌아간다', win: { text: '오늘은 여기까지. 마을로 돌아가요.', end: 'retreat' } },
    ],
  },
];

export const eventById = (id: string) => EVENTS.find((e) => e.id === id);

// ── 무작위(씨앗으로 늘 같은 결과) ─────────────────────────

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;

// ── 판 진행 ───────────────────────────────────────────────

export function rollConditions(seed: string, n: number): ConditionId[] {
  const r = rng(`${seed}:cond`);
  return Array.from({ length: n }, () => pick(r, CONDITIONS).id);
}

export function startState(seed: string, crew: Crew[]): RunState {
  const s: RunState = {
    step: 0,
    phase: 'path',
    hp: START.hp + crew.filter((c) => c.cond === 'cheer').length,
    food: START.food - crew.filter((c) => c.cond === 'hungry').length,
    mana: START.mana,
    heals: HEALER_USES,
    flags: [],
    used: [],
    finds: [],
    paths: [],
    event: null,
    intro: '',
    mood: 0,
    log: [{ text: '안개숲 입구에 도착했어요. 갈 길을 골라 주세요.' }],
    last: null,
    journal: [],
    ending: null,
  };
  s.paths = pathChoices(seed, s);
  return s;
}

const available = (kind: PathKind, used: string[]) => EVENTS.filter((e) => e.kind === kind && (kind === 'rest' || !used.includes(e.id)));

// 다음 칸으로 갈 길 2~3개(남은 사건이 있는 종류만)
export function pathChoices(seed: string, s: RunState): PathKind[] {
  if (s.step >= STEPS - 1) return ['boss'];
  const r = rng(`${seed}:path:${s.step}`);
  const kinds = (['danger', 'treasure', 'unknown', 'rest'] as PathKind[]).filter((k) => available(k, s.used).length > 0);
  // 쉼터는 첫 칸에는 안 나와요
  const pool = s.step === 0 ? kinds.filter((k) => k !== 'rest') : kinds;
  const shuffled = [...pool].sort(() => r() - 0.5);
  const n = Math.min(shuffled.length, r() < 0.5 ? 2 : 3);
  return shuffled.slice(0, n);
}

// 대원 이름을 문장에 넣어요
function fill(text: string, crew: Crew[], who: Crew | null, r: () => number): string {
  const [a, b] = [...crew].sort(() => r() - 0.5);
  return text
    .replaceAll('{name}', who?.name ?? '대원')
    .replaceAll('{a}', a?.name ?? '대원')
    .replaceAll('{b}', b?.name ?? '대원');
}

export function visibleOptions(ev: EventDef, crew: Crew[], s: RunState): { opt: EventOption; index: number; ok: boolean; why?: string }[] {
  return ev.options
    .map((opt, index) => ({ opt, index }))
    .filter(({ opt }) => (!opt.role || crew.some((c) => c.role === opt.role)) && (!opt.need || opt.need.every((f) => s.flags.includes(f))))
    .map(({ opt, index }) => {
      if (opt.cost?.food && s.food + opt.cost.food < 0) return { opt, index, ok: false, why: '식량이 모자라요' };
      if (opt.cost?.mana && s.mana + opt.cost.mana < 0) return { opt, index, ok: false, why: '마력이 모자라요' };
      if (opt.heal && s.heals <= 0) return { opt, index, ok: false, why: '치유를 다 썼어요' };
      return { opt, index, ok: true };
    });
}

// 이 선택을 누가 하나: 역할 선택이면 그 역할 대원 중 가장 잘하는 사람, 아니면 전체에서 가장 잘하는 사람
function performer(crew: Crew[], role?: RoleId): Crew | null {
  const list = role ? crew.filter((c) => c.role === role) : crew;
  return [...list].sort((x, y) => personal(y) - personal(x))[0] ?? null;
}
const personal = (c: Crew) => c.bonus + (c.cond === 'lucky' ? 1 : c.cond === 'sleepy' ? -1 : 0);

function giveFind(s: RunState, kind: Outcome['find'], r: () => number) {
  if (!kind) return;
  const id =
    kind === 'common' || kind === 'rare'
      ? pick(
          r,
          FINDS.filter((f) => f.rare === kind),
        ).id
      : kind;
  s.finds.push(id);
  const f = findOf(id)!;
  s.log.push({ text: `${f.icon} ${f.name}을(를) 발견했어요!`, good: true });
}

function moveCost(s: RunState) {
  if (s.food > 0) s.food -= 1;
  else {
    s.hp -= 2;
    s.log.push({ text: '식량이 떨어져서 배고픔에 체력이 줄었어요.', bad: true });
  }
}

function finish(s: RunState, ending: Ending) {
  s.phase = 'done';
  s.ending = ending;
  s.paths = [];
  s.event = null;
  if (ending === 'retreat' && !s.finds.length) s.journal.push('빈손으로 돌아왔지만 다음엔 더 멀리 갈 수 있을 거예요.');
}

// 고른 번호 하나를 반영해요. 맞지 않는 번호면 false.
// 성공하면 s.last에 판정과 체력·식량·마력 변화량을 남겨서 화면에 크게 보여 줘요.
export function applyChoice(seed: string, crew: Crew[], s: RunState, choice: number, turn: number): boolean {
  const before = { hp: s.hp, food: s.food, mana: s.mana, finds: s.finds.length, phase: s.phase };
  const note: { roll: Roll | null } = { roll: null };
  if (!step(seed, crew, s, choice, turn, note)) return false;
  s.last = {
    kind: before.phase === 'path' ? 'move' : 'event',
    roll: note.roll,
    delta: { hp: s.hp - before.hp, food: s.food - before.food, mana: s.mana - before.mana },
    finds: s.finds.slice(before.finds),
  };
  return true;
}

function step(seed: string, crew: Crew[], s: RunState, choice: number, turn: number, note: { roll: Roll | null }): boolean {
  const r = rng(`${seed}:turn:${turn}`);
  if (s.phase === 'path') {
    const kind = s.paths[choice];
    if (!kind) return false;
    s.log = [];
    s.step += 1;
    moveCost(s);
    if (s.hp <= 0) {
      s.log.push({ text: '더는 걸을 힘이 없어요…', bad: true });
      finish(s, 'retreat');
      return true;
    }
    const ev = kind === 'boss' ? eventById('boss')! : pick(r, available(kind, s.used));
    if (ev.kind !== 'rest') s.used.push(ev.id);
    s.event = ev.id;
    s.intro = fill(pick(r, ev.intros), crew, null, r);
    s.phase = 'event';
    s.journal.push(`${s.step}칸: ${PATH_INFO[kind].name} → ${ev.name}`);
    return true;
  }
  if (s.phase !== 'event' || !s.event) return false;
  const ev = eventById(s.event)!;
  const vis = visibleOptions(ev, crew, s).find((v) => v.index === choice);
  if (!vis || !vis.ok) return false;
  const opt = vis.opt;
  s.log = [];
  const who = performer(crew, opt.role);
  if (opt.cost) {
    s.food += opt.cost.food ?? 0;
    s.mana += opt.cost.mana ?? 0;
    s.hp += opt.cost.hp ?? 0;
  }
  if (opt.heal) s.heals -= 1;
  let out = opt.win;
  if (opt.check !== undefined) {
    const die = 1 + Math.floor(r() * 6);
    const total = die + (who ? personal(who) : 0) + s.mood;
    const ok = total >= opt.check;
    note.roll = { who: who?.name ?? '대원', die, total, need: opt.check, ok };
    s.mood = 0; // 분위기는 한 번 쓰면 돌아와요
    if (!ok) out = opt.lose ?? { text: '잘 되지 않았어요.' };
  }
  const good = out === opt.win;
  s.log.push({ text: fill(out.text, crew, who, r), good: good && !!opt.check, bad: !good });
  s.hp = Math.min(START.hp + 3, s.hp + (out.hp ?? 0));
  s.food = Math.max(0, s.food + (out.food ?? 0));
  s.mana = Math.max(0, s.mana + (out.mana ?? 0));
  if (out.mood) s.mood = Math.max(-2, Math.min(2, s.mood + out.mood));
  if (out.flag && !s.flags.includes(out.flag)) s.flags.push(out.flag);
  giveFind(s, out.find, r);
  s.journal.push(`  · ${opt.label}${opt.check !== undefined ? (good ? ' (성공)' : ' (실패)') : ''}`);
  if (out.end) {
    finish(s, out.end);
    return true;
  }
  if (s.hp <= 0) {
    s.log.push({ text: '모두 지쳐서 더 갈 수 없어요. 마을로 돌아가요.', bad: true });
    finish(s, 'retreat');
    return true;
  }
  if (!good && opt.stay) return true; // 마지막 칸: 다시 골라요
  s.event = null;
  s.phase = 'path';
  s.paths = pathChoices(seed, s);
  return true;
}

// 처음부터 고른 번호를 차례로 다시 돌려 지금 상태를 만들어요
export function replay(seed: string, crew: Crew[], choices: number[]): RunState {
  const s = startState(seed, crew);
  choices.forEach((c, i) => {
    if (s.phase === 'done' || !applyChoice(seed, crew, s, c, i)) throw new Error(`잘못된 선택 ${i}`);
  });
  return s;
}

// ── 보상 ───────────────────────────────────────────────

export const DAILY_REWARD_RUNS = 3;
export const RUN_XP = 10;
export function runJelly(ending: Ending): number {
  return ending === 'retreat' ? 0 : 1;
}
