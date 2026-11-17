// 도감 카드 장수 보상(멍쑤님 아이디어, 나리 2026-11-17): 도감 칭호 단계(5·10·15…100장)에 처음 닿을 때마다
// 도감 젤리를 한 번 줘요. 처음엔 빡빡하게(다 모아도 16개). 값은 여기서만 바꾸면 돼요.
// 카드는 지금 서버에 있는 멤버 카드만 세요. 한 번 받은 단계는 카드 수가 줄어도 다시 주지 않아요.
// 받는 일은 봇 동기화(src/sync.ts)에서 카드 경험치를 올린 다음 같은 묶음 안에서 해요.
import { titleName } from './titles';

export const CARD_JELLY: [cards: number, jelly: number][] = [
  [5, 1], [10, 1], [15, 1], [20, 1], [30, 1], [40, 2], [50, 2], [60, 2], [80, 2], [100, 3],
];

// waiting: 장수는 채웠지만 아직 안 받은 단계(다음에 함께한 활동이 동기화될 때 받아요)
export type CardReward = { cards: number; jelly: number; title: string | null; waiting: boolean };
// 다음에 받을 단계: 받은 기록(claimed)에 없는 가장 낮은 단계(다 받았으면 null).
// 지금 장수가 아니라 받은 기록으로 골라요(상대가 떠나 장수가 줄어도 이미 받은 단계를 다시 보여 주지 않게).
export function nextCardReward(cards: number, claimed: ReadonlySet<number>): CardReward | null {
  const s = CARD_JELLY.find(([n]) => !claimed.has(n));
  return s ? { cards: s[0], jelly: s[1], title: titleName(`cards-${s[0]}`), waiting: cards >= s[0] } : null;
}

export async function claimedCardSteps(db: D1Database, user: string): Promise<Set<number>> {
  const { results } = await db.prepare('SELECT cards FROM card_count_rewards WHERE user_id = ?').bind(user).all<{ cards: number }>();
  return new Set(results.map((r) => r.cards));
}

// SQL에 쓰는 단계 표: (VALUES (5, 1), (10, 1), …)
export const CARD_JELLY_VALUES = `(VALUES ${CARD_JELLY.map(([n, j]) => `(${n}, ${j})`).join(', ')})`;
