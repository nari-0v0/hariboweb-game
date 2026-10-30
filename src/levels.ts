// 레벨 L에 도달하는 데 필요한 누적 경험치: 30 × (L-1)²
export const MAX_LEVEL = 50;

export function xpForLevel(level: number): number {
  return 30 * (level - 1) ** 2;
}

export function levelFromXp(xp: number): number {
  if (!(xp > 0)) return 1;
  let level = Math.min(MAX_LEVEL, Math.floor(Math.sqrt(xp / 30)) + 1);
  // 부동소수점 오차 보정
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

export function levelName(level: number): string {
  if (level >= 20) return '단짝';
  if (level >= 10) return '절친';
  if (level >= 5) return '친구';
  return '첫 만남';
}

export type Tier = 'plain' | 'silver' | 'gold' | 'sparkle' | 'holo' | 'legend';

export function tierFor(level: number): Tier {
  if (level >= 50) return 'legend';
  if (level >= 30) return 'holo';
  if (level >= 20) return 'sparkle';
  if (level >= 10) return 'gold';
  if (level >= 5) return 'silver';
  return 'plain';
}

export function progress(xp: number) {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, current: xp, next: null, ratio: 1 };
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, current: xp, next: to, ratio: (Math.max(0, xp) - from) / (to - from) };
}
