import { CHARACTERS, CHARACTER_VARIANTS, DECO_CHARACTERS } from './characters';

// 멤버 캐릭터: 나리님이 준 그림 속 캐릭터들(public/char/). 서버 안에서 겹치지 않게 골라요.
// 디자인이 모두 다른 원래 그림(-0)을 먼저 나눠 주고, 멤버가 디자인 수보다 많을 때만
// 옷 색을 바꾼 여분(-1~)을 줘요. 한 번 받은 캐릭터는 저절로 바뀌지 않아요.
export const CHARACTER_TOTAL = CHARACTERS.length * CHARACTER_VARIANTS;

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const key = (base: number, variant: number) => `${CHARACTERS[base]!.id}-${variant}`;

// 기본 캐릭터는 소녀(girl-)와 소년(boy-) 두 묶음이에요. 멤버가 내 카드에서 고를 수 있어요.
export const CHARACTER_POOLS = ['girl', 'boy'] as const;
export type CharacterPool = (typeof CHARACTER_POOLS)[number];

export function isCharacterPool(v: unknown): v is CharacterPool {
  return CHARACTER_POOLS.includes(v as CharacterPool);
}

export function poolOf(characterId: string | null | undefined): CharacterPool | null {
  const prefix = characterId?.split('-')[0];
  return isCharacterPool(prefix) ? prefix : null;
}

const basesIn = (pool?: CharacterPool | null) =>
  CHARACTERS.flatMap((c, b) => (!pool || c.id.startsWith(`${pool}-`) ? [b] : []));

export function isCharacterId(id: string | null | undefined): id is string {
  if (!id) return false;
  const m = /^([a-z0-9-]+)-(\d+)$/.exec(id);
  return !!m && CHARACTERS.some((c) => c.id === m[1]) && Number(m[2]) < CHARACTER_VARIANTS;
}

// 아직 아무도 안 쓰는 캐릭터 하나(pool을 주면 그 묶음 안에서). 전부 차면 겹치는 걸 허락해요.
// forbidden: 겹쳐도 절대 주면 안 되는 캐릭터(다른 사람이 맡겨 둔 예전 캐릭터).
export function pickCharacter(userId: string, taken: Set<string>, pool?: CharacterPool | null, forbidden?: Set<string>): string {
  const bases = basesIn(pool);
  const start = hash(userId) % bases.length;
  const rot = hash(`${userId}:color`) % (CHARACTER_VARIANTS - 1);
  const order: string[] = [];
  for (let i = 0; i < CHARACTER_VARIANTS; i++) {
    const variant = i === 0 ? 0 : ((rot + i - 1) % (CHARACTER_VARIANTS - 1)) + 1;
    for (let b = 0; b < bases.length; b++) order.push(key(bases[(start + b) % bases.length]!, variant));
  }
  return order.find((id) => !taken.has(id) && !forbidden?.has(id)) ?? order.find((id) => !forbidden?.has(id)) ?? key(bases[start]!, 0);
}

// 리롤권(나리 2026-11-20): 같은 묶음에서 아무도 안 쓰는 캐릭터 중 하나를 무작위로. 디자인이 다른 원래 그림(-0)이 먼저고,
// 그게 다 차면 색만 바꾼 여분에서 골라요. 빈 캐릭터가 없으면 null(사지 않아요).
export function rerollCharacter(pool: CharacterPool, current: string | null, taken: Set<string>, forbidden: Set<string>, rand: () => number = Math.random): string | null {
  const bases = basesIn(pool);
  const free = (variant: number) => bases.map((b) => key(b, variant)).filter((id) => id !== current && !taken.has(id) && !forbidden.has(id));
  for (let v = 0; v < CHARACTER_VARIANTS; v++) {
    const list = free(v);
    if (list.length) return list[Math.floor(rand() * list.length)]!;
  }
  return null;
}

// 다시 골라야 하는 캐릭터인지: 캐릭터가 없거나 그림이 없어진 때뿐이에요.
// 한 번 받은 캐릭터는 저절로 바뀌지 않아요(나리 2026-11-17). 여분 색을 쓰던 멤버도
// 다른 사람이 나가거나 성별을 바꿔 빈 디자인이 생겼다고 옮기지 않아요.
export function shouldRepick(characterId: string | null): boolean {
  return !isCharacterId(characterId);
}

// DB에 정해진 캐릭터가 없을 때(떠난 멤버 등) ID로 늘 같은 캐릭터를 보여 줘요.
export function fallbackCharacter(userId: string): string {
  const h = hash(userId);
  return key(h % CHARACTERS.length, Math.floor(h / CHARACTERS.length) % CHARACTER_VARIANTS);
}

export const isDecoId = (id: string | null | undefined): id is string => !!id && DECO_CHARACTERS.some((d) => d.id === id);

// 꾸밈 캐릭터를 장착했으면 그 그림, 아니면 기본 캐릭터
export function characterUrl(characterId: string | null | undefined, userId: string, decoId?: string | null): string {
  if (isDecoId(decoId)) return `/char/deco/${decoId}.png`;
  return `/char/${isCharacterId(characterId) ? characterId : fallbackCharacter(userId)}.png`;
}
