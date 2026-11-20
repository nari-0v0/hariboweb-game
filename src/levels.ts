// 레벨 L에 도달하는 데 필요한 누적 경험치: 4.5 × (L-1)² (올림)
// 한 사람과 하루 1시간(60XP)씩 같이 놀면 약 2년(735일)에 만렙 100이 돼요(나리 2026-11-13: 예전 2.25에서 두 배로 어렵게).
export const MAX_LEVEL = 100;
export const XP_SCALE = 4.5;

export function xpForLevel(level: number): number {
  return Math.ceil(XP_SCALE * (level - 1) ** 2);
}

export function levelFromXp(xp: number): number {
  if (!(xp > 0)) return 1;
  let level = Math.min(MAX_LEVEL, Math.floor(Math.sqrt(xp / XP_SCALE)) + 1);
  // 부동소수점 오차 보정
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

// 관계 이름: 1~9 첫 만남, 10~29 친구, 30~59 절친, 60~99 단짝, 100 평생 단짝
export function levelName(level: number): string {
  if (level >= 100) return '평생 단짝';
  if (level >= 60) return '단짝';
  if (level >= 30) return '절친';
  if (level >= 10) return '친구';
  return '첫 만남';
}

// 카드 모습은 10레벨마다 바뀌어요
export const TIERS = [
  { min: 100, id: 'legend', label: '전설' },
  { min: 90, id: 'ruby', label: '루비' },
  { min: 80, id: 'night', label: '밤하늘' },
  { min: 70, id: 'sunset', label: '노을' },
  { min: 60, id: 'rose', label: '장밋빛' },
  { min: 50, id: 'lavender', label: '보랏빛' },
  { min: 40, id: 'sky', label: '하늘' },
  { min: 30, id: 'mint', label: '민트' },
  { min: 20, id: 'gold', label: '금색' },
  { min: 10, id: 'silver', label: '은색' },
  { min: 1, id: 'plain', label: '분홍' },
] as const;

export type Tier = (typeof TIERS)[number]['id'];

export function tierFor(level: number): Tier {
  return TIERS.find((t) => level >= t.min)?.id ?? 'plain';
}

export function tierLabel(tier: Tier): string {
  return TIERS.find((t) => t.id === tier)?.label ?? '';
}

// 레벨에 따라 얹히는 장식: 10 은테, 20 금테, 50 반짝이, 70 광택, 100 움직이는 무지개 테두리
export function tierEffects(level: number): string[] {
  const out: string[] = [];
  if (level >= 20) out.push('ring-gold');
  else if (level >= 10) out.push('ring-silver');
  if (level >= 50) out.push('fx-sparkle');
  if (level >= 70) out.push('fx-shine');
  return out;
}

export function progress(xp: number) {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, current: xp, next: null, ratio: 1 };
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, current: xp, next: to, ratio: (Math.max(0, xp) - from) / (to - from) };
}
