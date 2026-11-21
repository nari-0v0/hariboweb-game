// 상점 「게임 기록 초기화권」(나리 2026-11-20, 20젤리): 겜블장·원정대·사건파일을 처음부터 다시 해요.
// - 겜블장: 젤칩은 시작 칩(1000)으로, 판 기록·통계는 0으로(옮겨 온 겜블 젤리도 사라져요). 아직 겜블장에 안 와서 시작 칩을 안 받은 사람도 이때 받은 것으로 쳐서, 시작 칩을 두 번 받지 않아요.
// - 원정대: 판 기록, 장비·재료·훈련·젤코인·펫·끝없는 탑 전부 처음으로.
// - 사건파일: 푼 기록·재수사·오늘의 사건 기록 전부 처음으로.
// - 그대로: 도감 카드(내 카드·짝 카드 모두), 도감 젤리, 산 칭호·테마·꾸밈 캐릭터, 기본 캐릭터, 이미 받은 칭호.
// - 처음 깼을 때 주던 도감 젤리·경험치는 다시 깨도 또 주지 않아요(game_resets.journey_jelly_top, escape_paid).
// - 원정대 하루 경험치 판 수와 하루 100판 떠난 수도 그날은 이어서 세요(game_resets.xp_day, xp_used, runs_used). 장비를 읽은 뒤 초기화되면 그 판은 떠나지 않아요(count = 세대).
import { DAILY_CHIPS } from './gamble';
import { gambleDay } from './gamble-db';
import { kstDay } from './db';
import { dayStartMs } from './day';
import { PRICES } from './shop';

export const RESET_ITEM_ID = 'reset:games';
export const RESET_PRICE = PRICES.reset;

// gen = 확인 화면을 열 때의 초기화 횟수. 같은 확인 화면을 두 번 내도(두 탭, 다시 보내기) 한 번만 사요.
export async function buyGameReset(db: D1Database, userId: string, price = RESET_PRICE, now = new Date(), gen?: number): Promise<'done' | 'not_enough_jelly' | 'changed'> {
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
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)
           AND (?6 IS NULL OR COALESCE((SELECT count FROM game_resets WHERE user_id = ?2), 0) = ?6)`,
      )
      .bind(id, userId, RESET_ITEM_ID, price, t, gen ?? null),
    db.prepare(`UPDATE profiles SET dogam_jelly = dogam_jelly - ?3, updated_at = ?4 WHERE user_id = ?2 AND ${won}`).bind(id, userId, price, t),
    // 이미 받은 첫 클리어 보상을 적어 둬요(지우기 전에)
    db
      .prepare(
        `INSERT INTO game_resets (user_id, count, last_at, journey_jelly_top, xp_day, xp_used, runs_used)
         SELECT ?2, 1, ?3, COALESCE((SELECT MAX(chapter) FROM journey_runs WHERE user_id = ?2 AND status = 'done' AND cleared = 1), 0),
           ?4, (SELECT COUNT(*) FROM journey_runs WHERE user_id = ?2 AND reward_day = ?4 AND xp > 0),
           (SELECT COUNT(*) FROM journey_runs WHERE user_id = ?2 AND started_at >= ?5) WHERE ${won}
         ON CONFLICT (user_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at,
           journey_jelly_top = MAX(journey_jelly_top, excluded.journey_jelly_top),
           xp_used = CASE WHEN game_resets.xp_day = excluded.xp_day THEN game_resets.xp_used + excluded.xp_used ELSE excluded.xp_used END,
           runs_used = CASE WHEN game_resets.xp_day = excluded.xp_day THEN game_resets.runs_used + excluded.runs_used ELSE excluded.runs_used END,
           xp_day = excluded.xp_day`,
      )
      .bind(id, userId, t, kstDay(now), new Date(dayStartMs(kstDay(now))).toISOString()),
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
        // 첫 방문 전(free_day가 비어 있음)에 초기화해도 첫 방문 시작 칩을 또 받지 않게 오늘 받은 걸로 적어요(밤샘 점검 #308).
        `UPDATE gamble_accounts SET chips = ?3, won = 0, best_win = 0, all_in_wins = 0, plays = 0, jackpots = 0, naturals = 0,
           free_day = COALESCE(free_day, ?4)
         WHERE user_id = ?2 AND ${won}`,
      )
      .bind(id, userId, DAILY_CHIPS, gambleDay(t)),
  ]);
  if (await db.prepare('SELECT 1 FROM purchases WHERE id = ?').bind(id).first()) return 'done';
  return gen !== undefined && (await resetCount(db, userId)) !== gen ? 'changed' : 'not_enough_jelly';
}

// 지금까지 게임 기록을 초기화한 횟수(확인 화면에 숨겨 두고 살 때 비교해요)
export async function resetCount(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare('SELECT count AS n FROM game_resets WHERE user_id = ?').bind(userId).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

// 원정대 장 젤리를 이미 받은 장(초기화 전 기록)
export async function journeyJellyTop(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare('SELECT journey_jelly_top AS n FROM game_resets WHERE user_id = ?').bind(userId).first<{ n: number }>();
  return r?.n ?? 0;
}
