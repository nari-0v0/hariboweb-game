// 끝없는 탑(나리 2026-11-19): 원정대 3장을 깨면 열려요.
// - 한 층 = 한 판 싸움. 자동 사냥은 없고, 층마다 '도전'을 직접 눌러요.
// - 깬 층은 저장돼요. 지면 같은 층부터 다시 하고, 층마다 보상은 처음 깰 때 한 번만 받아요.
// - 보상은 작게: 젤코인은 10층마다 1개부터 다시 세요(1·11·21층 1개, 10·20층 10개. 나리 2026-11-19). 10층마다 강화 재료 2개.
//   재료 장은 20층마다 하나씩 올라가요(10·20층 = 1장, 30·40층 = 2장 …). 단, 내가 깬 장까지만 나와요.
// - 젤코인으로 잠깐 강해지기: 도전 한 번에만 들어요. 값은 그 층 보상보다 늘 비싸서 탑으로 젤코인을 불리는 일은 없어요.
// - 싸움에는 원정 준비소의 훈련·장비와 데려간 펫이 들어가요(판 안에서 배우는 스킬은 없어요).
// - 같은 층·같은 능력이면 결과도 늘 같아요(씨앗 = 사람 + 층). 그냥 다시 누르기만 해서는 못 넘어요.
import { rng } from './rng';
import { CHAPTERS, MAX_CHAPTER, type Monster } from './journey-chapters';
import { GEAR_MAX, PERKS, battle, gearBonus, startJourney, stat, type BattleFx, type Boost, type Gear, type Line, type Perks } from './journey';
import type { PetId } from './pets';

export const TOWER_OPEN = 3; // 이 장을 깨면 열려요
export const FLOORS_PER_CH = 20; // 탑 20층 = 원정대 한 장만큼
export const MAT_EVERY = 10;
export const MAT_COUNT = 2;
export const TOWER_GAP_MS = 1500; // 도전 사이 최소 간격(버튼 연타·자동 누르기 막기)

export const towerCoins = (floor: number) => (floor >= 1 ? ((Math.floor(floor) - 1) % 10) + 1 : 0);
// 10층마다 재료: 그 층이 맞는 장(20층마다 하나씩)과 내가 깬 장 중 낮은 쪽
export function towerMat(floor: number, top: number): { ch: number; n: number } | null {
  if (floor <= 0 || floor % MAT_EVERY !== 0 || top <= 0) return null;
  return { ch: Math.max(1, Math.min(Math.ceil(floor / FLOORS_PER_CH), top, MAX_CHAPTER)), n: MAT_COUNT };
}

// 잠깐 강해지기(그 층 도전 한 번)
export type BoostId = 'atk' | 'hp';
export const BOOSTS: Record<BoostId, { name: string; icon: string; text: string; pct: number; base: number; per: number }> = {
  atk: { name: '힘 물약', icon: '🔥', text: '공격력 +30%', pct: 0.3, base: 20, per: 2 },
  hp: { name: '튼튼 물약', icon: '💖', text: '최대 체력 +30%', pct: 0.3, base: 20, per: 2 },
};
export const BOOST_IDS = Object.keys(BOOSTS) as BoostId[];
export const boostPrice = (id: BoostId, floor: number) => BOOSTS[id].base + BOOSTS[id].per * Math.max(1, floor);
export const boostCost = (ids: BoostId[], floor: number) => ids.reduce((n, id) => n + boostPrice(id, floor), 0);
export const cleanBoosts = (v: unknown): BoostId[] => {
  const list = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return BOOST_IDS.filter((id) => list.includes(id));
};

// 몬스터 세기: '그 층에 맞는 장(층 ÷ 20)을 막 깬 사람'(훈련 끝까지 + 장비 +장 번호, 펫·강화 없음)이 겨우 이기게 맞춰요.
// 그보다 약하면 강화나 펫, 장비로 넘어야 해요. 마지막 장 높이(180층)를 넘으면 층마다 1.5%씩 더 세져요.
export const HITS = 6; // 기준인 사람이 몇 번 때려야 쓰러지나
export const BOSS_HITS = 8;
export const PAST_TOP = 1.015;
export function refStats(c: number) {
  const k = Math.max(0, Math.min(MAX_CHAPTER, c));
  const perk = (id: keyof Perks) => {
    const max0 = PERKS[id].max;
    return PERKS[id].per * (max0 + Math.floor(max0 * 0.3) * (Math.max(1, k) - 1));
  };
  const gear = (id: keyof Gear) => {
    // 장 번호만큼 강화(소수점 층은 앞뒤 사이 값)
    const lo = Math.floor(Math.min(GEAR_MAX, k));
    const hi = Math.min(GEAR_MAX, lo + 1);
    const t = Math.min(GEAR_MAX, k) - lo;
    return gearBonus(id, lo) * (1 - t) + gearBonus(id, hi) * t;
  };
  return { atk: 12 + perk('atk') + gear('weapon'), def: 2 + perk('def') + gear('armor'), hp: 100 + perk('hp') + gear('charm') };
}
export const isBossFloor = (floor: number) => floor % MAT_EVERY === 0;
export function towerFoe(floor: number): { hp: number; atk: number; boss: boolean } {
  const f = Math.max(1, Math.floor(floor));
  const c = f / FLOORS_PER_CH;
  const r = refStats(c);
  const past = f > MAX_CHAPTER * FLOORS_PER_CH ? PAST_TOP ** (f - MAX_CHAPTER * FLOORS_PER_CH) : 1;
  const boss = isBossFloor(f);
  const hits = boss ? BOSS_HITS : HITS;
  const hp = Math.round(r.atk * hits * past);
  // 기준인 사람은 (hits - 1)번 맞고도 체력이 조금 남아요(체력의 95%만 깎이게)
  const atk = Math.round((r.def + (r.hp * 0.95) / (hits - 1)) * past);
  return { hp, atk, boss };
}
// 층 몬스터 그림: 그 층에 맞는 장의 몬스터. 10층마다 강한 적, 20층마다 대장. 180층 뒤로는 1장부터 다시 돌아요.
export function towerMonster(floor: number): Monster {
  const f = Math.max(1, Math.floor(floor));
  const ch = CHAPTERS[(Math.ceil(f / FLOORS_PER_CH) - 1) % CHAPTERS.length]!;
  if (f % FLOORS_PER_CH === 0) return ch.boss;
  if (f % MAT_EVERY === 0) return ch.elite;
  return ch.foes[(f - 1) % ch.foes.length]!;
}

export type TowerFight = { floor: number; won: boolean; fx: BattleFx; maxHp: number; atk: number; def: number; foe: Monster; lines: Line[] };
export function towerFight(user: string, floor: number, perks: Perks, gear: Gear, pet: { id: PetId; lv: number } | null, boosts: BoostId[]): TowerFight {
  const seed = `tower:${user}:${floor}`;
  const s = startJourney(seed, perks, 1, gear, [], pet);
  const boost: Boost = {};
  for (const id of boosts) boost[id] = (boost[id] ?? 0) + BOOSTS[id].pct;
  if (boosts.length) s.boost = boost;
  s.hp = stat(s).maxHp;
  const foe = towerMonster(floor);
  const m = towerFoe(floor);
  const lines: Line[] = [];
  const won = battle(s, foe, 1, rng(seed), lines, 0, m);
  const st = stat(s);
  return { floor, won, fx: s.fx!, maxHp: st.maxHp, atk: st.atk, def: st.def, foe, lines };
}
