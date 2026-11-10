// 하리보 원정대 (하루 모험판): "다음 날"을 누르면 내 캐릭터가 하루씩 길을 나아가요.
// 날마다 전투·상자·샘·상인·휴식 같은 일이 무작위로 생기고, 전투는 자동으로 치러요.
// 레벨이 오르면 스킬 3개 중 하나를 고르고, 10일째 강한 적, 20일째 보스를 이기면 원정 성공이에요.
// 모든 무작위는 판 씨앗(seed)과 날짜로 정해져서, 서버가 같은 입력에 늘 같은 결과를 내요.
import { rng } from './expedition';

export const DAYS = 20;
export const ELITE_DAY = 10;
export const DAILY_REWARD_JOURNEYS = 2; // 하루 첫 2판만 보상
export const journeyXp = (day: number, cleared: boolean) => (cleared ? 12 : Math.min(10, 2 + Math.floor(day / 2)));
export const journeyJelly = (cleared: boolean) => (cleared ? 1 : 0);

export type SkillId = 'power' | 'vital' | 'guard' | 'leech' | 'crit' | 'spark' | 'shield' | 'mend' | 'thorn' | 'lucky';
export const SKILLS: Record<SkillId, { name: string; icon: string; text: (lv: number) => string; max: number }> = {
  power: { name: '힘 젤리', icon: '💪', text: (l) => `공격력 +${4 * l}`, max: 5 },
  vital: { name: '말랑 체력', icon: '❤️', text: (l) => `최대 체력 +${25 * l}`, max: 5 },
  guard: { name: '단단 껍질', icon: '🛡️', text: (l) => `방어력 +${2 * l}`, max: 5 },
  leech: { name: '쪽쪽 흡수', icon: '🩸', text: (l) => `준 피해의 ${10 * l}%만큼 회복`, max: 3 },
  crit: { name: '반짝 치명타', icon: '✨', text: (l) => `${12 * l}% 확률로 2배 피해`, max: 3 },
  spark: { name: '번개 선제', icon: '⚡', text: (l) => `전투 시작에 번개 ${10 * l} 피해`, max: 3 },
  shield: { name: '첫 방패', icon: '🔰', text: (l) => `전투마다 첫 ${l}번 받는 피해 절반`, max: 3 },
  mend: { name: '전투 후 간식', icon: '🍪', text: (l) => `전투가 끝나면 체력 ${6 * l} 회복`, max: 3 },
  thorn: { name: '가시 갑옷', icon: '🌵', text: (l) => `맞을 때 ${3 * l} 되돌려 주기`, max: 3 },
  lucky: { name: '행운 주머니', icon: '🍀', text: (l) => `얻는 젤리 동전 +${30 * l}%`, max: 3 },
};
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

type Monster = { name: string; emoji: string };
const MONSTERS: Monster[] = [
  { name: '심술 버섯', emoji: '🍄' },
  { name: '말랑 슬라임', emoji: '🟢' },
  { name: '장난꾸러기 박쥐', emoji: '🦇' },
  { name: '가시 고슴도치', emoji: '🦔' },
  { name: '숲 늑대', emoji: '🐺' },
  { name: '돌 게', emoji: '🦀' },
  { name: '꿀벌 떼', emoji: '🐝' },
  { name: '안개 유령', emoji: '👻' },
];
const ELITE: Monster = { name: '숲지기 곰', emoji: '🐻' };
const BOSS: Monster = { name: '젤리 도둑 드래곤', emoji: '🐉' };

export type Line = { icon: string; text: string; tone?: 'good' | 'bad' };
export type Offer = { id: 'potion' | 'sword' | 'armor' | 'heart' | 'scroll'; price: number };
export const OFFERS: Record<Offer['id'], { name: string; icon: string; text: string; price: number }> = {
  potion: { name: '회복 물약', icon: '🧪', text: '체력 50 회복', price: 12 },
  sword: { name: '숫돌', icon: '🗡️', text: '공격력 +5', price: 20 },
  armor: { name: '헝겊 갑옷', icon: '🧥', text: '방어력 +3', price: 20 },
  heart: { name: '하트 젤리', icon: '💗', text: '최대 체력 +30', price: 22 },
  scroll: { name: '스킬 두루마리', icon: '📜', text: '스킬 하나 고르기', price: 30 },
};
export type Pending =
  | { kind: 'skill'; options: SkillId[] }
  | { kind: 'shop'; offers: Offer[] }
  | { kind: 'event'; id: EventId };
export type EventId = 'spring' | 'coin' | 'bear' | 'fork';
export const EVENTS: Record<EventId, { icon: string; title: string; text: string; options: string[] }> = {
  spring: { icon: '⛲', title: '수상한 샘', text: '반짝이는 샘물이 보글보글 끓고 있어요.', options: ['한 모금 마신다', '그냥 지나간다'] },
  coin: { icon: '🪙', title: '행운의 동전 던지기', text: '길가 요정이 동전 던지기를 하재요. 이기면 두 배, 지면 절반을 가져가요.', options: ['던진다!', '사양할게요'] },
  bear: { icon: '🧸', title: '길 잃은 젤리곰', text: '젤리곰이 배가 고파 울고 있어요. 동전 10개면 간식을 사 줄 수 있어요.', options: ['간식을 사 준다 (동전 10)', '미안, 갈 길이 바빠'] },
  fork: { icon: '🪧', title: '갈림길', text: '왼쪽 길에선 으르렁 소리가, 오른쪽 길에선 모닥불 냄새가 나요.', options: ['왼쪽: 싸우고 경험치 많이', '오른쪽: 쉬면서 회복'] },
};

export type JourneyState = {
  v: 1;
  seed: string;
  day: number; // 지난 날 수
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  lv: number;
  xp: number;
  coins: number;
  skills: Partial<Record<SkillId, number>>;
  pending: Pending | null;
  queuedLevels: number; // 아직 고르지 않은 레벨업
  today: Line[]; // 마지막으로 일어난 일
  journal: Line[]; // 지난 일(최근 것만)
  kills: number;
  done: boolean;
  cleared: boolean;
};
// next = 하루, auto = 고를 일이 생길 때까지, idle = 자동 선택(고를 일이 있으면 알아서 고르고, 없으면 하루 나아가요)
export type JourneyAction = { a: 'next' } | { a: 'auto' } | { a: 'idle' } | { a: 'pick'; n: number } | { a: 'buy'; n: number } | { a: 'leave' };

export const xpNeed = (lv: number) => 10 + lv * 10;
export function startJourney(seed: string): JourneyState {
  return {
    v: 1, seed, day: 0, hp: 100, maxHp: 100, atk: 12, def: 2, lv: 1, xp: 0, coins: 10, skills: {}, pending: null, queuedLevels: 0,
    today: [{ icon: '🎒', text: '가방을 메고 말랑 숲으로 출발! "다음 날"을 눌러 나아가요.' }], journal: [], kills: 0, done: false, cleared: false,
  };
}

// 받침 따라 을/를
const obj = (w: string) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 > 0 ? '을' : '를');
const sk = (s: JourneyState, id: SkillId) => s.skills[id] ?? 0;
export const stat = (s: JourneyState) => ({
  atk: s.atk + 4 * sk(s, 'power'),
  def: s.def + 2 * sk(s, 'guard'),
  maxHp: s.maxHp + 25 * sk(s, 'vital'),
});

function pickSkills(s: JourneyState, r: () => number, n = 3): SkillId[] {
  const pool = SKILL_IDS.filter((id) => sk(s, id) < SKILLS[id].max);
  const out: SkillId[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
  return out;
}

function gainXp(s: JourneyState, n: number, lines: Line[]) {
  s.xp += n;
  while (s.xp >= xpNeed(s.lv)) {
    s.xp -= xpNeed(s.lv);
    s.lv += 1;
    s.queuedLevels += 1;
    lines.push({ icon: '⭐', text: `레벨 업! Lv.${s.lv}`, tone: 'good' });
  }
}
function gainCoins(s: JourneyState, n: number) {
  const got = Math.round(n * (1 + 0.3 * sk(s, 'lucky')));
  s.coins += got;
  return got;
}

// 자동 전투. 결과 요약만 적어요.
function battle(s: JourneyState, m: Monster, power: number, r: () => number, lines: Line[]) {
  const st = stat(s);
  let mhp = Math.round((20 + s.day * 5) * power);
  const matk = Math.round((4 + s.day * 0.9) * (power > 1 ? 1 + (power - 1) * 0.3 : 1));
  const start = s.hp;
  let shields = sk(s, 'shield');
  let turns = 0;
  if (sk(s, 'spark')) mhp -= 10 * sk(s, 'spark');
  while (mhp > 0 && s.hp > 0 && turns < 40) {
    turns++;
    const crit = r() < 0.12 * sk(s, 'crit');
    const dmg = Math.max(1, st.atk * (crit ? 2 : 1));
    mhp -= dmg;
    if (sk(s, 'leech')) s.hp = Math.min(st.maxHp, s.hp + Math.floor((dmg * sk(s, 'leech')) / 10));
    if (mhp <= 0) break;
    let hit = Math.max(1, matk - st.def);
    if (shields > 0) {
      hit = Math.ceil(hit / 2);
      shields--;
    }
    s.hp -= hit;
    if (sk(s, 'thorn')) mhp -= 3 * sk(s, 'thorn');
  }
  if (s.hp <= 0 || mhp > 0) {
    s.hp = 0;
    lines.push({ icon: m.emoji, text: `${m.name}에게 지고 말았어요… (${turns}턴)`, tone: 'bad' });
    return false;
  }
  if (sk(s, 'mend')) s.hp = Math.min(st.maxHp, s.hp + 6 * sk(s, 'mend'));
  s.kills += 1;
  const coins = gainCoins(s, Math.round((4 + s.day) * power));
  lines.push({ icon: m.emoji, text: `${m.name}${obj(m.name)} ${turns}턴 만에 물리쳤어요! 체력 ${s.hp - start >= 0 ? '+' : ''}${s.hp - start}, 동전 +${coins}`, tone: 'good' });
  gainXp(s, Math.round((12 + s.day * 2) * power), lines);
  return true;
}

function finish(s: JourneyState, lines: Line[]) {
  if (s.hp <= 0) {
    s.done = true;
    lines.push({ icon: '🏳️', text: `${s.day}일째에 원정이 끝났어요. 다음엔 더 멀리 가 봐요!`, tone: 'bad' });
  }
}

// 하루 진행
function nextDay(s: JourneyState): Line[] {
  s.day += 1;
  const r = rng(`${s.seed}:${s.day}`);
  const lines: Line[] = [];
  const st = stat(s);
  // 아침마다 조금 회복(걷기 간식)
  s.hp = Math.min(st.maxHp, s.hp + Math.round(st.maxHp * 0.08));
  if (s.day === DAYS) {
    lines.push({ icon: '🌋', text: '마지막 날! 젤리 도둑 드래곤이 나타났어요!' });
    if (battle(s, BOSS, 1.75, r, lines)) {
      s.done = true;
      s.cleared = true;
      lines.push({ icon: '🏆', text: '드래곤을 물리치고 빼앗긴 젤리를 되찾았어요! 원정 성공!', tone: 'good' });
    }
    finish(s, lines);
    return lines;
  }
  if (s.day === ELITE_DAY) {
    lines.push({ icon: '⚠️', text: '숲 한가운데서 커다란 그림자가…' });
    battle(s, ELITE, 1.6, r, lines);
    finish(s, lines);
    return lines;
  }
  const roll = r();
  if (roll < 0.46) {
    battle(s, MONSTERS[Math.floor(r() * MONSTERS.length)]!, 1, r, lines);
  } else if (roll < 0.6) {
    const c = r();
    if (c < 0.4) lines.push({ icon: '🎁', text: `보물 상자! 동전 +${gainCoins(s, 8 + s.day)}`, tone: 'good' });
    else if (c < 0.7) {
      s.atk += 2;
      lines.push({ icon: '🎁', text: '보물 상자에서 반짝 돌을 찾았어요. 공격력 +2', tone: 'good' });
    } else {
      s.maxHp += 10;
      s.hp += 10;
      lines.push({ icon: '🎁', text: '보물 상자에서 말랑 젤리를! 최대 체력 +10', tone: 'good' });
    }
  } else if (roll < 0.76) {
    const ids = Object.keys(EVENTS) as EventId[];
    const id = ids[Math.floor(r() * ids.length)]!;
    s.pending = { kind: 'event', id };
    lines.push({ icon: EVENTS[id].icon, text: `${EVENTS[id].title}! 어떻게 할까요?` });
  } else if (roll < 0.87 && s.day >= 3) {
    const ids = Object.keys(OFFERS) as Offer['id'][];
    const offers: Offer[] = [];
    while (offers.length < 3) {
      const id = ids.splice(Math.floor(r() * ids.length), 1)[0]!;
      offers.push({ id, price: OFFERS[id].price + Math.floor(s.day / 2) });
    }
    s.pending = { kind: 'shop', offers };
    lines.push({ icon: '🛒', text: '떠돌이 상인을 만났어요. 동전으로 물건을 살 수 있어요.' });
  } else {
    const heal = Math.min(st.maxHp - s.hp, Math.round(st.maxHp * 0.3));
    s.hp += heal;
    lines.push({ icon: '🏕️', text: heal > 0 ? `모닥불에서 푹 쉬었어요. 체력 +${heal}` : '모닥불 앞에서 노래를 불렀어요. 기분이 좋아요!', tone: 'good' });
  }
  finish(s, lines);
  return lines;
}

function resolveEvent(s: JourneyState, id: EventId, n: number, lines: Line[]) {
  const r = rng(`${s.seed}:${s.day}:event`);
  const st = stat(s);
  if (id === 'spring') {
    if (n === 1) lines.push({ icon: '⛲', text: '샘을 지나쳤어요.' });
    else if (r() < 0.6) {
      s.maxHp += 15;
      s.hp = stat(s).maxHp;
      lines.push({ icon: '⛲', text: '시원하다! 최대 체력 +15, 체력이 가득 찼어요.', tone: 'good' });
    } else {
      const hurt = Math.min(s.hp - 1, 20);
      s.hp -= hurt;
      lines.push({ icon: '⛲', text: `으악, 배탈이 났어요. 체력 -${hurt}`, tone: 'bad' });
    }
  } else if (id === 'coin') {
    if (n === 1) lines.push({ icon: '🪙', text: '동전 던지기는 사양했어요.' });
    else if (r() < 0.5) {
      lines.push({ icon: '🪙', text: `이겼다! 동전 +${s.coins}`, tone: 'good' });
      s.coins *= 2;
    } else {
      const lost = Math.ceil(s.coins / 2);
      s.coins -= lost;
      lines.push({ icon: '🪙', text: `졌어요… 동전 -${lost}`, tone: 'bad' });
    }
  } else if (id === 'bear') {
    if (n === 1 || s.coins < 10) lines.push({ icon: '🧸', text: n === 0 ? '동전이 모자라 간식을 못 샀어요.' : '젤리곰에게 손을 흔들고 지나갔어요.' });
    else {
      s.coins -= 10;
      s.atk += 5;
      lines.push({ icon: '🧸', text: '젤리곰이 고맙다며 힘 젤리를 줬어요. 공격력 +5', tone: 'good' });
    }
  } else if (id === 'fork') {
    if (n === 0) battle(s, MONSTERS[Math.floor(r() * MONSTERS.length)]!, 1.3, r, lines);
    else {
      const heal = Math.min(st.maxHp - s.hp, Math.round(st.maxHp * 0.45));
      s.hp += heal;
      lines.push({ icon: '🏕️', text: `오른쪽 길 모닥불에서 쉬었어요. 체력 +${heal}`, tone: 'good' });
    }
  }
  finish(s, lines);
}

// 레벨업이 밀려 있으면 스킬 고르기를 띄워요.
function settle(s: JourneyState) {
  if (!s.done && !s.pending && s.queuedLevels > 0) {
    s.queuedLevels -= 1;
    const options = pickSkills(s, rng(`${s.seed}:${s.day}:skill:${s.lv - s.queuedLevels}`));
    if (options.length) s.pending = { kind: 'skill', options };
  }
}

// 자동 선택: 무난하고 안전한 쪽을 골라요. 사람이 고르면 더 잘할 수 있어요.
const SKILL_ORDER: SkillId[] = ['power', 'crit', 'leech', 'vital', 'guard', 'spark', 'shield', 'mend', 'thorn', 'lucky'];
const HURT_ORDER: SkillId[] = ['leech', 'vital', 'mend', 'guard', 'shield', 'power', 'crit', 'spark', 'thorn', 'lucky'];
export function autoChoice(s: JourneyState): JourneyAction | null {
  const p = s.pending;
  if (!p) return null;
  const low = s.hp < stat(s).maxHp * 0.5;
  if (p.kind === 'skill') {
    const order = low ? HURT_ORDER : SKILL_ORDER;
    let best = 0;
    p.options.forEach((id, n) => {
      if (order.indexOf(id) < order.indexOf(p.options[best]!)) best = n;
    });
    return { a: 'pick', n: best };
  }
  if (p.kind === 'event') {
    const hp = s.hp / stat(s).maxHp;
    const yes = p.id === 'spring' ? hp > 0.4 : p.id === 'coin' ? false : p.id === 'bear' ? s.coins >= 10 : hp > 0.6;
    return { a: 'pick', n: yes ? 0 : 1 };
  }
  const can = (id: Offer['id']) => p.offers.findIndex((o) => o.id === id && o.price <= s.coins);
  for (const id of (low ? ['potion', 'heart', 'scroll', 'sword', 'armor'] : ['scroll', 'sword', 'heart', 'armor']) as Offer['id'][]) {
    const n = can(id);
    if (n >= 0) return { a: 'buy', n };
  }
  return { a: 'leave' };
}

// 상태 전이(순수 함수). 할 수 없는 입력이면 null.
export function actJourney(old: JourneyState, act: JourneyAction): JourneyState | null {
  if (old.done) return null;
  if (act.a === 'idle') {
    const choice = old.pending ? autoChoice(old) : null;
    const s = actJourney(old, choice ?? { a: 'next' });
    if (s && choice) s.today = [{ icon: '🤖', text: '자동 선택' }, ...s.today];
    return s;
  }
  const s: JourneyState = structuredClone(old);
  const keep = (lines: Line[]) => {
    s.journal = [...old.today, ...s.journal].slice(0, 60);
    s.today = lines;
  };
  if (act.a === 'next' || act.a === 'auto') {
    if (s.pending) return null;
    const lines: Line[] = [];
    // 자동: 고를 일이 생기거나 원정이 끝날 때까지(최대 하루치씩 모아서)
    do {
      if (lines.length) lines.push({ icon: '·', text: '' });
      lines.push({ icon: '📅', text: `${s.day + 1}일째` }, ...nextDay(s));
      settle(s);
    } while (act.a === 'auto' && !s.pending && !s.done && s.day < DAYS);
    keep(lines.filter((l) => l.text));
    return s;
  }
  const p = s.pending;
  if (!p) return null;
  const lines: Line[] = [];
  if (act.a === 'pick') {
    if (p.kind === 'skill') {
      const id = p.options[act.n];
      if (!id) return null;
      s.skills[id] = sk(s, id) + 1;
      if (id === 'vital') s.hp += 25;
      lines.push({ icon: SKILLS[id].icon, text: `${SKILLS[id].name} Lv.${s.skills[id]} — ${SKILLS[id].text(s.skills[id]!)}`, tone: 'good' });
    } else if (p.kind === 'event') {
      if (act.n !== 0 && act.n !== 1) return null;
      resolveEvent(s, p.id, act.n, lines);
    } else return null;
  } else if (act.a === 'buy') {
    if (p.kind !== 'shop') return null;
    const o = p.offers[act.n];
    if (!o || s.coins < o.price) return null;
    s.coins -= o.price;
    const info = OFFERS[o.id];
    if (o.id === 'potion') s.hp = Math.min(stat(s).maxHp, s.hp + 50);
    else if (o.id === 'sword') s.atk += 5;
    else if (o.id === 'armor') s.def += 3;
    else if (o.id === 'heart') {
      s.maxHp += 30;
      s.hp += 30;
    } else s.queuedLevels += 1;
    lines.push({ icon: info.icon, text: `${info.name} 샀어요. ${info.text}`, tone: 'good' });
    // 상인 곁에 남아 더 살 수 있어요(두루마리는 산 뒤 바로 스킬 고르기)
    const rest = p.offers.filter((_, i) => i !== act.n);
    if (o.id !== 'scroll' && rest.length) {
      s.pending = { kind: 'shop', offers: rest };
      keep(lines);
      return s;
    }
  } else if (act.a === 'leave') {
    if (p.kind === 'skill') return null;
    if (p.kind === 'event') return actJourney(old, { a: 'pick', n: 1 });
    lines.push({ icon: '👋', text: '상인에게 인사하고 지나갔어요.' });
  } else return null;
  s.pending = null;
  settle(s);
  keep(lines);
  return s;
}

export function decodeJourney(json: string): JourneyState | null {
  try {
    const s = JSON.parse(json) as JourneyState;
    const n = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
    if (s.v !== 1 || typeof s.seed !== 'string' || ![s.day, s.hp, s.maxHp, s.atk, s.def, s.lv, s.xp, s.coins, s.queuedLevels, s.kills].every(n)) return null;
    if (!Array.isArray(s.today) || !Array.isArray(s.journal) || typeof s.done !== 'boolean' || !s.skills || typeof s.skills !== 'object') return null;
    return s;
  } catch {
    return null;
  }
}
