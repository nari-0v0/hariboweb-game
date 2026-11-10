import { kstDay } from './db';
import { MAX_CHAPTER } from './journey-chapters';
import { DAILY_REWARD_JOURNEYS, NO_PERKS, PERKS, perkMax, actJourney, decodeJourney, journeyJelly, journeyXp, perkCost, startJourney, type JourneyAction, type JourneyState, type PerkId, type Perks } from './journey';

export type JourneyRow = { id: string; user_id: string; state: string; rev: number; status: string; day: number; cleared: number; xp: number; jelly: number; reward_day: string | null };
export type JourneyRun = { row: JourneyRow; state: JourneyState };

function decode(row: JourneyRow | null): JourneyRun | null {
  const state = row && decodeJourney(row.state);
  return row && state ? { row, state } : null;
}

export async function activeJourney(db: D1Database, user: string): Promise<JourneyRun | null> {
  return decode(await db.prepare("SELECT * FROM journey_runs WHERE user_id = ? AND status = 'going'").bind(user).first<JourneyRow>());
}
export async function getJourney(db: D1Database, user: string, id: string): Promise<JourneyRun | null> {
  return decode(await db.prepare('SELECT * FROM journey_runs WHERE user_id = ? AND id = ?').bind(user, id).first<JourneyRow>());
}

export type JourneyRecord = { best: number; clears: number; rewardedToday: number; unlocked: number }; // unlocked = 갈 수 있는 가장 높은 장
export async function journeyRecord(db: D1Database, user: string, day = kstDay()): Promise<JourneyRecord> {
  const r = await db
    .prepare(
      `SELECT COALESCE(MAX((chapter - 1) * 20 + day), 0) AS best, COALESCE(SUM(cleared), 0) AS clears,
         COALESCE(MAX(CASE WHEN cleared = 1 THEN chapter ELSE 0 END), 0) AS top,
         COALESCE(SUM(CASE WHEN reward_day = ?2 AND xp > 0 THEN 1 ELSE 0 END), 0) AS today
       FROM journey_runs WHERE user_id = ?1 AND status = 'done'`,
    )
    .bind(user, day)
    .first<{ best: number; clears: number; today: number; top: number }>();
  return { best: r?.best ?? 0, clears: r?.clears ?? 0, rewardedToday: r?.today ?? 0, unlocked: Math.min(MAX_CHAPTER, (r?.top ?? 0) + 1) };
}

// 강화 주머니(모은 동전 + 강화 단계)
export type JourneyBank = Perks & { coins: number };
export async function journeyBank(db: D1Database, user: string): Promise<JourneyBank> {
  const r = await db.prepare('SELECT coins, atk, hp, def FROM journey_bank WHERE user_id = ?').bind(user).first<JourneyBank>();
  return r ?? { coins: 0, ...NO_PERKS };
}

// 강화 한 단계. 동전이 모자라거나 끝까지 올렸거나 다른 화면에서 먼저 샀으면 false.
export async function buyPerk(db: D1Database, user: string, id: PerkId, now = new Date()): Promise<boolean> {
  const [bank, record] = await Promise.all([journeyBank(db, user), journeyRecord(db, user)]);
  const lv = bank[id];
  const cost = perkCost(lv);
  const max = perkMax(id, record.unlocked);
  if (lv >= max || bank.coins < cost) return false;
  const r = await db
    .prepare(`UPDATE journey_bank SET coins = coins - ?3, ${id} = ${id} + 1, updated_at = ?5 WHERE user_id = ?1 AND ${id} = ?2 AND coins >= ?3 AND ${id} < ?4`)
    .bind(user, lv, cost, max, now.toISOString())
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// 새 원정. 하던 원정이 있으면 그걸 이어가요. 지금 있는 멤버만 떠날 수 있어요.
export async function beginJourney(db: D1Database, user: string, chapter = 1, now = new Date()): Promise<string | null> {
  const going = await activeJourney(db, user);
  if (going) return going.row.id;
  const ch = Math.min(chapter, (await journeyRecord(db, user)).unlocked);
  if (!Number.isSafeInteger(ch) || ch < 1) return null;
  const id = crypto.randomUUID();
  const t = now.toISOString();
  const bank = await journeyBank(db, user);
  await db
    .prepare(
      `INSERT OR IGNORE INTO journey_runs (id, user_id, state, started_at, updated_at, chapter)
       SELECT ?1, ?2, ?3, ?4, ?4, ?5 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
    )
    .bind(id, user, JSON.stringify(startJourney(id, bank, ch)), t, ch)
    .run();
  return (await activeJourney(db, user))?.row.id ?? null;
}

export async function quitJourney(db: D1Database, user: string, id: string): Promise<boolean> {
  const t = new Date().toISOString();
  const r = await db.prepare("UPDATE journey_runs SET status = 'quit', updated_at = ?3, ended_at = ?3 WHERE id = ?1 AND user_id = ?2 AND status = 'going'").bind(id, user, t).run();
  return (r.meta.changes ?? 0) > 0;
}

// 행동 하나. rev = 화면에 보이던 판의 순번(옛 화면·두 번 누르기 막기).
// 원정이 끝나면 한국 날짜로 하루 첫 몇 판만 경험치·젤리를 주고, 판 저장과 보상은 한 번에 반영해요.
export async function actJourneyRun(db: D1Database, user: string, id: string, rev: number, act: JourneyAction, now = new Date()): Promise<'ok' | 'stale' | 'bad'> {
  const run = await getJourney(db, user, id);
  if (!run || run.row.status !== 'going' || run.row.rev !== rev) return 'stale';
  const s = actJourney(run.state, act);
  if (!s) return 'bad';
  const t = now.toISOString();
  const token = crypto.randomUUID();
  const day = kstDay(now);
  const room = `(SELECT COUNT(*) FROM journey_runs WHERE user_id = ?2 AND reward_day = ?7 AND xp > 0) < ${DAILY_REWARD_JOURNEYS}`;
  const stmts = [
    db
      .prepare(
        `UPDATE journey_runs SET state = ?4, rev = rev + 1, mutation = ?3, updated_at = ?5, day = ?10, cleared = ?11,
           status = CASE WHEN ?6 THEN 'done' ELSE 'going' END, ended_at = CASE WHEN ?6 THEN ?5 ELSE NULL END,
           reward_day = CASE WHEN ?6 THEN ?7 ELSE NULL END,
           xp = CASE WHEN ?6 AND ${room} THEN ?8 ELSE 0 END,
           jelly = CASE WHEN ?6 AND ${room} THEN ?9 ELSE 0 END
         WHERE id = ?1 AND user_id = ?2 AND rev = ?12 AND status = 'going'
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
      )
      .bind(id, user, token, JSON.stringify(s), t, s.done ? 1 : 0, day, journeyXp(s.day, s.cleared, s.ch ?? 1), journeyJelly(s.cleared), s.day, s.cleared ? 1 : 0, rev),
  ];
  if (s.done) {
    // 남은 동전은 보상 횟수와 상관없이 강화 주머니로 (이번 저장이 성공했을 때만)
    stmts.push(
      db
        .prepare(
          `INSERT INTO journey_bank (user_id, coins, updated_at)
           SELECT user_id, ?3, ?4 FROM journey_runs WHERE id = ?1 AND mutation = ?2 AND status = 'done'
           ON CONFLICT (user_id) DO UPDATE SET coins = journey_bank.coins + excluded.coins, updated_at = excluded.updated_at`,
        )
        .bind(id, token, s.coins, t),
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO profiles (user_id, solo_xp, dogam_jelly, updated_at)
           SELECT user_id, xp, jelly, ?3 FROM journey_runs WHERE id = ?1 AND mutation = ?2 AND xp > 0
           ON CONFLICT (user_id) DO UPDATE SET solo_xp = COALESCE(profiles.solo_xp, 0) + excluded.solo_xp,
             dogam_jelly = COALESCE(profiles.dogam_jelly, 0) + excluded.dogam_jelly, updated_at = excluded.updated_at`,
        )
        .bind(id, token, t),
    );
  }
  const r = await db.batch(stmts);
  return (r[0]?.meta.changes ?? 0) === 1 ? 'ok' : 'stale';
}
