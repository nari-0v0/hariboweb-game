import { cardScore, DAILY_CHIPS, natural, openingPayout, playHand, slotPayout, spinSlots, spinWheel, startHand, WHEEL, type CardMove, type Hand } from './gamble';
import { GAMBLE_TITLES, GAMBLE_WINNER_ID, stripTitle, titleById, titleItemId } from './titles';

export type Game = 'slot' | 'roulette' | 'cards';
export type GambleAccount = {
  chips: number; free_day: string | null; rescue_day: string | null;
  won: number; best_win: number; all_in_wins: number; plays: number; jackpots: number; naturals: number;
};
export type Round = {
  user_id: string; token: string; game: Game; bet: number; state: string;
  expires_at: string; revision: number; multiplier: number | null;
};

export function gambleDay(now: string) {
  return new Date(Date.parse(now) + 9 * 3600_000).toISOString().slice(0, 10);
}

function awardMilestones(db: D1Database, user: string, now: string) {
  const rules = GAMBLE_TITLES.flatMap(({ id, rule }) =>
    rule.kind === 'gamble' ? [{ item: titleItemId(id), metric: rule.metric, count: rule.count }] : [],
  );
  return db.prepare(`INSERT OR IGNORE INTO owned_items (user_id, item_id, acquired_at)
    SELECT a.user_id, json_extract(r.value, '$.item'), ? FROM gamble_accounts a, json_each(?) r
    WHERE a.user_id = ? AND CASE json_extract(r.value, '$.metric')
      WHEN 'chips' THEN a.chips WHEN 'all_in_wins' THEN a.all_in_wins
      WHEN 'jackpots' THEN a.jackpots WHEN 'naturals' THEN a.naturals END >= json_extract(r.value, '$.count')`)
    .bind(now, JSON.stringify(rules), user);
}

export async function claimDaily(db: D1Database, user: string, now: string): Promise<boolean> {
  const day = gambleDay(now);
  const [grant] = await db.batch([
    db.prepare(`INSERT INTO gamble_accounts (user_id, chips, free_day)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ? AND active = 1)
      ON CONFLICT(user_id) DO UPDATE SET chips = chips + excluded.chips, free_day = excluded.free_day
      WHERE free_day IS NULL OR free_day < excluded.free_day`).bind(user, DAILY_CHIPS, day, user),
    awardMilestones(db, user, now),
  ]);
  return grant!.meta.changes === 1;
}

export async function rescueChips(db: D1Database, user: string, now: string): Promise<boolean> {
  const day = gambleDay(now);
  const result = await db.prepare(`UPDATE gamble_accounts SET chips = ?, rescue_day = ?
    WHERE user_id = ? AND chips = 0 AND (rescue_day IS NULL OR rescue_day < ?)
      AND EXISTS (SELECT 1 FROM members WHERE user_id = ? AND active = 1)`)
    .bind(DAILY_CHIPS, day, user, day, user).run();
  return result.meta.changes === 1;
}

export const gambleAccount = (db: D1Database, user: string) =>
  db.prepare('SELECT * FROM gamble_accounts WHERE user_id = ?').bind(user).first<GambleAccount>();

export const gambleRound = (db: D1Database, user: string, token: string) =>
  db.prepare('SELECT * FROM gamble_rounds WHERE user_id = ? AND token = ?').bind(user, token).first<Round>();

export const activeHand = (db: D1Database, user: string) =>
  db.prepare("SELECT * FROM gamble_rounds WHERE user_id = ? AND game = 'cards' AND settled_at IS NULL").bind(user).first<Round>();

export async function betChips(db: D1Database, user: string, game: Game, bet: number, token: string, now: string) {
  if (!Number.isSafeInteger(bet) || bet < 1) return null;
  const state = game === 'slot' ? spinSlots() : game === 'roulette' ? spinWheel() : startHand();
  const multiplier = Array.isArray(state) ? slotPayout(state) : typeof state === 'number' ? WHEEL[state]! : openingPayout(state);
  const expires = new Date(Date.parse(gambleDay(now) + 'T00:00:00+09:00') + 86_400_000).toISOString();
  const insert = db.prepare(`INSERT OR IGNORE INTO gamble_rounds (user_id, token, game, bet, all_in, state, expires_at)
    SELECT a.user_id, ?, ?, ?, a.chips = ?, ?, ? FROM gamble_accounts a
    JOIN members m ON m.user_id = a.user_id AND m.active = 1
    WHERE a.user_id = ? AND a.chips >= ?`).bind(token, game, bet, bet, JSON.stringify(state), expires, user, bet);
  const statements = [insert];
  if (multiplier !== null) {
    statements.push(
      db.prepare(`UPDATE gamble_rounds SET multiplier = ?, settled_at = ?, jackpot = ?, natural = ?
        WHERE user_id = ? AND token = ? AND changes() = 1`)
        .bind(multiplier, now, game === 'slot' && multiplier === 10 ? 1 : 0,
          typeof state === 'object' && !Array.isArray(state) && natural(state.player) ? 1 : 0, user, token),
      awardMilestones(db, user, now),
    );
  }
  await db.batch(statements);
  return gambleRound(db, user, token);
}

async function updateHand(db: D1Database, round: Round, move: CardMove, now: string, expired: boolean) {
  const hand: Hand = JSON.parse(round.state);
  const multiplier = playHand(hand, move);
  const [result] = await db.batch([
    db.prepare(`UPDATE gamble_rounds SET state = ?, revision = revision + 1, multiplier = ?, settled_at = ?
      WHERE user_id = ? AND token = ? AND revision = ? AND settled_at IS NULL
        AND ((? = 1 AND expires_at <= ?) OR (? = 0 AND expires_at > ?))`)
      .bind(JSON.stringify(hand), multiplier, multiplier === null ? null : expired ? round.expires_at : now,
        round.user_id, round.token, round.revision, Number(expired), now, Number(expired), now),
    awardMilestones(db, round.user_id, now),
  ]);
  return result!.meta.changes === 1;
}

export async function moveHand(db: D1Database, user: string, token: string, revision: number, move: CardMove, now: string) {
  const round = await gambleRound(db, user, token);
  if (!round || round.game !== 'cards' || round.multiplier !== null || round.revision !== revision) return false;
  if (round.expires_at <= now) return updateHand(db, round, 'stand', now, true);
  return updateHand(db, round, move, now, false);
}

export async function expireHand(db: D1Database, user: string, now: string) {
  const round = await activeHand(db, user);
  if (round && round.expires_at <= now) {
    await updateHand(db, round, 'stand', now, true);
    return round.token;
  }
  return null;
}

export function publicHand(round: Round) {
  const { player, dealer }: Hand = JSON.parse(round.state);
  return { player, dealer: round.multiplier === null ? dealer.slice(0, 1) : dealer, score: cardScore(player) };
}

type RankRow = { name: string; value: number; title_id: string | null };
const RANK_FIELDS = ['chips', 'best_win', 'all_in_wins'] as const;

export async function gambleRanks(db: D1Database, now: string) {
  const ranks = await db.batch([
    ...RANK_FIELDS.map((field) => db.prepare(`SELECT m.display_name AS name, a.${field} AS value, p.title_id
      FROM gamble_accounts a JOIN members m ON m.user_id = a.user_id AND m.active = 1
      LEFT JOIN profiles p ON p.user_id = a.user_id
      WHERE a.${field} > 0 ORDER BY a.${field} DESC, a.user_id LIMIT 10`)),
    db.prepare(`SELECT m.display_name AS name, SUM(r.bet * (r.multiplier - 1)) AS value, p.title_id
      FROM gamble_rounds r JOIN members m ON m.user_id = r.user_id AND m.active = 1
      LEFT JOIN profiles p ON p.user_id = r.user_id
      JOIN seasons s ON s.id = (SELECT id FROM seasons WHERE starts_at <= ? AND ends_at > ? ORDER BY id DESC LIMIT 1)
      WHERE r.settled_at >= s.starts_at AND r.settled_at < s.ends_at AND r.multiplier > 1
      GROUP BY r.user_id ORDER BY value DESC, r.user_id LIMIT 1`).bind(now, now),
  ]);
  // 디스코드는 방장 닉네임을 못 바꾸니, 고른 칭호는 닉네임 대신 여기서 「칭호」로 붙여 보여 줘요.
  return ranks.map(({ results }) => (results as RankRow[]).map(({ name, value, title_id }) => {
    const title = titleById(title_id);
    return { value, name: (title ? `「${title.name}」 ` : '') + stripTitle(name) };
  }));
}

export async function awardGambleSeason(db: D1Database, seasonId: string, end: string, now: string) {
  // 정산 시각이 시즌에 속하는 미완료 판도 순위를 확정하기 전에 계산해요.
  const { results } = await db.prepare(`SELECT * FROM gamble_rounds
    WHERE game = 'cards' AND settled_at IS NULL AND expires_at < ?`).bind(end).all<Round>();
  for (const round of results) await updateHand(db, round, 'stand', now, true);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO gamble_season_winners (season_id, user_id, won, awarded_at)
      SELECT s.id, r.user_id, SUM(r.bet * (r.multiplier - 1)) AS won, ?
      FROM seasons s JOIN gamble_rounds r ON r.settled_at >= s.starts_at AND r.settled_at < s.ends_at
      JOIN members m ON m.user_id = r.user_id AND m.active = 1
      WHERE s.id = ? AND r.multiplier > 1
      GROUP BY r.user_id ORDER BY won DESC, r.user_id LIMIT 1`).bind(now, seasonId),
    db.prepare(`INSERT OR IGNORE INTO owned_items (user_id, item_id, acquired_at)
      SELECT user_id, ?, awarded_at FROM gamble_season_winners WHERE season_id = ? AND changes() = 1`)
      .bind(titleItemId(GAMBLE_WINNER_ID), seasonId),
  ]);
}
