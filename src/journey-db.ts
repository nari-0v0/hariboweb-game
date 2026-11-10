import { kstDay } from './db';
import { DAILY_REWARD_JOURNEYS, actJourney, decodeJourney, journeyJelly, journeyXp, startJourney, type JourneyAction, type JourneyState } from './journey';

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

export type JourneyRecord = { best: number; clears: number; rewardedToday: number };
export async function journeyRecord(db: D1Database, user: string, day = kstDay()): Promise<JourneyRecord> {
  const r = await db
    .prepare(
      `SELECT COALESCE(MAX(day), 0) AS best, COALESCE(SUM(cleared), 0) AS clears,
         COALESCE(SUM(CASE WHEN reward_day = ?2 AND xp > 0 THEN 1 ELSE 0 END), 0) AS today
       FROM journey_runs WHERE user_id = ?1 AND status = 'done'`,
    )
    .bind(user, day)
    .first<{ best: number; clears: number; today: number }>();
  return { best: r?.best ?? 0, clears: r?.clears ?? 0, rewardedToday: r?.today ?? 0 };
}

// 새 원정. 하던 원정이 있으면 그걸 이어가요. 지금 있는 멤버만 떠날 수 있어요.
export async function beginJourney(db: D1Database, user: string, now = new Date()): Promise<string | null> {
  const going = await activeJourney(db, user);
  if (going) return going.row.id;
  const id = crypto.randomUUID();
  const t = now.toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO journey_runs (id, user_id, state, started_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?4 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
    )
    .bind(id, user, JSON.stringify(startJourney(id)), t)
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
      .bind(id, user, token, JSON.stringify(s), t, s.done ? 1 : 0, day, journeyXp(s.day, s.cleared), journeyJelly(s.cleared), s.day, s.cleared ? 1 : 0, rev),
  ];
  if (s.done) {
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
