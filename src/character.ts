import { CHARACTERS, CHARACTER_VARIANTS } from './characters';

// 멤버 캐릭터: 나리님이 준 그림 속 캐릭터들(public/char/). 서버 안에서 겹치지 않게 골라요.
// 디자인이 모두 다른 원래 그림(-0)을 먼저 나눠 주고, 멤버가 디자인 수보다 많을 때만
// 옷 색을 바꾼 여분(-1~)을 줘요. 새 그림이 들어오면 여분을 쓰던 멤버는 새 디자인으로 옮겨요.
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
export function pickCharacter(userId: string, taken: Set<string>, pool?: CharacterPool | null): string {
  const bases = basesIn(pool);
  const start = hash(userId) % bases.length;
  const rot = hash(`${userId}:color`) % (CHARACTER_VARIANTS - 1);
  for (let i = 0; i < CHARACTER_VARIANTS; i++) {
    const variant = i === 0 ? 0 : ((rot + i - 1) % (CHARACTER_VARIANTS - 1)) + 1;
    for (let b = 0; b < bases.length; b++) {
      const id = key(bases[(start + b) % bases.length]!, variant);
      if (!taken.has(id)) return id;
    }
  }
  return key(bases[start]!, 0);
}

// 다시 골라야 하는 캐릭터인지: 없어진 캐릭터이거나, 여분 색인데 아직 빈 디자인이 있을 때
export function shouldRepick(characterId: string | null, taken: Set<string>): boolean {
  if (!isCharacterId(characterId)) return true;
  if (characterId.endsWith('-0')) return false;
  return basesIn(poolOf(characterId)).some((b) => !taken.has(key(b, 0)));
}

// DB에 정해진 캐릭터가 없을 때(떠난 멤버 등) ID로 늘 같은 캐릭터를 보여 줘요.
export function fallbackCharacter(userId: string): string {
  const h = hash(userId);
  return key(h % CHARACTERS.length, Math.floor(h / CHARACTERS.length) % CHARACTER_VARIANTS);
}

export function characterUrl(characterId: string | null | undefined, userId: string): string {
  return `/char/${isCharacterId(characterId) ? characterId : fallbackCharacter(userId)}.png`;
}
