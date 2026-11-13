import { dogamProgress, escapeNeed, meets } from './unlock';
import { ESC_XP, escapeUnlockIndex, actEscape, decodeEscape, escCase, escGrade, escJelly, startEscape, type EscAction, type EscCase, type EscGrade, type EscState } from './escape';

export type EscRow = { id: string; user_id: string; case_id: string; state: string; rev: number; status: string; grade: string | null; xp: number; jelly: number };
export type EscRun = { row: EscRow; def: EscCase; state: EscState };

function decode(row: EscRow | null): EscRun | null {
  const def = row && escCase(row.case_id);
  const state = def && decodeEscape(def, row.state);
  return row && def && state ? { row, def, state } : null;
}

export async function activeEscape(db: D1Database, user: string): Promise<EscRun | null> {
  return decode(await db.prepare("SELECT * FROM escape_runs WHERE user_id = ? AND status = 'going'").bind(user).first<EscRow>());
}
export async function getEscape(db: D1Database, user: string, id: string): Promise<EscRun | null> {
  return decode(await db.prepare('SELECT * FROM escape_runs WHERE user_id = ? AND id = ?').bind(user, id).first<EscRow>());
}

// 사건마다 가장 좋은 등급(해결한 판만)
export async function escapeRecord(db: D1Database, user: string): Promise<Map<string, EscGrade>> {
  const { results } = await db
    .prepare("SELECT case_id, MIN(CASE grade WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END) AS g FROM escape_runs WHERE user_id = ? AND status = 'done' GROUP BY case_id")
    .bind(user)
    .all<{ case_id: string; g: number }>();
  return new Map(results.map((r) => [r.case_id, (['S', 'A', 'B', 'C'] as const)[r.g] ?? 'C']));
}

// 새 사건 시작. 하던 사건이 있으면 그 사건으로 이어가요. 지금 있는 멤버만 시작할 수 있어요.
// 사건 목록 순서대로 처음 5개는 그냥, 그 뒤로는 도감 조건을 채워야 열려요(src/unlock.ts).
export async function escapeOpen(db: D1Database, user: string, caseId: string): Promise<boolean> {
  const i = escapeUnlockIndex(caseId);
  if (i < 0) return false;
  const need = escapeNeed(i);
  return need.cards === 0 || meets(need, await dogamProgress(db, user));
}

export async function beginEscape(db: D1Database, user: string, caseId: string, now = new Date()): Promise<string | null> {
  const def = escCase(caseId);
  if (!def) return null;
  if (!(await escapeOpen(db, user, caseId))) return null;
  const going = await activeEscape(db, user);
  if (going) return going.row.id;
  const id = crypto.randomUUID();
  const t = now.toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO escape_runs (id, user_id, case_id, state, started_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
    )
    .bind(id, user, caseId, JSON.stringify(startEscape(def)), t)
    .run();
  return (await activeEscape(db, user))?.row.id ?? null;
}

export async function quitEscape(db: D1Database, user: string, id: string): Promise<boolean> {
  const t = new Date().toISOString();
  const r = await db.prepare("UPDATE escape_runs SET status = 'quit', updated_at = ?3, ended_at = ?3 WHERE id = ?1 AND user_id = ?2 AND status = 'going'").bind(id, user, t).run();
  return (r.meta.changes ?? 0) > 0;
}

// 행동 하나. rev = 화면에 보이던 판의 순번(옛 화면·두 번 누르기 막기).
// 해결하면 사건마다 처음 한 번만 경험치·젤리를 주고, 판 저장과 보상은 한 번에(전부 되거나 전부 안 되게) 반영해요.
export async function actEscapeRun(db: D1Database, user: string, id: string, rev: number, act: EscAction, now = new Date()): Promise<'ok' | 'stale' | 'bad'> {
  const run = await getEscape(db, user, id);
  if (!run || run.row.status !== 'going' || run.row.rev !== rev) return 'stale';
  const s = actEscape(run.def, run.state, act);
  if (!s) return 'bad';
  const t = now.toISOString();
  const token = crypto.randomUUID();
  const g = s.done ? escGrade(s) : null;
  const first = 'NOT EXISTS (SELECT 1 FROM escape_rewards WHERE user_id = ?2 AND case_id = ?9)';
  const stmts = [
    db
      .prepare(
        `UPDATE escape_runs SET state = ?4, rev = rev + 1, mutation = ?3, updated_at = ?5,
           status = CASE WHEN ?6 THEN 'done' ELSE 'going' END, grade = ?7, ended_at = CASE WHEN ?6 THEN ?5 ELSE NULL END,
           xp = CASE WHEN ?6 AND ${first} THEN ?8 ELSE 0 END,
           jelly = CASE WHEN ?6 AND ${first} THEN ?10 ELSE 0 END
         WHERE id = ?1 AND user_id = ?2 AND rev = ?11 AND status = 'going'
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
      )
      .bind(id, user, token, JSON.stringify(s), t, s.done ? 1 : 0, g, ESC_XP, run.def.id, g ? escJelly(g) : 0, rev),
  ];
  if (s.done) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO escape_rewards (user_id, case_id, run_id, claimed_at)
           SELECT user_id, case_id, id, ?3 FROM escape_runs WHERE id = ?1 AND mutation = ?2 AND xp > 0
           ON CONFLICT (user_id, case_id) DO NOTHING`,
        )
        .bind(id, token, t),
      db
        .prepare(
          `INSERT INTO profiles (user_id, solo_xp, dogam_jelly, updated_at)
           SELECT user_id, xp, jelly, ?3 FROM escape_runs WHERE id = ?1 AND mutation = ?2 AND xp > 0
           ON CONFLICT (user_id) DO UPDATE SET solo_xp = COALESCE(profiles.solo_xp, 0) + excluded.solo_xp,
             dogam_jelly = COALESCE(profiles.dogam_jelly, 0) + excluded.dogam_jelly, updated_at = excluded.updated_at`,
        )
        .bind(id, token, t),
    );
  }
  const r = await db.batch(stmts);
  return (r[0]?.meta.changes ?? 0) === 1 ? 'ok' : 'stale';
}
