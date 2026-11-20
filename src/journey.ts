// 하리보 원정대 (하루 모험판): "다음 날"을 누르면 내 캐릭터가 하루씩 길을 나아가요.
// 날마다 전투·상자·샘·상인·휴식 같은 일이 무작위로 생기고, 전투는 자동으로 치러요.
// 레벨이 오르면 스킬 3개 중 하나를 고르고, 10일째 강한 적, 20일째 보스를 이기면 원정 성공이에요.
// 모든 무작위는 판 씨앗(seed)과 날짜로 정해져서, 서버가 같은 입력에 늘 같은 결과를 내요.
import { rng } from './rng';
import { MAX_CHAPTER, chapterAtk, chapterOf, chapterPower, type Monster } from './journey-chapters';
import { isPetId, petFx, type PetId } from './pets';

export const DAYS = 20;
export const ELITE_DAY = 10;
export const DAILY_REWARD_JOURNEYS = 2; // 하루 첫 2판만 보상
export const journeyXp = (day: number, cleared: boolean, ch = 1) => (cleared ? 12 + 3 * (ch - 1) : Math.min(10, 2 + Math.floor(day / 2)) + (ch - 1));
// 도감 젤리는 9장 대장을 처음 깼을 때 10개(나리 2026-11-13), 15장(마지막 장) 대장을 처음 깼을 때 10개 더 줘요. 다른 장은 없어요.
export const JOURNEY_FINISH_JELLY = 10;
export const JELLY_CHAPTERS = [9, MAX_CHAPTER];
export const journeyJelly = (cleared: boolean, ch = 1, top = 0) =>
  cleared ? JELLY_CHAPTERS.filter((n) => ch >= n && top < n).length * JOURNEY_FINISH_JELLY : 0;

export type SkillId = 'power' | 'vital' | 'guard' | 'leech' | 'crit' | 'spark' | 'shield' | 'mend' | 'thorn' | 'lucky';
export const SKILLS: Record<SkillId, { name: string; icon: string; text: (lv: number) => string; max: number }> = {
  power: { name: '힘 구미', icon: '💪', text: (l) => `공격력 +${4 * l}`, max: 5 },
  vital: { name: '말랑 체력', icon: '❤️', text: (l) => `최대 체력 +${25 * l}`, max: 5 },
  guard: { name: '단단 껍질', icon: '🛡️', text: (l) => `방어력 +${2 * l}`, max: 5 },
  leech: { name: '쪽쪽 흡수', icon: '🩸', text: (l) => `준 피해의 ${10 * l}%만큼 회복`, max: 3 },
  crit: { name: '반짝 치명타', icon: '✨', text: (l) => `${12 * l}% 확률로 2배 피해`, max: 3 },
  spark: { name: '번개 선제', icon: '⚡', text: (l) => `전투 시작에 번개 ${10 * l} 피해`, max: 3 },
  shield: { name: '첫 방패', icon: '🔰', text: (l) => `전투마다 첫 ${l}번 받는 피해 절반`, max: 3 },
  mend: { name: '전투 후 간식', icon: '🍪', text: (l) => `전투가 끝나면 체력 ${6 * l} 회복`, max: 3 },
  thorn: { name: '가시 갑옷', icon: '🌵', text: (l) => `맞을 때 ${3 * l} 되돌려 주기`, max: 3 },
  lucky: { name: '행운 주머니', icon: '🍀', text: (l) => `얻는 젤코인 +${30 * l}%`, max: 3 },
};
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];


export type Line = { icon: string; text: string; tone?: 'good' | 'bad' };
// 화면 전투 모션용 기록: 누가(0 = 나, 1 = 적) 얼마나 때렸는지. 주고받은 공격을 빠짐없이 남겨요.
export type Hit = [who: 0 | 1, dmg: number, crit?: 1];
// hp0: 싸우기 전 체력(결과는 모션이 끝난 뒤 보여요). mhp: 몬스터 처음 체력, left: hits 칸마다 그 뒤 남은 몬스터 체력(몬스터 체력 막대용)
// php: hits 칸마다 그 뒤 남은 내 체력(맞을 때마다 내 체력 막대도 줄어들게, 슬금님 제보 2026-11-18)
// c0: 싸우기 전 젤코인(모션이 끝나기 전엔 이 값을 보여요, 슬금님 제보 2026-11-20)
export type BattleFx = { foe: string; won: boolean; spark?: number; hits: Hit[]; hp0?: number; mhp?: number; left?: number[]; php?: number[]; c0?: number };
// 예전엔 처음 6번만 남기고 마지막 칸에 끝난 순간을 덮어써서, 긴 싸움에선 중간 공격이 빠졌어요.
// 그래서 체력이 '두 대 버틸 만큼' 남아 보이다가 한 대에 0이 되는 것처럼 보였어요(슬금님 제보 2026-11-18).
// 싸움은 40턴(80번)을 넘지 않으니 이 한도는 안전장치일 뿐이에요.
export const FX_HITS = 80;
export type Offer = { id: 'potion' | 'sword' | 'armor' | 'heart' | 'scroll'; price: number };
export const OFFERS: Record<Offer['id'], { name: string; icon: string; text: string; price: number }> = {
  potion: { name: '회복 물약', icon: '🧪', text: '체력 50 회복', price: 12 },
  sword: { name: '숫돌', icon: '🗡️', text: '공격력 +5', price: 20 },
  armor: { name: '헝겊 갑옷', icon: '🧥', text: '방어력 +3', price: 20 },
  heart: { name: '하트 구미', icon: '💗', text: '최대 체력 +30', price: 22 },
  scroll: { name: '스킬 두루마리', icon: '📜', text: '다음 날 스킬 하나 고르기', price: 30 },
};
export type Pending =
  | { kind: 'skill'; options: SkillId[] }
  | { kind: 'shop'; offers: Offer[] }
  | { kind: 'event'; id: EventId };
export type EventId = 'spring' | 'coin' | 'bear' | 'fork';
export const EVENTS: Record<EventId, { icon: string; title: string; text: string; options: string[] }> = {
  spring: { icon: '⛲', title: '수상한 샘', text: '반짝이는 샘물이 보글보글 끓고 있어요.', options: ['한 모금 마신다', '그냥 지나간다'] },
  coin: { icon: '🪙', title: '행운의 동전 던지기', text: '길가 요정이 동전 던지기를 하재요. 이기면 두 배, 지면 절반을 가져가요.', options: ['던진다!', '사양할게요'] },
  bear: { icon: '🧸', title: '길 잃은 젤리곰', text: '젤리곰이 배가 고파 울고 있어요. 젤코인 10개면 간식을 사 줄 수 있어요.', options: ['간식을 사 준다 (젤코인 10)', '미안, 갈 길이 바빠'] },
  fork: { icon: '🪧', title: '갈림길', text: '왼쪽 길에선 으르렁 소리가, 오른쪽 길에선 모닥불 냄새가 나요.', options: ['왼쪽: 싸우고 경험치 많이', '오른쪽: 쉬면서 회복'] },
};

export type JourneyState = {
  v: 1;
  seed: string;
  ch?: number; // 장(챕터). 없으면 1장
  day: number; // 지난 날 수
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  lv: number;
  xp: number;
  coins: number;
  banked?: number; // 끝날 때 훈련소에 모인 젤코인(오늘 많이 할수록 줄어요)
  bankPct?: number;
  farm?: boolean; // 이미 대장을 깬 장을 다시 돈 판
  mats?: number; // 이번 판에 주운 그 장의 강화 재료
  matsBanked?: number; // 끝날 때 가방에 넣은 재료(첫 대장 보너스 포함)
  skills: Partial<Record<SkillId, number>>;
  pending: Pending | null;
  queuedLevels: number; // 아직 고르지 않은 레벨업
  today: Line[]; // 마지막으로 일어난 일
  journal: Line[]; // 지난 일(최근 것만)
  kills: number;
  done: boolean;
  cleared: boolean;
  fx?: BattleFx; // 마지막 행동에서 싸웠으면 그 싸움
  kit?: KitId[]; // 출발 준비물(이번 판에만)
  kitShield?: number; // 튼튼 방패로 절반만 맞을 남은 횟수
  potion?: number; // 남은 회복 물약
  last?: string; // 어제 생긴 일(foe·chest·shop·camp·event:id·skill). 같은 일이 연달아 나오지 않게
  evs?: EventId[]; // 이번 판에 나온 이벤트
  pet?: { id: PetId; lv: number }; // 데려간 펫(떠날 때 레벨)
  boost?: Boost; // 끝없는 탑에서 젤코인으로 산 잠깐 강해지기(그 층 싸움에만)
  bst?: boolean; // 서버 부스터로 떠난 판: 강화 재료 나올 확률 BOOSTER_DROP배
};
// 잠깐 강해지기: 공격력·최대 체력에 곱하는 몫(0.3 = +30%)
export type Boost = { atk?: number; hp?: number };
// next = 하루, auto = 고를 일이 생길 때까지, idle = 자동 선택(고를 일이 있으면 알아서 고르고, 없으면 하루 나아가요)
export type JourneyAction = { a: 'next' } | { a: 'auto' } | { a: 'idle' } | { a: 'pick'; n: number } | { a: 'buy'; n: number } | { a: 'leave' };

export const xpNeed = (lv: number) => 10 + lv * 10;

// 영구 강화: 원정이 끝나면 남은 동전이 강화 주머니에 모이고, 그걸로 다음 원정의 시작 능력치를 올려요.
export type PerkId = 'atk' | 'hp' | 'def';
export type Perks = Record<PerkId, number>;
export const NO_PERKS: Perks = { atk: 0, hp: 0, def: 0 };
export const PERKS: Record<PerkId, { name: string; icon: string; per: number; max: number; text: (l: number) => string }> = {
  atk: { name: '힘 훈련', icon: '🏋️', per: 1, max: 10, text: (l) => `시작 공격력 +${l}` },
  hp: { name: '체력 훈련', icon: '🏃', per: 10, max: 10, text: (l) => `시작 체력 +${l * 10}` },
  // 맷집도 힘·체력과 칸 수를 맞췄어요(나리 2026-11-21). 세기는 그대로라 2~3칸마다 방어력 +1(perkValue).
  def: { name: '맷집 훈련', icon: '🧱', per: 0.4, max: 10, text: (l) => `시작 방어력 +${Math.max(0, Math.ceil(l * 0.4 - 1e-9))}` },
};
// 훈련 단계 → 실제로 오르는 능력치(맷집은 0.4씩 올림이라 2~3칸마다 +1)
export const perkValue = (id: PerkId, lv: number) => (id === 'def' ? Math.max(0, Math.ceil(lv * PERKS.def.per - 1e-9)) : PERKS[id].per * lv);
export const PERK_IDS = Object.keys(PERKS) as PerkId[];
// 젤코인 파밍 막기(나리 2026-11-13): 아직 못 깬 장은 언제나 100%.
// 이미 깬 장을 다시 돌면 그 장을 다시 돈 횟수에 따라 100% → 75% → 50% → 25% → 10% → 5% → 1%. 날이 바뀌어도 다시 오르지 않아요.
// 나리 2026-11-21: 10%에서 멈추면 판을 많이 돌릴수록 결국 쌓여서 1%까지 내려요. 0%는 아니라 조금은 남아요.
// (아직 못 깬 장은 져도 100%라, 강화 젤코인은 다음 장에 도전하면서 모을 수 있어요)
export const BANK_RATES = [100, 75, 50, 25, 10, 5, 1];
export const bankRate = (farmed: number) => BANK_RATES[Math.min(Math.max(0, farmed), BANK_RATES.length - 1)]!;
export const perkCost = (lv: number) => 20 + lv * 15; // 지금 단계에서 다음 단계로 가는 값

// 장비 강화(나리 2026-11-13): 훈련은 젤코인으로 조금씩, 장비는 장마다 나오는 재료로 한 단계씩 크게.
// +N 강화에는 N장 재료(그리고 바로 앞 장 재료)가 필요해서, 장을 깰수록 차례로 강해져요.
export type GearId = 'weapon' | 'armor' | 'charm';
export type Gear = Record<GearId, number>;
export const NO_GEAR: Gear = { weapon: 0, armor: 0, charm: 0 };
export const GEAR: Record<GearId, { name: string; icon: string; stat: string; per: number }> = {
  weapon: { name: '무기', icon: '🗡️', stat: '공격력', per: 3 },
  armor: { name: '갑옷', icon: '🛡️', stat: '방어력', per: 3 },
  charm: { name: '장신구', icon: '💍', stat: '체력', per: 30 },
};
export const GEAR_IDS = Object.keys(GEAR) as GearId[];
export const GEAR_MAX = 15; // +N에는 N장 재료가 들어요(장 수와 같아요)
// 장마다 나오는 재료
export const MATERIALS = [
  { icon: '🍃', name: '말랑 잎' },
  { icon: '🌱', name: '새싹 씨앗' },
  { icon: '🪵', name: '뿌리 조각' },
  { icon: '🌵', name: '가시 조각' },
  { icon: '💧', name: '안개 방울' },
  { icon: '💎', name: '메아리 수정' },
  { icon: '❄️', name: '서리 결정' },
  { icon: '🔶', name: '호박 조각' },
  { icon: '🔥', name: '화산석' },
  { icon: '🕯️', name: '유령 촛농' },
  { icon: '🐚', name: '심해 진주' },
  { icon: '☁️', name: '구름 솜' },
  { icon: '🍬', name: '굳은 사탕' },
  { icon: '🌑', name: '그림자 조각' },
  { icon: '⏳', name: '시간 모래' },
];
export const material = (ch: number) => MATERIALS[Math.min(MATERIALS.length, Math.max(1, ch)) - 1]!;
// 앞 장 재료도 같이 써요(멍쑤님 제안, 나리 2026-11-17). 나리 2026-11-19: 1장 재료가 끝까지 계속 들어가는 건 너무 빡세서,
// +N에는 N장 재료에 더해 바로 앞 장(N-1장) 재료만 LOWER_MATS개 더 내요.
export const LOWER_MATS = 2;
export type MatCost = { ch: number; n: number };
// +next로 가는 값. mats = 그 장 재료 수, cost = 바로 앞 장 재료까지 넣은 전체(뒤 장부터).
// 젤코인은 뒤 장일수록 몬스터가 주는 만큼 비싸져요(+1 30 … +9 약 1240).
export const gearNeed = (next: number) => {
  const ch = Math.min(MATERIALS.length, Math.max(1, Math.floor(next)));
  const mats = 2 + Math.floor((ch - 1) / 3);
  const cost: MatCost[] = [{ ch, n: mats }];
  if (ch > 1) cost.push({ ch: ch - 1, n: LOWER_MATS });
  return { ch, mats, cost, coins: Math.round(30 * ch * (1 + 0.45 * (ch - 1))) };
};
// 남는 재료 팔기(나리 2026-11-19): N장 재료는 +N·+(N+1) 장비 강화에만 쓰여요. 장비 셋이 모두 그 위로 올라가면 팔 수 있어요.
// 값은 1장 5젤코인 기준(장마다 2.5씩 더, 반올림). 펫 키우기에도 쓰이는 재료라 화면에서 한 번 더 물어봐요.
export const matSellPrice = (ch: number) => Math.round(5 + 2.5 * (Math.max(1, Math.floor(ch)) - 1));
export const matSellLevel = (ch: number) => Math.min(Math.max(1, Math.floor(ch)) + 1, GEAR_MAX); // 장비 셋 다 이 단계 이상이면 팔 수 있어요
export const canSellMat = (gear: Gear, ch: number) => ch >= 1 && ch <= MATERIALS.length && Math.min(gear.weapon, gear.armor, gear.charm) >= matSellLevel(ch);
export const hasMats = (have: Record<number, number>, cost: MatCost[]) => cost.every((c) => (have[c.ch] ?? 0) >= c.n);
// 뒤 장 재료로 올린 단계일수록 더 많이 올라요(장마다 몬스터가 세지는 만큼).
export const GEAR_GROW = 0.18;
export function gearBonus(id: GearId, lv: number): number {
  const L = Math.min(GEAR_MAX, Math.max(0, Math.floor(lv)));
  return Math.round(GEAR[id].per * (L + (GEAR_GROW * L * (L - 1)) / 2));
}
export const gearText = (id: GearId, lv: number) => `${GEAR[id].stat} +${gearBonus(id, lv)}`;
// 재료가 나올 확률(나리 2026-11-19): 보통 몬스터 5%, 이벤트 싸움 5%, 강한 적 20%, 대장은 꼭 1개(처음 깨면 끝날 때 2개 더).
// 깬 장을 다시 돌면 보통·이벤트·강한 적은 FARM_DROP만큼(3%·3%·12%), 대장은 FARM_BOSS(50%).
export const DROP = { foe: 0.05, event: 0.05, elite: 0.2 };
export const FIRST_CLEAR_BONUS = 2;
// 이미 깬 장을 다시 돌면 재료는 하루 제한 없이 모이지만, 나올 확률은 이만큼으로 줄어요(나리 2026-11-13).
export const FARM_DROP = 0.6; // 2026-11-18 나리: 0.4 → 0.6. 2026-11-19 나리: 0.45로 내렸다가 다시 0.6
export const FARM_BOSS = 0.5; // 다시 돌 때 대장이 재료를 줄 확률(나리 2026-11-19)
// 디스코드 서버 부스터는 재료 나올 확률이 조금 높아요(나리 2026-11-21 "소폭"): 5% → 6%, 다시 돌 때 대장 50% → 60%
export const BOOSTER_DROP = 1.2;
// 열린 장이 늘수록 훈련 한도가 늘어요(열린 장 하나마다 처음 한도의 절반씩). 열린 장 = 앞 장을 깼고 도감 조건도 채운 장.
export const perkMax = (id: PerkId, unlocked: number) => PERKS[id].max + Math.floor(PERKS[id].max * 0.3) * (Math.max(1, unlocked) - 1);

// 출발 준비물(나리 2026-11-13): 떠나기 전에 젤코인으로 사서 그 판에만 써요. 훈련·장비를 다 채운 뒤에도 젤코인을 쓸 곳.
// 값은 지금 갈 수 있는 가장 높은 장만큼 비싸져요(몬스터가 주는 젤코인이 늘어나는 만큼).
export type KitId = 'potion' | 'shield' | 'clover';
export const KIT: Record<KitId, { name: string; icon: string; text: string; base: number }> = {
  potion: { name: '회복 물약', icon: '🧪', text: '체력이 30% 아래로 떨어지면 한 번, 최대 체력의 40%를 채워요.', base: 60 },
  shield: { name: '튼튼 방패', icon: '🛡️', text: '처음 맞는 공격 4번은 피해가 절반이에요.', base: 40 },
  clover: { name: '행운 부적', icon: '🍀', text: '이번 판에 강화 재료가 1.5배 잘 나와요.', base: 50 },
};
export const KIT_IDS = Object.keys(KIT) as KitId[];
export const KIT_SHIELD_HITS = 4;
export const kitPrice = (id: KitId, level: number) => Math.round(KIT[id].base * chapterPower(level));
export const kitCost = (kit: KitId[], level: number) => kit.reduce((n, id) => n + kitPrice(id, level), 0);
export const cleanKit = (v: unknown): KitId[] => {
  const list = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return KIT_IDS.filter((id) => list.includes(id));
};

export function startJourney(seed: string, perks: Perks = NO_PERKS, ch = 1, gear: Partial<Gear> = NO_GEAR, kit: KitId[] = [], pet?: { id: PetId; lv: number } | null): JourneyState {
  const g = (id: GearId) => gearBonus(id, gear[id] ?? 0);
  const maxHp = 100 + perkValue('hp', perks.hp) + g('charm');
  const packed = kit.length ? [{ icon: '🎒', text: `준비물: ${kit.map((id) => `${KIT[id].icon} ${KIT[id].name}`).join(', ')}` }] : [];
  const s: JourneyState = {
    ...(kit.length ? { kit, kitShield: kit.includes('shield') ? KIT_SHIELD_HITS : 0, potion: kit.includes('potion') ? 1 : 0 } : {}),
    v: 1, seed, ch, day: 0, hp: maxHp, maxHp, atk: 12 + perkValue('atk', perks.atk) + g('weapon'), def: 2 + perkValue('def', perks.def) + g('armor'), lv: 1, xp: 0, coins: 10, skills: {}, pending: null, queuedLevels: 0,
    today: [{ icon: '🎒', text: `${ch}장 ${chapterOf(ch).name}! 가방을 메고 출발해요. "다음 날"을 눌러 나아가요.` }, ...packed], journal: [], kills: 0, done: false, cleared: false,
  };
  if (pet && isPetId(pet.id) && pet.lv > 0) {
    s.pet = { id: pet.id, lv: pet.lv };
    s.hp = stat(s).maxHp; // 솜사탕 양처럼 최대 체력을 올리는 펫이면 가득 채우고 떠나요
  }
  return s;
}

// 받침 따라 을/를
const obj = (w: string) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 > 0 ? '을' : '를');
const sk = (s: JourneyState, id: SkillId) => s.skills[id] ?? 0;
// 펫·탑 강화는 % 로 곱해요(펫이 없고 강화도 없으면 예전과 똑같아요).
export const stat = (s: JourneyState) => {
  const p = petFx(s.pet);
  const atk = s.atk + 4 * sk(s, 'power');
  const def = s.def + 2 * sk(s, 'guard');
  const maxHp = s.maxHp + 25 * sk(s, 'vital');
  return {
    atk: Math.round(atk * (1 + p.atk + (s.boost?.atk ?? 0))),
    def: Math.round(def * (1 + p.def)),
    maxHp: Math.round(maxHp * (1 + p.hp + (s.boost?.hp ?? 0))),
  };
};

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
    lines.push({ icon: '⭐', text: `레벨 업! Lv.${s.lv} (다음 날 스킬을 골라요)`, tone: 'good' });
  }
}
function gainCoins(s: JourneyState, n: number) {
  const got = Math.round(n * (1 + 0.3 * sk(s, 'lucky')));
  s.coins += got;
  return got;
}

// 자동 전투. 결과 요약만 적어요.
// fixed: 끝없는 탑처럼 몬스터 체력·공격력을 따로 정한 싸움
export function battle(s: JourneyState, m: Monster, power: number, r: () => number, lines: Line[], drop = 0, fixed?: { hp: number; atk: number }) {
  const st = stat(s);
  const cp = chapterPower(s.ch);
  const pf = petFx(s.pet);
  let mhp = fixed ? fixed.hp : Math.round((20 + s.day * 5) * power * cp);
  const matk = fixed ? fixed.atk : Math.round((4 + s.day * 0.9) * (power > 1 ? 1 + (power - 1) * 0.3 : 1) * chapterAtk(s.ch));
  const mhp0 = mhp;
  const poison = pf.poison > 0 ? Math.max(1, Math.round(mhp0 * pf.poison)) : 0;
  const start = s.hp;
  let shields = sk(s, 'shield');
  let turns = 0;
  const hits: Hit[] = [];
  const left: number[] = [];
  const php: number[] = [];
  const note = (h: Hit) => {
    const i = hits.length < FX_HITS ? hits.length : FX_HITS - 1; // 마지막 칸은 늘 끝난 순간
    hits[i] = h;
    left[i] = Math.max(0, mhp);
    php[i] = Math.max(0, s.hp);
  };
  const fx: BattleFx = { foe: m.key, won: false, hits, hp0: start, mhp, left, php, c0: s.coins };
  // 번개 선제(스킬)와 별무늬 고양이 별똥별(펫)은 싸움 시작에 한 번에 보여요
  const opener = 10 * sk(s, 'spark') + (pf.star > 0 ? Math.max(1, Math.round(mhp0 * pf.star)) : 0);
  if (opener > 0) {
    mhp -= opener;
    fx.spark = opener;
  }
  s.fx = fx;
  while (mhp > 0 && s.hp > 0 && turns < 40) {
    turns++;
    const crit = r() < 0.12 * sk(s, 'crit') + pf.crit;
    const dmg = Math.max(1, st.atk * (crit ? 2 : 1)) + poison; // 버섯 친구 독은 내 공격에 얹어요
    mhp -= dmg;
    note(crit ? [0, dmg, 1] : [0, dmg]);
    if (sk(s, 'leech')) {
      s.hp = Math.min(st.maxHp, s.hp + Math.floor((dmg * sk(s, 'leech')) / 10));
      php[php.length - 1] = s.hp; // 흡혈 회복은 그 공격 칸 체력에 바로 넣어요
    }
    if (mhp <= 0) break;
    let hit = Math.max(1, matk - st.def);
    if (pf.dodge > 0 && r() < pf.dodge) hit = 0; // 아기 펭귄: 피했어요
    // 피한 공격에는 방패를 쓰지 않아요(방패 횟수는 실제로 맞은 공격만 세요)
    if (hit > 0 && shields > 0) {
      hit = Math.ceil(hit / 2);
      shields--;
    }
    if (hit > 0 && (s.kitShield ?? 0) > 0) {
      hit = Math.ceil(hit / 2);
      s.kitShield = (s.kitShield ?? 0) - 1;
    }
    s.hp -= hit;
    if (pf.regen > 0 && s.hp > 0) s.hp = Math.min(st.maxHp, s.hp + Math.max(1, Math.round(st.maxHp * pf.regen))); // 아기 슬라임 회복
    note([1, hit]);
    if ((s.potion ?? 0) > 0 && s.hp > 0 && s.hp <= st.maxHp * 0.3) {
      const heal = Math.min(st.maxHp - s.hp, Math.round(st.maxHp * 0.4));
      s.hp += heal;
      s.potion = 0;
      php[php.length - 1] = s.hp; // 물약 회복도 방금 맞은 칸 체력에 넣어요
      lines.push({ icon: KIT.potion.icon, text: `위험할 때 회복 물약을 마셨어요! 체력 +${heal}`, tone: 'good' });
    }
    if (sk(s, 'thorn')) {
      mhp -= 3 * sk(s, 'thorn');
      left[left.length - 1] = Math.max(0, mhp); // 가시 피해는 방금 맞은 칸 기록에 넣어요(막대가 반격 때 줄어요)
    }
  }
  if (s.hp <= 0 || mhp > 0) {
    s.hp = 0;
    lines.push({ icon: m.emoji, text: `${m.name}에게 지고 말았어요… (${turns}턴)`, tone: 'bad' });
    return false;
  }
  fx.won = true;
  if (sk(s, 'mend')) s.hp = Math.min(st.maxHp, s.hp + 6 * sk(s, 'mend'));
  s.kills += 1;
  const coins = gainCoins(s, Math.round((4 + s.day) * power * cp));
  lines.push({ icon: m.emoji, text: `${m.name}${obj(m.name)} ${turns}턴 만에 물리쳤어요! 체력 ${s.hp - start >= 0 ? '+' : ''}${s.hp - start}, 젤코인 +${coins}`, tone: 'good' });
  if (drop > 0 && rng(`${s.seed}:${s.day}:drop`)() < (s.farm ? (drop >= 1 ? FARM_BOSS : drop * FARM_DROP) : drop) * (s.kit?.includes('clover') ? 1.5 : 1) * (s.bst ? BOOSTER_DROP : 1)) {
    s.mats = (s.mats ?? 0) + 1;
    const mt = material(s.ch ?? 1);
    lines.push({ icon: mt.icon, text: `강화 재료 ${mt.name}${obj(mt.name)} 주웠어요!`, tone: 'good' });
  }
  gainXp(s, Math.round((12 + s.day * 2) * power), lines);
  return true;
}

function finish(s: JourneyState, lines: Line[]) {
  if (s.hp <= 0) {
    s.done = true;
    lines.push({ icon: '🏳️', text: `${s.day}일째에 원정이 끝났어요. 다음엔 더 멀리 가 봐요!`, tone: 'bad' });
  }
}

// 하루에 생길 일 고르기(멍쑤님 제보, 나리 2026-11-17): 뜻 없는 날이 이어지지 않게
// - 싸움이 아닌 일(모닥불·상자·이벤트·상인)은 어제와 같은 종류가 또 나오면 다시 뽑아요.
// - 모닥불은 체력이 15% 넘게 비었을 때만 나와요(꽉 찬 체력으로 쉬는 날 없애기).
// 세 번 뽑아도 안 되면 그날은 싸움이에요.
export type DayKind = 'foe' | 'chest' | 'event' | 'shop' | 'camp';
export const CAMP_MISSING = 0.15;
function pickDay(s: JourneyState, st: { maxHp: number }, r: () => number): DayKind {
  const prev = s.last?.startsWith('event:') ? 'event' : s.last === 'skill' ? 'camp' : s.last;
  for (let t = 0; t < 3; t++) {
    const roll = r();
    const k: DayKind = roll < 0.46 ? 'foe' : roll < 0.6 ? 'chest' : roll < 0.76 ? 'event' : roll < 0.87 && s.day >= 3 ? 'shop' : 'camp';
    if (k === 'foe') return k;
    if (k === prev) continue;
    if (k === 'camp' && st.maxHp - s.hp < st.maxHp * CAMP_MISSING) continue;
    return k;
  }
  return 'foe';
}
// 이번 판에 아직 안 나온 이벤트부터 골라요(다 나왔으면 아무거나, 어제 것만 빼고).
function pickEvent(s: JourneyState, r: () => number): EventId {
  const all = Object.keys(EVENTS) as EventId[];
  const fresh = all.filter((id) => !s.evs?.includes(id));
  const pool = fresh.length ? fresh : all.filter((id) => `event:${id}` !== s.last);
  return pool[Math.floor(r() * pool.length)]!;
}

// 하루 진행
function nextDay(s: JourneyState): Line[] {
  s.day += 1;
  delete s.fx;
  const r = rng(`${s.seed}:${s.day}`);
  const lines: Line[] = [];
  const st = stat(s);
  // 아침마다 조금 회복(걷기 간식)
  s.hp = Math.min(st.maxHp, s.hp + Math.round(st.maxHp * 0.08));
  // 레벨업이 밀려 있으면 그날은 싸우지 않고 스킬만 골라요(스킬 고르기가 하루 한 칸). 중간 보스·마지막 보스 날은 싸움이 먼저예요.
  if (s.queuedLevels > 0 && s.day !== DAYS && s.day !== ELITE_DAY) {
    const options = pickSkills(s, rng(`${s.seed}:${s.day}:skill`));
    if (options.length) {
      s.queuedLevels -= 1;
      s.pending = { kind: 'skill', options };
      s.last = 'skill'; // 쉬면서 회복한 날이라 다음 날 모닥불은 빼요
      const heal = Math.min(st.maxHp - s.hp, Math.round(st.maxHp * 0.3));
      s.hp += heal;
      lines.push({ icon: '⭐', text: `오늘은 쉬면서 새 스킬을 하나 골라요.${heal > 0 ? ` 체력 +${heal}` : ''}` });
      return lines;
    }
    s.queuedLevels = 0; // 더 배울 스킬이 없어요
  }
  if (s.day === DAYS) {
    s.last = 'foe';
    const boss = chapterOf(s.ch).boss;
    lines.push({ icon: '🌋', text: `마지막 날! ${boss.name}${(boss.name.charCodeAt(boss.name.length - 1) - 0xac00) % 28 > 0 ? '이' : '가'} 나타났어요!` });
    if (battle(s, boss, 1.65, r, lines, 1)) {
      s.done = true;
      s.cleared = true;
      lines.push({ icon: '🏆', text: `${boss.name}${obj(boss.name)} 물리쳤어요! 원정 성공!`, tone: 'good' });
    }
    finish(s, lines);
    return lines;
  }
  if (s.day === ELITE_DAY) {
    s.last = 'foe';
    lines.push({ icon: '⚠️', text: '숲 한가운데서 커다란 그림자가…' });
    battle(s, chapterOf(s.ch).elite, 1.6, r, lines, DROP.elite);
    finish(s, lines);
    return lines;
  }
  const kind = pickDay(s, st, r);
  s.last = kind === 'event' ? `event:${pickEvent(s, r)}` : kind;
  if (kind === 'foe') {
    const foes = chapterOf(s.ch).foes;
    battle(s, foes[Math.floor(r() * foes.length)]!, 1, r, lines, DROP.foe);
  } else if (kind === 'chest') {
    const c = r();
    if (c < 0.4) lines.push({ icon: '🎁', text: `보물 상자! 젤코인 +${gainCoins(s, 8 + s.day)}`, tone: 'good' });
    else if (c < 0.7) {
      s.atk += 2;
      lines.push({ icon: '🎁', text: '보물 상자에서 반짝 돌을 찾았어요. 공격력 +2', tone: 'good' });
    } else {
      s.maxHp += 10;
      s.hp += 10;
      lines.push({ icon: '🎁', text: '보물 상자에서 말랑 구미를! 최대 체력 +10', tone: 'good' });
    }
  } else if (kind === 'event') {
    const id = s.last.slice(6) as EventId;
    s.evs = [...(s.evs ?? []), id];
    s.pending = { kind: 'event', id };
    lines.push({ icon: EVENTS[id].icon, text: `${EVENTS[id].title}! 어떻게 할까요?` });
  } else if (kind === 'shop') {
    const ids = Object.keys(OFFERS) as Offer['id'][];
    const offers: Offer[] = [];
    while (offers.length < 3) {
      const id = ids.splice(Math.floor(r() * ids.length), 1)[0]!;
      offers.push({ id, price: OFFERS[id].price + Math.floor(s.day / 2) });
    }
    s.pending = { kind: 'shop', offers };
    lines.push({ icon: '🛒', text: '떠돌이 상인을 만났어요. 젤코인으로 물건을 살 수 있어요.' });
  } else {
    const heal = Math.min(st.maxHp - s.hp, Math.round(st.maxHp * 0.3));
    s.hp += heal;
    lines.push({ icon: '🏕️', text: `모닥불에서 푹 쉬었어요. 체력 +${heal}`, tone: 'good' });
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
      lines.push({ icon: '🪙', text: `이겼다! 젤코인 +${s.coins}`, tone: 'good' });
      s.coins *= 2;
    } else {
      const lost = Math.ceil(s.coins / 2);
      s.coins -= lost;
      lines.push({ icon: '🪙', text: `졌어요… 젤코인 -${lost}`, tone: 'bad' });
    }
  } else if (id === 'bear') {
    if (n === 1 || s.coins < 10) lines.push({ icon: '🧸', text: n === 0 ? '젤코인이 모자라 간식을 못 샀어요.' : '젤리곰에게 손을 흔들고 지나갔어요.' });
    else {
      s.coins -= 10;
      s.atk += 5;
      lines.push({ icon: '🧸', text: '젤리곰이 고맙다며 힘 구미를 줬어요. 공격력 +5', tone: 'good' });
    }
  } else if (id === 'fork') {
    if (n === 0) battle(s, chapterOf(s.ch).foes[Math.floor(r() * chapterOf(s.ch).foes.length)]!, 1.3, r, lines, DROP.event);
    else {
      const heal = Math.min(st.maxHp - s.hp, Math.round(st.maxHp * 0.45));
      s.hp += heal;
      lines.push({ icon: '🏕️', text: `오른쪽 길 모닥불에서 쉬었어요. 체력 +${heal}`, tone: 'good' });
    }
  }
  finish(s, lines);
}

// 자동 선택: 스킬은 무작위, 동전 던지기는 반반, 나머지는 무난하고 안전한 쪽을 골라요. 사람이 고르면 더 잘할 수 있어요.
export function autoChoice(s: JourneyState): JourneyAction | null {
  const p = s.pending;
  if (!p) return null;
  const low = s.hp < stat(s).maxHp * 0.5;
  // 스킬은 무작위로 골라요(나리 2026-11-21). 같은 판·같은 날이면 늘 같은 걸 골라요(다시 눌러도 바뀌지 않게).
  if (p.kind === 'skill') return { a: 'pick', n: Math.floor(rng(`${s.seed}:${s.day}:${s.journal.length}:autoskill`)() * p.options.length) };
  if (p.kind === 'event') {
    const hp = s.hp / stat(s).maxHp;
    // 동전 던지기는 반반 확률로 던지거나 사양해요(나리 2026-11-21, 예전에는 늘 사양)
    const coin = () => rng(`${s.seed}:${s.day}:${s.journal.length}:autocoin`)() < 0.5;
    const yes = p.id === 'spring' ? hp > 0.4 : p.id === 'coin' ? coin() : p.id === 'bear' ? s.coins >= 10 : hp > 0.6;
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
  delete s.fx; // 지난 싸움 모션은 한 번만 보여요
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
    // 상인 곁에 남아 더 살 수 있어요(두루마리 스킬은 다음 날 골라요)
    const rest = p.offers.filter((_, i) => i !== act.n);
    if (rest.length) {
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
  keep(lines);
  return s;
}

export function decodeJourney(json: string): JourneyState | null {
  try {
    const s = JSON.parse(json) as JourneyState;
    const n = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
    if (s.v !== 1 || typeof s.seed !== 'string' || ![s.day, s.hp, s.maxHp, s.atk, s.def, s.lv, s.xp, s.coins, s.queuedLevels, s.kills].every(n)) return null;
    if (s.ch !== undefined && !(Number.isSafeInteger(s.ch) && s.ch >= 1 && s.ch <= MAX_CHAPTER)) return null;
    if (s.pet !== undefined && !(s.pet && isPetId(s.pet.id) && Number.isSafeInteger(s.pet.lv) && s.pet.lv > 0)) return null;
    if (!Array.isArray(s.today) || !Array.isArray(s.journal) || typeof s.done !== 'boolean' || !s.skills || typeof s.skills !== 'object') return null;
    return s;
  } catch {
    return null;
  }
}
