// 상점 「게임 기록 초기화권」(나리 2026-11-20, 20젤리): 겜블장·원정대·사건파일을 처음부터 다시 해요.
// - 겜블장: 젤칩은 시작 칩(1000)으로, 판 기록·통계는 0으로(옮겨 온 겜블 젤리도 사라져요). 하루 무료 칩을 받은 날은 그대로라 오늘 또 받지는 못해요.
// - 원정대: 판 기록, 장비·재료·훈련·젤코인·펫·끝없는 탑 전부 처음으로.
// - 사건파일: 푼 기록·재수사·오늘의 사건 기록 전부 처음으로.
// - 그대로: 도감 카드(내 카드·짝 카드 모두), 도감 젤리, 산 칭호·테마·꾸밈 캐릭터, 기본 캐릭터, 이미 받은 칭호.
// - 처음 깼을 때 주던 도감 젤리·경험치는 다시 깨도 또 주지 않아요(game_resets.journey_jelly_top, escape_paid).
import { DAILY_CHIPS } from './gamble';
import { PRICES } from './shop';

export const RESET_ITEM_ID = 'reset:games';
export const RESET_PRICE = PRICES.reset;

export async function buyGameReset(db: D1Database, userId: string, price = RESET_PRICE, now = new Date()): Promise<'done' | 'not_enough_jelly'> {
  const id = crypto.randomUUID();
  const t = now.toISOString();
  const won = 'EXISTS (SELECT 1 FROM purchases WHERE id = ?1)';
  const del = (table: string) => db.prepare(`DELETE FROM ${table} WHERE user_id = ?2 AND ${won}`).bind(id, userId);
  await db.batch([
    db
      .prepare(
        `INSERT INTO purchases (id, user_id, item_id, price, status, created_at, settled_at)
         SELECT ?1, ?2, ?3, ?4, 'done', ?5, ?5
         WHERE EXISTS (SELECT 1 FROM profiles WHERE user_id = ?2 AND dogam_jelly >= ?4)
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
      )
      .bind(id, userId, RESET_ITEM_ID, price, t),
    db.prepare(`UPDATE profiles SET dogam_jelly = dogam_jelly - ?3, updated_at = ?4 WHERE user_id = ?2 AND ${won}`).bind(id, userId, price, t),
    // 이미 받은 첫 클리어 보상을 적어 둬요(지우기 전에)
    db
      .prepare(
        `INSERT INTO game_resets (user_id, count, last_at, journey_jelly_top)
         SELECT ?2, 1, ?3, COALESCE((SELECT MAX(chapter) FROM journey_runs WHERE user_id = ?2 AND status = 'done' AND cleared = 1), 0) WHERE ${won}
         ON CONFLICT (user_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at,
           journey_jelly_top = MAX(journey_jelly_top, excluded.journey_jelly_top)`,
      )
      .bind(id, userId, t),
    db.prepare(`INSERT OR IGNORE INTO escape_paid (user_id, case_id) SELECT user_id, case_id FROM escape_rewards WHERE user_id = ?2 AND ${won}`).bind(id, userId),
    // 사건파일
    del('escape_runs'),
    del('escape_rewards'),
    del('escape_re'),
    del('escape_daily'),
    del('escape_daily_stats'),
    // 원정대(장비·재료·훈련·젤코인·펫·탑은 journey_bank 한 줄에 있어요)
    del('journey_runs'),
    del('journey_bank'),
    // 겜블장: 계정이 있으면 시작 칩으로. 끝나지 않은 카드 판도 같이 지워요.
    del('gamble_rounds'),
    db
      .prepare(
        `UPDATE gamble_accounts SET chips = ?3, won = 0, best_win = 0, all_in_wins = 0, plays = 0, jackpots = 0, naturals = 0
         WHERE user_id = ?2 AND ${won}`,
      )
      .bind(id, userId, DAILY_CHIPS),
  ]);
  return (await db.prepare('SELECT 1 FROM purchases WHERE id = ?').bind(id).first()) ? 'done' : 'not_enough_jelly';
}

// 원정대 장 젤리를 이미 받은 장(초기화 전 기록)
export async function journeyJellyTop(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare('SELECT journey_jelly_top AS n FROM game_resets WHERE user_id = ?').bind(userId).first<{ n: number }>();
  return r?.n ?? 0;
}
