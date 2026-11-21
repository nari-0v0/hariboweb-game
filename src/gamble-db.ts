import { dayStartMs, gameDay } from './day';
import { withBoosterMark } from './booster';
import { characterUrl } from './character';
import { BOOSTER_REFILL_CHIPS, REFILL_CHIPS, cardScore, coinPayout, DAILY_CHIPS, flipCoin, isCoinSide, natural, type CoinSide, openingPayout, playHand, slotPayout, spinSlots, spinWheel, startHand, WHEEL, type CardMove, type Hand } from './gamble';
import { GAMBLE_TITLES, GAMBLE_WINNER_ID, stripTitle, titleById, titleItemId } from './titles';
import { notTestMember } from './test-accounts';

export type Game = 'slot' | 'roulette' | 'cards' | 'coinflip';
export type GambleAccount = {
  chips: number; free_day: string | null; rescue_day: string | null;
  won: number; best_win: number; all_in_wins: number; plays: number; jackpots: number; naturals: number;
};
export type Round = {
  user_id: string; token: string; game: Game; bet: number; state: string;
  expires_at: string; revision: number; multiplier: number | null;
};

// 도감 날짜(한국 시간 아침 6시에 바뀌어요. src/day.ts)
export function gambleDay(now: string) {
  return gameDay(Date.parse(now));
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

// 받은 젤칩 수(못 받았으면 0). 겜블장에 처음 오면 시작 젤칩(DAILY_CHIPS)을 받고,
// 그 뒤로는 젤칩이 0개 이하일 때만 하루 한 번 REFILL_CHIPS(부스터 BOOSTER_REFILL_CHIPS)로 채워요(나리 2026-11-21).
// 시작 칩은 free_day가 비어 있는(한 번도 받지 않은) 계정이면 받아요. 젤칩 이전(0042)·점검 보상으로 계정이 먼저
// 만들어진 사람도 첫 방문에 1000개가 더해져요(나리: 기본 1000 + 옮긴 젤칩).
// 칩을 다 건 카드 21이 아직 안 끝났으면 진짜 0개가 아니라서 채우지 않아요.
export async function claimDaily(db: D1Database, user: string, now: string): Promise<number> {
  const day = gambleDay(now);
  const before = await db.prepare('SELECT chips, free_day FROM gamble_accounts WHERE user_id = ?').bind(user).first<{ chips: number; free_day: string | null }>();
  const [grant] = await db.batch([
    db.prepare(`INSERT INTO gamble_accounts (user_id, chips, free_day)
      SELECT ?1, ?2, ?3 FROM members m WHERE m.user_id = ?1 AND m.active = 1
      ON CONFLICT(user_id) DO UPDATE SET
        chips = CASE WHEN gamble_accounts.free_day IS NULL THEN gamble_accounts.chips + ?2
          WHEN (SELECT booster FROM members WHERE user_id = ?1) = 1 THEN ?5 ELSE ?4 END,
        free_day = excluded.free_day
      WHERE gamble_accounts.free_day IS NULL
        OR (gamble_accounts.chips <= 0 AND gamble_accounts.free_day < excluded.free_day
          AND NOT EXISTS (SELECT 1 FROM gamble_rounds WHERE user_id = ?1 AND settled_at IS NULL))`).bind(user, DAILY_CHIPS, day, REFILL_CHIPS, BOOSTER_REFILL_CHIPS),
    awardMilestones(db, user, now),
  ]);
  if (grant!.meta.changes !== 1) return 0;
  if (!before || before.free_day === null) return DAILY_CHIPS;
  const a = await db.prepare('SELECT chips FROM gamble_accounts WHERE user_id = ?').bind(user).first<{ chips: number }>();
  return Number(a?.chips ?? 0);
}

// 예전 "다시 시작" 버튼(지금은 화면에 없어요): 위와 같은 하루 한 번 채우기예요.
export async function rescueChips(db: D1Database, user: string, now: string): Promise<boolean> {
  const exists = await gambleAccount(db, user);
  if (!exists) return false;
  return (await claimDaily(db, user, now)) > 0;
}

// 디스코드 겜블장 지갑에서 옮겨 온 젤칩(옮겼으면, 처음 왔을 때 안내용)
export async function movedChips(db: D1Database, user: string): Promise<number> {
  // 나갔다 다시 들어온 멤버는 옮긴 젤칩을 다시 받지 않으니(0067), 지금 계정에 실제로 들어 있을 때만 알려요.
  const r = await db.prepare(`SELECT j.jelly FROM gamble_jelly_moves j JOIN gamble_accounts a ON a.user_id = j.user_id
    WHERE j.user_id = ? AND j.moved_at IS NOT NULL AND a.chips >= 1000 + j.jelly`).bind(user).first<{ jelly: number }>();
  return Number(r?.jelly ?? 0);
}

export const gambleAccount = (db: D1Database, user: string) =>
  db.prepare('SELECT * FROM gamble_accounts WHERE user_id = ?').bind(user).first<GambleAccount>();

export const gambleRound = (db: D1Database, user: string, token: string) =>
  db.prepare('SELECT * FROM gamble_rounds WHERE user_id = ? AND token = ?').bind(user, token).first<Round>();

export const activeHand = (db: D1Database, user: string) =>
  db.prepare("SELECT * FROM gamble_rounds WHERE user_id = ? AND game = 'cards' AND settled_at IS NULL").bind(user).first<Round>();

// 판과 판 사이 최소 간격. 사람이 누르면 그림이 도는 시간(1초 넘게) 때문에 걸리지 않고,
// F12 콘솔에서 자동으로 수천 판을 돌려 칩을 불리는 것만 막아요.
export const BET_GAP_MS = 1000;

export async function betChips(db: D1Database, user: string, game: Game, bet: number, token: string, now: string, pick?: CoinSide) {
  if (!Number.isSafeInteger(bet) || bet < 1) return null;
  if (game === 'coinflip' && !isCoinSide(pick)) return null;
  const since = new Date(Date.parse(now) - BET_GAP_MS).toISOString();
  const coin = game === 'coinflip' ? flipCoin(pick!) : null;
  const state = coin ?? (game === 'slot' ? spinSlots() : game === 'roulette' ? spinWheel() : startHand());
  const multiplier = coin ? coinPayout(coin) : Array.isArray(state) ? slotPayout(state) : typeof state === 'number' ? WHEEL[state]! : openingPayout(state as Hand);
  const expires = new Date(dayStartMs(gambleDay(now)) + 86_400_000).toISOString();
  const insert = db.prepare(`INSERT OR IGNORE INTO gamble_rounds (user_id, token, game, bet, all_in, state, expires_at)
    SELECT a.user_id, ?, ?, ?, a.chips = ?, ?, ? FROM gamble_accounts a
    JOIN members m ON m.user_id = a.user_id AND m.active = 1
    WHERE a.user_id = ? AND a.chips >= ?
      AND NOT EXISTS (SELECT 1 FROM gamble_rounds r WHERE r.user_id = a.user_id AND r.settled_at > ?)`)
    .bind(token, game, bet, bet, JSON.stringify(state), expires, user, bet, since);
  const statements = [insert];
  if (multiplier !== null) {
    statements.push(
      db.prepare(`UPDATE gamble_rounds SET multiplier = ?, settled_at = ?, jackpot = ?, natural = ?
        WHERE user_id = ? AND token = ? AND changes() = 1`)
        .bind(multiplier, now, game === 'slot' && multiplier === 10 ? 1 : 0,
          game === 'cards' && natural((state as Hand).player) ? 1 : 0, user, token),
      awardMilestones(db, user, now),
    );
  }
  await db.batch(statements);
  return gambleRound(db, user, token);
}

// 시간이 다 된 카드 21은 마감 바로 전(1ms 전)에 끝난 것으로 쳐요. 그래야 판을 건 날·시즌에 들어가요(마감 = 다음 날·시즌 시작).
const settledAtDeadline = (expires: string) => new Date(Date.parse(expires) - 1).toISOString();

function handStatements(db: D1Database, round: Round, move: CardMove, now: string, expired: boolean): D1PreparedStatement[] {
  const hand: Hand = JSON.parse(round.state);
  const multiplier = playHand(hand, move);
  return [
    db.prepare(`UPDATE gamble_rounds SET state = ?, revision = revision + 1, multiplier = ?, settled_at = ?
      WHERE user_id = ? AND token = ? AND revision = ? AND settled_at IS NULL
        AND ((? = 1 AND expires_at <= ?) OR (? = 0 AND expires_at > ?))`)
      .bind(JSON.stringify(hand), multiplier, multiplier === null ? null : expired ? settledAtDeadline(round.expires_at) : now,
        round.user_id, round.token, round.revision, Number(expired), now, Number(expired), now),
    awardMilestones(db, round.user_id, now),
  ];
}

async function updateHand(db: D1Database, round: Round, move: CardMove, now: string, expired: boolean) {
  const [result] = await db.batch(handStatements(db, round, move, now, expired));
  return result!.meta.changes === 1;
}

// 방금 판이 끝나서 아직 다음 판을 못 거는지(안내 문구용)
export async function betTooSoon(db: D1Database, user: string, now: string) {
  const since = new Date(Date.parse(now) - BET_GAP_MS).toISOString();
  return !!await db.prepare('SELECT 1 FROM gamble_rounds WHERE user_id = ? AND settled_at > ? LIMIT 1').bind(user, since).first();
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

// 아침 6시가 지나 저절로 멈춘 카드 21을 누구 것이든 정산해요(그 사람이 안 들어와도 순위에 바로 반영되게).
export async function expireAllHands(db: D1Database, now: string) {
  const { results } = await db
    .prepare(`SELECT * FROM gamble_rounds WHERE game = 'cards' AND settled_at IS NULL AND expires_at <= ?`)
    .bind(now)
    .all<Round>();
  // 읽은 뒤에 순위를 만들므로, 남은 판이 있어도 50명에서 멈추면 안 돼요.
  // 판마다 따로 요청하지 않고 50판씩 저장해 요청 횟수 제한 안에서 전부 정산해요.
  for (let i = 0; i < results.length; i += 50) {
    await db.batch(results.slice(i, i + 50).flatMap((r) => handStatements(db, r, 'stand', now, true)));
  }
}

export function publicHand(round: Round) {
  const { player, dealer }: Hand = JSON.parse(round.state);
  return { player, dealer: round.multiplier === null ? dealer.slice(0, 1) : dealer, score: cardScore(player) };
}

// 시즌 순이익: 끝난 판마다 받은 젤칩(내림) − 건 젤칩의 합. 진행 중인 판(multiplier가 빈 판)은 SUM에서 빠져요.
const SEASON_NET = 'SUM((r.bet * CAST(ROUND(r.multiplier * 100) AS INTEGER) / 100) - r.bet)';

type RankRow = { user_id: string; name: string; booster: number; value: number; title_id: string | null; character_id: string | null; deco_id: string | null };
const RANK_FIELDS = ['chips', 'best_win', 'all_in_wins'] as const;

export async function gambleMyRanks(db: D1Database, user: string) {
  const result = await db.batch(RANK_FIELDS.map((field) => db.prepare(
    `SELECT m.display_name AS name, m.booster, a.${field} AS value, p.character_id, p.deco_id,
       1 + (SELECT COUNT(*) FROM gamble_accounts other JOIN members active ON active.user_id = other.user_id AND active.active = 1
            WHERE other.${field} > a.${field} AND ${notTestMember('other.user_id')}) AS rank
     FROM gamble_accounts a JOIN members m ON m.user_id = a.user_id AND m.active = 1
     LEFT JOIN profiles p ON p.user_id = a.user_id
     WHERE a.user_id = ? AND a.${field} > 0`).bind(user)));
  return result.map(({ results }) => {
    const row = results[0] as (RankRow & { rank: number }) | undefined;
    return row ? { rank: row.rank, name: withBoosterMark(stripTitle(row.name), row.booster), value: row.value, char: characterUrl(row.character_id, user, row.deco_id) } : null;
  });
}

export async function gambleRanks(db: D1Database, now: string) {
  const ranks = await db.batch([
    ...RANK_FIELDS.map((field) => db.prepare(`SELECT a.user_id, m.display_name AS name, m.booster, a.${field} AS value, p.title_id, p.character_id, p.deco_id
      FROM gamble_accounts a JOIN members m ON m.user_id = a.user_id AND m.active = 1
      LEFT JOIN profiles p ON p.user_id = a.user_id
      WHERE a.${field} > 0 AND ${notTestMember('a.user_id')} ORDER BY a.${field} DESC, a.user_id LIMIT 10`)),
    // 시즌 순이익(나리 2026-11-21): 시즌 안에 끝난 모든 판의 (받은 젤칩 − 건 젤칩)을 더해요. 잃은 판은 빼고, 순이익이 0보다 큰 사람만요.
    db.prepare(`SELECT r.user_id, m.display_name AS name, m.booster, ${SEASON_NET} AS value, p.title_id, p.character_id, p.deco_id
      FROM gamble_rounds r JOIN members m ON m.user_id = r.user_id AND m.active = 1
      LEFT JOIN profiles p ON p.user_id = r.user_id
      JOIN seasons s ON s.id = (SELECT id FROM seasons WHERE starts_at <= ? AND ends_at > ? ORDER BY id DESC LIMIT 1)
      WHERE r.settled_at >= s.starts_at AND r.settled_at < s.ends_at AND ${notTestMember('r.user_id')}
      GROUP BY r.user_id HAVING value > 0 ORDER BY value DESC, r.user_id LIMIT 1`).bind(now, now),
  ]);
  // 디스코드는 방장 닉네임을 못 바꾸니, 고른 칭호는 닉네임 대신 여기서 「칭호」로 붙여 보여 줘요.
  return ranks.map(({ results }) => (results as RankRow[]).map(({ user_id, name, booster, value, title_id, character_id, deco_id }) => {
    const title = titleById(title_id);
    return { value, name: (title ? `「${title.name}」 ` : '') + withBoosterMark(stripTitle(name), booster), char: characterUrl(character_id, user_id, deco_id) };
  }));
}

export async function awardGambleSeason(db: D1Database, seasonId: string, end: string, now: string) {
  // 정산 시각이 시즌에 속하는 미완료 판도 순위를 확정하기 전에 계산해요.
  const { results } = await db.prepare(`SELECT * FROM gamble_rounds
    WHERE game = 'cards' AND settled_at IS NULL AND expires_at <= ?`).bind(end).all<Round>();
  for (const round of results) await updateHand(db, round, 'stand', now, true);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO gamble_season_winners (season_id, user_id, won, awarded_at)
      SELECT s.id, r.user_id, ${SEASON_NET} AS won, ?
      FROM seasons s JOIN gamble_rounds r ON r.settled_at >= s.starts_at AND r.settled_at < s.ends_at
      JOIN members m ON m.user_id = r.user_id AND m.active = 1
      WHERE s.id = ? AND ${notTestMember('r.user_id')}
      GROUP BY r.user_id HAVING won > 0 ORDER BY won DESC, r.user_id LIMIT 1`).bind(now, seasonId),
    db.prepare(`INSERT OR IGNORE INTO owned_items (user_id, item_id, acquired_at)
      SELECT user_id, ?, awarded_at FROM gamble_season_winners WHERE season_id = ? AND changes() = 1`)
      .bind(titleItemId(GAMBLE_WINNER_ID), seasonId),
  ]);
}

// 끝난 지 2주 안 된 시즌 중 겜블 우승이 아직 안 적힌 시즌을 다시 정산해요.
// (봇이 시즌 끝 전후로 30분 넘게 멈춰서 시즌 마무리 확인을 건너뛰어도 우승 칭호가 빠지지 않게)
export async function awardEndedGambleSeasons(db: D1Database, nowMs: number) {
  const t = new Date(nowMs).toISOString();
  const { results } = await db
    .prepare(
      `SELECT id, ends_at FROM seasons s WHERE ends_at <= ?1 AND ends_at > ?2
       AND NOT EXISTS (SELECT 1 FROM gamble_season_winners w WHERE w.season_id = s.id)`,
    )
    .bind(t, new Date(nowMs - 14 * 86_400_000).toISOString())
    .all<{ id: string; ends_at: string }>();
  for (const r of results) await awardGambleSeason(db, r.id, r.ends_at, t);
}
