import { levelFromXp } from './levels';

// 도감으로 게임 열기(나리 2026-11-13): 원정대 1~3장, 사건파일 처음 5개는 그냥 할 수 있어요.
// 계단식(나리 2026-11-13): 활동 많은 사람은 1~2주마다 새 장이 열리게, 한 단계에서 한 달 넘게 멈추지 않게 실제 기록으로 맞췄어요. 그 뒤로는 도감 카드를 일정 장 수 이상 모아야 하고, 더 깊이 가면 모은 카드 중 일정 레벨 이상인 카드도 필요해요.
// 카드는 지금 서버에 있는 멤버 카드만 세요(떠난 멤버 카드는 빼요).

export type Need = { cards: number; lv?: number; lvCards?: number; cap?: true }; // cap: 카드 장수를 멤버 수의 50%까지로 줄여요
export type DogamProgress = { cards: number; levels: number[]; members?: number }; // levels: 카드마다 레벨, members: 지금 서버 멤버 수

// 나리 2026-11-19: 원정대 10~15장(cap 표시)의 카드 장수 조건은 전체 멤버의 50%를 넘지 않아요(99명이면 49장). 멤버 수가 바뀌면 따라 바뀌어요.
export const CARD_CAP_SHARE = 0.5;
export const cardCap = (members?: number) => (members && members > 0 ? Math.floor(members * CARD_CAP_SHARE) : Infinity);
// 멤버 수에 맞춘 실제 조건
export const capNeed = (need: Need, members?: number): Need => {
  const cap = cardCap(members);
  return need.cap && need.cards > cap ? { ...need, cards: cap } : need;
};

const FREE: Need = { cards: 0 };

// 원정대 장(1부터)마다 필요한 것. 앞 장을 깨야 다음 장이 열리는 규칙은 그대로예요.
export const JOURNEY_NEEDS: Need[] = [
  FREE,
  FREE,
  FREE,
  { cards: 10 },
  { cards: 20 },
  { cards: 30 },
  { cards: 35, lv: 10, lvCards: 5 },
  { cards: 45, lv: 15, lvCards: 5 },
  { cards: 55, lv: 20, lvCards: 5 },
  // 10~15장(2026-11-19): 처음엔 빡빡하게. 12월 초 기록을 보고 여기 숫자만 바꿔요.
  { cards: 60, lv: 20, lvCards: 8, cap: true },
  { cards: 62, lv: 25, lvCards: 8, cap: true },
  { cards: 64, lv: 25, lvCards: 10, cap: true },
  { cards: 66, lv: 30, lvCards: 10, cap: true },
  { cards: 68, lv: 30, lvCards: 12, cap: true },
  { cards: 70, lv: 35, lvCards: 12, cap: true },
];

// 원정대 장이 열리는 날(한국 시간 0시). null이면 "준비 중"으로 잠겨 있어요(도감 조건을 채워도 안 열려요).
// 나리 2026-11-19 저녁: 10~15장은 날짜 없이 도감 조건만 채우면 열려요. 그래서 지금은 비어 있어요(나중에 새 장을 미리 잠글 때만 써요).
export const JOURNEY_RELEASE: Record<number, string | null> = {};
export const journeyReleased = (ch: number, now: Date = new Date()) => {
  if (!(ch in JOURNEY_RELEASE)) return true;
  const day = JOURNEY_RELEASE[ch];
  return !!day && now.getTime() >= Date.parse(`${day}T00:00:00+09:00`);
};
// 지금 열린(준비 중이 아닌) 가장 높은 장. 장비 강화도 여기까지만 보여 줘요(+N에 N장 재료가 들어서).
export const releasedTop = (max: number, now: Date = new Date()) => {
  let ch = 0;
  while (ch < max && journeyReleased(ch + 1, now)) ch++;
  return ch;
};
// "준비 중이에요" 또는 "1월 4일에 열려요"
export const releaseText = (ch: number) => {
  if (!(ch in JOURNEY_RELEASE)) return '';
  const day = JOURNEY_RELEASE[ch];
  return day ? `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일에 열려요` : '준비 중이에요';
};

// 사건파일: 목록 순서대로 5개씩 묶어요.
export const ESCAPE_STEPS: Need[] = [
  FREE,
  { cards: 5 },
  { cards: 10 },
  { cards: 15 },
  { cards: 20 },
  { cards: 25 },
  { cards: 30, lv: 10, lvCards: 3 },
  { cards: 35, lv: 10, lvCards: 5 },
  { cards: 45, lv: 15, lvCards: 5 },
  { cards: 55, lv: 20, lvCards: 5 },
];
export const ESCAPE_STEP_SIZE = 5;

export const journeyNeed = (ch: number): Need => JOURNEY_NEEDS[Math.max(1, ch) - 1] ?? JOURNEY_NEEDS[JOURNEY_NEEDS.length - 1]!;
export const escapeNeed = (index: number): Need =>
  ESCAPE_STEPS[Math.floor(Math.max(0, index) / ESCAPE_STEP_SIZE)] ?? ESCAPE_STEPS[ESCAPE_STEPS.length - 1]!;

export const lvCount = (p: DogamProgress, lv: number) => p.levels.filter((l) => l >= lv).length;

export function meets(need0: Need, p: DogamProgress): boolean {
  const need = capNeed(need0, p.members);
  if (p.cards < need.cards) return false;
  return !need.lv || lvCount(p, need.lv) >= (need.lvCards ?? 0);
}

// "도감 카드 20장 · Lv10 이상 3장" (모자란 만큼도 같이)
export function needText(need0: Need, p?: DogamProgress): string {
  const need = capNeed(need0, p?.members);
  const parts = [`도감 카드 ${need.cards}장${p ? ` (지금 ${p.cards}장)` : ''}`];
  if (need.lv) parts.push(`Lv${need.lv} 이상 카드 ${need.lvCards}장${p ? ` (지금 ${lvCount(p, need.lv)}장)` : ''}`);
  return parts.join(' · ');
}

// 칸이 좁은 곳에 쓰는 짧은 글: "카드 20장 · Lv10+ 3장"
export const shortNeed = (need0: Need, p?: DogamProgress) => {
  const need = capNeed(need0, p?.members);
  return `카드 ${need.cards}장${need.lv ? ` · Lv${need.lv}+ ${need.lvCards}장` : ''}`;
};

// 도감(과 여는 날)이 허락하는 가장 깊은 원정대 장(앞에서부터 이어서)
export function journeyOpenTo(p: DogamProgress, now: Date = new Date()): number {
  let ch = 0;
  while (ch < JOURNEY_NEEDS.length && meets(JOURNEY_NEEDS[ch]!, p) && journeyReleased(ch + 1, now)) ch++;
  return ch;
}

export async function dogamProgress(db: D1Database, userId: string): Promise<DogamProgress> {
  const [{ results }, total] = await Promise.all([
    db
      .prepare(
        `SELECT c.xp FROM cards c JOIN members t ON t.user_id = c.target_id AND t.active = 1
         WHERE c.owner_id = ? AND c.target_id != c.owner_id`,
      )
      .bind(userId)
      .all<{ xp: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM members WHERE active = 1').first<{ n: number }>(),
  ]);
  return { cards: results.length, levels: results.map((r) => levelFromXp(r.xp)), members: total?.n ?? 0 };
}
