// 도감 카드 장수 보상(멍쑤님 아이디어, 나리 2026-11-17): 도감 칭호 단계(5·10·15…100장)에 처음 닿을 때마다
// 도감 젤리를 한 번 줘요. 처음엔 빡빡하게(다 모아도 16개). 값은 여기서만 바꾸면 돼요.
// 카드는 지금 서버에 있는 멤버 카드만 세요. 한 번 받은 단계는 카드 수가 줄어도 다시 주지 않아요.
// 받는 때: 봇 동기화(src/sync.ts)에서 함께한 활동이 들어온 사람, 그리고 내 카드·내 도감을 열 때(settleCardRewards).
import { notTestMember } from './test-accounts';
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

// 받을 단계를 적고(이미 받은 단계는 건너뛰어요), 이번에 새로 적힌 단계만큼 젤리를 더하고 🔔 알림을 남기는 문장 3개.
// batchId: 이번에 새로 적힌 것만 고르는 표시(동기화 묶음 번호, 또는 화면에서 연 번호).
export function cardRewardStatements(db: D1Database, owner: string, batchId: string, t: string): D1PreparedStatement[] {
  const cardCount = `(SELECT COUNT(*) FROM cards c JOIN members m ON m.user_id = c.target_id AND m.active = 1
     WHERE c.owner_id = ?1 AND c.target_id != c.owner_id AND ${notTestMember('c.target_id')})`;
  const fresh = '(SELECT COALESCE(SUM(jelly), 0) FROM card_count_rewards WHERE batch_id = ?2 AND user_id = ?1)';
  return [
    db
      .prepare(
        `INSERT INTO card_count_rewards (user_id, cards, jelly, batch_id, paid_at)
         SELECT ?1, v.column1, v.column2, ?2, ?3 FROM ${CARD_JELLY_VALUES} AS v
         WHERE v.column1 <= ${cardCount} AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
         ON CONFLICT (user_id, cards) DO NOTHING`,
      )
      .bind(owner, batchId, t),
    db
      .prepare(
        `INSERT INTO profiles (user_id, dogam_jelly, updated_at)
         SELECT ?1, ${fresh}, ?3 WHERE ${fresh} > 0
         ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + excluded.dogam_jelly, updated_at = ?3`,
      )
      .bind(owner, batchId, t),
    db
      .prepare(
        `INSERT INTO alerts (user_id, ref, title, body, created_at)
         SELECT ?1, 'cards-' || cards, '🃏 도감 카드 ' || cards || '장 달성!', '카드 ' || cards || '장을 모아서 도감 젤리 ' || jelly || '개를 받았어요.', ?3
         FROM card_count_rewards WHERE batch_id = ?2 AND user_id = ?1
         ON CONFLICT (user_id, ref) DO NOTHING`,
      )
      .bind(owner, batchId, t),
  ];
}

// 내 카드·내 도감을 열 때: 장수는 채웠는데 아직 못 받은 단계가 있으면 바로 줘요(나리 2026-11-17).
// 상대가 다시 들어와서 장수가 늘었거나, 이 기능이 생기기 전에 이미 모은 사람도 여기서 받아요.
export async function settleCardRewards(db: D1Database, user: string, cards: number, claimed: ReadonlySet<number>, now = new Date()): Promise<boolean> {
  if (!CARD_JELLY.some(([n]) => n <= cards && !claimed.has(n))) return false;
  await db.batch(cardRewardStatements(db, user, `view:${crypto.randomUUID()}`, now.toISOString()));
  return true;
}
