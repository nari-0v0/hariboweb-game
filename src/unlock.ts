import { levelFromXp } from './levels';

// 도감으로 게임 열기(나리 2026-11-13): 원정대 1~3장, 사건파일 처음 5개는 그냥 할 수 있어요.
// 오래 할 게임이라 조건을 높게 잡았어요(나리 2026-11-13). 그 뒤로는 도감 카드를 일정 장 수 이상 모아야 하고, 더 깊이 가면 모은 카드 중 일정 레벨 이상인 카드도 필요해요.
// 카드는 지금 서버에 있는 멤버 카드만 세요(떠난 멤버 카드는 빼요).

export type Need = { cards: number; lv?: number; lvCards?: number };
export type DogamProgress = { cards: number; levels: number[] }; // levels: 카드마다 레벨

const FREE: Need = { cards: 0 };

// 원정대 장(1부터)마다 필요한 것. 앞 장을 깨야 다음 장이 열리는 규칙은 그대로예요.
export const JOURNEY_NEEDS: Need[] = [
  FREE,
  FREE,
  FREE,
  { cards: 15 },
  { cards: 25 },
  { cards: 35 },
  { cards: 40, lv: 10, lvCards: 5 },
  { cards: 50, lv: 20, lvCards: 5 },
  { cards: 60, lv: 30, lvCards: 5 },
];

// 사건파일: 목록 순서대로 5개씩 묶어요.
export const ESCAPE_STEPS: Need[] = [
  FREE,
  { cards: 10 },
  { cards: 15 },
  { cards: 20 },
  { cards: 30 },
  { cards: 35, lv: 10, lvCards: 3 },
  { cards: 40, lv: 10, lvCards: 6 },
  { cards: 50, lv: 20, lvCards: 3 },
  { cards: 60, lv: 20, lvCards: 6 },
  { cards: 70, lv: 30, lvCards: 5 },
];
export const ESCAPE_STEP_SIZE = 5;

export const journeyNeed = (ch: number): Need => JOURNEY_NEEDS[Math.max(1, ch) - 1] ?? JOURNEY_NEEDS[JOURNEY_NEEDS.length - 1]!;
export const escapeNeed = (index: number): Need =>
  ESCAPE_STEPS[Math.floor(Math.max(0, index) / ESCAPE_STEP_SIZE)] ?? ESCAPE_STEPS[ESCAPE_STEPS.length - 1]!;

export const lvCount = (p: DogamProgress, lv: number) => p.levels.filter((l) => l >= lv).length;

export function meets(need: Need, p: DogamProgress): boolean {
  if (p.cards < need.cards) return false;
  return !need.lv || lvCount(p, need.lv) >= (need.lvCards ?? 0);
}

// "도감 카드 20장 · Lv10 이상 3장" (모자란 만큼도 같이)
export function needText(need: Need, p?: DogamProgress): string {
  const parts = [`도감 카드 ${need.cards}장${p ? ` (지금 ${p.cards}장)` : ''}`];
  if (need.lv) parts.push(`Lv${need.lv} 이상 카드 ${need.lvCards}장${p ? ` (지금 ${lvCount(p, need.lv)}장)` : ''}`);
  return parts.join(' · ');
}

// 칸이 좁은 곳에 쓰는 짧은 글: "카드 20장 · Lv10+ 3장"
export const shortNeed = (need: Need) => `카드 ${need.cards}장${need.lv ? ` · Lv${need.lv}+ ${need.lvCards}장` : ''}`;

// 도감이 허락하는 가장 깊은 원정대 장(앞에서부터 이어서)
export function journeyOpenTo(p: DogamProgress): number {
  let ch = 0;
  while (ch < JOURNEY_NEEDS.length && meets(JOURNEY_NEEDS[ch]!, p)) ch++;
  return ch;
}

export async function dogamProgress(db: D1Database, userId: string): Promise<DogamProgress> {
  const { results } = await db
    .prepare(
      `SELECT c.xp FROM cards c JOIN members t ON t.user_id = c.target_id AND t.active = 1
       WHERE c.owner_id = ? AND c.target_id != c.owner_id`,
    )
    .bind(userId)
    .all<{ xp: number }>();
  return { cards: results.length, levels: results.map((r) => levelFromXp(r.xp)) };
}
