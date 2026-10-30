import { CHARACTERS, CHARACTER_VARIANTS } from './characters';

// 멤버 캐릭터: 나리님이 준 캐릭터 21종 × 색 12가지(public/char/). 서버 안에서 겹치지 않게 골라요.
// 처음 21명은 서로 다른 캐릭터를 원래 색으로 받고, 그다음부터 색이 다른 버전이 나와요.
export const CHARACTER_TOTAL = CHARACTERS.length * CHARACTER_VARIANTS;

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const key = (base: number, variant: number) => `${CHARACTERS[base]!.id}-${variant}`;

export function isCharacterId(id: string | null | undefined): id is string {
  if (!id) return false;
  const m = /^([a-z-]+)-(\d+)$/.exec(id);
  return !!m && CHARACTERS.some((c) => c.id === m[1]) && Number(m[2]) < CHARACTER_VARIANTS;
}

// 아직 아무도 안 쓰는 캐릭터 하나. 252가지가 다 차면 겹치는 걸 허락해요.
export function pickCharacter(userId: string, taken: Set<string>): string {
  const start = hash(userId) % CHARACTERS.length;
  const rot = hash(`${userId}:color`) % (CHARACTER_VARIANTS - 1);
  for (let i = 0; i < CHARACTER_VARIANTS; i++) {
    const variant = i === 0 ? 0 : ((rot + i - 1) % (CHARACTER_VARIANTS - 1)) + 1;
    for (let b = 0; b < CHARACTERS.length; b++) {
      const id = key((start + b) % CHARACTERS.length, variant);
      if (!taken.has(id)) return id;
    }
  }
  return fallbackCharacter(userId);
}

// DB에 정해진 캐릭터가 없을 때(떠난 멤버 등) ID로 늘 같은 캐릭터를 보여 줘요.
export function fallbackCharacter(userId: string): string {
  const h = hash(userId);
  return key(h % CHARACTERS.length, Math.floor(h / CHARACTERS.length) % CHARACTER_VARIANTS);
}

export function characterUrl(characterId: string | null | undefined, userId: string): string {
  return `/char/${isCharacterId(characterId) ? characterId : fallbackCharacter(userId)}.png`;
}
