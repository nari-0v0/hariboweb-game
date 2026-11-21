// 원정대 펫(나리 2026-11-19): 원정대 젤코인으로 펫 상점에서 사고, 젤코인과 재료로 키워요.
// - 원정·끝없는 탑에 한 마리만 데려가요. 펫마다 능력이 하나씩 달라요(좋아하는 재료는 없어요).
// - 장을 깨야 상점에 그 펫이 보이고, 늦게 나오는 펫일수록 비싸요.
// - 레벨 5칸마다 필요한 재료 장이 올라가요(Lv1~5 = 1장 재료 … Lv41~45 = 9장 재료). 그래서 펫 최고 레벨은 '깬 장 × 5'예요.
//   마지막 장까지 깨면 그 뒤로는 아무 재료나 넣어 끝없이 올릴 수 있지만, 능력은 아주 조금만 올라요.
// - 한 번 올릴 때 드는 젤코인과 재료는 레벨이 오를수록 계속 늘어요(나리: 둘 다 점점 많이).
import { MAX_CHAPTER } from './journey-chapters';
import type { MatCost } from './journey';

export type PetId = 'slime' | 'sheep' | 'mushroom' | 'golem' | 'firefly' | 'penguin' | 'starcat' | 'dragon';
export type Pet = { name: string; file: string; ch: number; price: number; text: (v: number) => string; unit: string };
export const PETS: Record<PetId, Pet> = {
  slime: { name: '아기 슬라임', file: 'pet-slime', ch: 1, price: 300, unit: '%', text: (v) => `싸우는 동안 턴마다 체력 ${v}% 회복` },
  sheep: { name: '솜사탕 양', file: 'pet-cotton-sheep', ch: 2, price: 600, unit: '%', text: (v) => `최대 체력 +${v}%` },
  mushroom: { name: '버섯 친구', file: 'pet-mushroom', ch: 3, price: 1000, unit: '%', text: (v) => `턴마다 적 최대 체력의 ${v}% 독 피해` },
  golem: { name: '꼬마 골렘', file: 'pet-golem', ch: 4, price: 1500, unit: '%', text: (v) => `방어력 +${v}%` },
  firefly: { name: '반딧불 요정', file: 'pet-firefly', ch: 5, price: 2200, unit: '%', text: (v) => `${v}% 확률로 2배 피해` },
  penguin: { name: '아기 펭귄', file: 'pet-penguin', ch: 6, price: 3000, unit: '%', text: (v) => `${v}% 확률로 적 공격 피하기` },
  starcat: { name: '별무늬 고양이', file: 'pet-star-cat', ch: 7, price: 4000, unit: '%', text: (v) => `싸움 시작에 별똥별: 적 최대 체력의 ${v}% 피해` },
  dragon: { name: '아기 용', file: 'pet-dragon', ch: 8, price: 5000, unit: '%', text: (v) => `공격력 +${v}%` },
};
export const PET_IDS = Object.keys(PETS) as PetId[];
export const isPetId = (v: unknown): v is PetId => typeof v === 'string' && Object.hasOwn(PETS, v);

// 능력 크기(%): 처음 값 + 레벨마다 더하는 값. 재료 칸(깬 장 × 5)을 넘은 레벨은 1/5만 쳐요.
const POWER: Record<PetId, [base: number, per: number]> = {
  slime: [1, 0.12],
  sheep: [5, 1.2],
  mushroom: [0.5, 0.1],
  golem: [5, 1.5],
  firefly: [6, 0.8],
  penguin: [4, 0.6],
  starcat: [3, 0.5],
  dragon: [4, 1],
};
export const BAND = 5; // 재료 장이 바뀌는 레벨 칸
// 펫은 9장까지의 재료로 올려요. 10~15장이 생겨도 그대로(이미 키운 펫이 바뀌지 않게, 2026-11-19). 10장 뒤 재료는 끝없는 레벨에 쓸 수 있어요.
export const PET_CHAPTERS = 9;
export const BAND_MAX = PET_CHAPTERS * BAND; // 장 재료로 올리는 마지막 레벨(45)
export const PET_EXTRA = 0.2; // 그 뒤 레벨 하나가 치는 몫
// 펫이 너무 세면 원정대 장이 쉬워져요(시뮬레이션: 0.35면 같은 장비에서 깨는 확률이 10~25%p쯤 올라요, 2026-11-19).
export const PET_SCALE = 0.35;
export function petPower(id: PetId, lv: number): number {
  const L = Math.max(0, Math.floor(lv));
  if (L <= 0) return 0;
  const e = Math.min(L, BAND_MAX) + PET_EXTRA * Math.max(0, L - BAND_MAX);
  const [b, p] = POWER[id];
  return Math.round((b + p * e) * PET_SCALE * 100) / 100; // 0.01% 단위(작은 능력도 레벨마다 바뀌는 게 보이게)
}
export const petText = (id: PetId, lv: number) => PETS[id].text(petPower(id, lv));

// 펫이 원정·탑 싸움에 주는 것(전투에서 씀)
export type PetFx = { atk: number; def: number; hp: number; regen: number; poison: number; crit: number; dodge: number; star: number };
export const NO_PET_FX: PetFx = { atk: 0, def: 0, hp: 0, regen: 0, poison: 0, crit: 0, dodge: 0, star: 0 };
export function petFx(pet: { id: string; lv: number } | null | undefined): PetFx {
  if (!pet || !isPetId(pet.id) || !(pet.lv > 0)) return NO_PET_FX;
  const v = petPower(pet.id, pet.lv) / 100;
  const key: Record<PetId, keyof PetFx> = { slime: 'regen', sheep: 'hp', mushroom: 'poison', golem: 'def', firefly: 'crit', penguin: 'dodge', starcat: 'star', dragon: 'atk' };
  return { ...NO_PET_FX, [key[pet.id]]: v };
}

// 펫 최고 레벨: 깬 장 × 5. 9장까지 깼으면 끝이 없어요(Infinity).
export const petCap = (top: number) => (top >= PET_CHAPTERS ? Infinity : Math.max(0, top) * BAND);

// Lv(next-1) → Lv next로 올리는 값.
// 재료 칸 b = ceil(next / 5): b장 재료 (b+1)개 + (b-1)장 재료 (b-1)개, 젤코인 50 × next.
// 마지막 칸 뒤(끝없는 레벨): 아무 장 재료 20개부터 5레벨마다 1개씩 더(가장 많이 가진 장에서 알아서 빼요),
// 젤코인은 마지막 칸 값(2,250)에서 레벨마다 100씩 더. 마지막 칸(9장 재료 10 + 8장 재료 8)보다 늘 많이 들어요.
export const PET_ANY_MATS = 20;
export type PetNeed = { cost: MatCost[]; any: number; coins: number; band: number };
export function petNeed(next: number): PetNeed {
  const L = Math.max(1, Math.floor(next));
  if (L > BAND_MAX) return { cost: [], any: PET_ANY_MATS + Math.floor((L - BAND_MAX - 1) / BAND), coins: 50 * BAND_MAX + 100 * (L - BAND_MAX), band: 0 };
  const b = Math.ceil(L / BAND);
  const cost: MatCost[] = [{ ch: b, n: b + 1 }];
  if (b >= 2) cost.push({ ch: b - 1, n: b - 1 });
  return { cost, any: 0, coins: 50 * L, band: b };
}
// 끝없는 레벨에서 재료를 뺄 장: 가장 많이 가진 장(같으면 낮은 장)
export function anyMatChapter(mats: Record<number, number>, n: number): number | null {
  let best: number | null = null;
  for (let ch = 1; ch <= MAX_CHAPTER; ch++) if ((mats[ch] ?? 0) >= n && (best === null || (mats[ch] ?? 0) > (mats[best] ?? 0))) best = ch;
  return best;
}

export type PetBag = Partial<Record<PetId, number>>;
export function parsePets(raw: string | null | undefined): PetBag {
  const out: PetBag = {};
  try {
    for (const [k, v] of Object.entries(JSON.parse(raw || '{}') as Record<string, unknown>)) if (isPetId(k) && Number.isSafeInteger(v) && (v as number) > 0) out[k] = v as number;
  } catch {
    /* 비어 있는 걸로 봐요 */
  }
  return out;
}
