import { dayStartMs } from './day';
import { dogamProgress, escapeNeed, meets } from './unlock';
import { DAILY_OPEN, dailyPick, dailyVariant, kstDay, prevDay, shownStreak } from './escape-daily';
import { BOOSTER_DAILY_COINS, ESC_XP, escVariantOf, escapeUnlockIndex, actEscape, decodeEscape, escCase, escGrade, escJelly, startEscape, type EscAction, type EscCase, type EscGrade, type EscState } from './escape';

export type EscRow = { id: string; user_id: string; case_id: string; state: string; rev: number; status: string; grade: string | null; xp: number; jelly: number; started_at?: string; ended_at?: string | null };
export type EscRun = { row: EscRow; def: EscCase; state: EscState };

function decode(row: EscRow | null): EscRun | null {
  const def = row && escCase(row.case_id, escVariantOf(row.state));
  const state = def && decodeEscape(def, row.state);
  return row && def && state ? { row, def, state } : null;
}

export async function activeEscape(db: D1Database, user: string): Promise<EscRun | null> {
  return decode(await db.prepare("SELECT * FROM escape_runs WHERE user_id = ? AND status = 'going'").bind(user).first<EscRow>());
}
// 진행 중인 사건 판이 깨졌거나(옛 형식) 없어진 사건이면 그 판만 그만둔 걸로 해요. 안 그러면 새 사건을
// 시작할 수 없고 화면에도 안 보여요(점검 W197). 읽을 수 있는 판은 건드리지 않아요.
async function dropBrokenEscape(db: D1Database, user: string, t: string): Promise<void> {
  const row = await db.prepare("SELECT * FROM escape_runs WHERE user_id = ? AND status = 'going'").bind(user).first<EscRow>();
  if (!row || decode(row)) return;
  await db
    .prepare("UPDATE escape_runs SET status = 'quit', updated_at = ?3, ended_at = ?3 WHERE id = ?1 AND user_id = ?2 AND status = 'going' AND rev = ?4")
    .bind(row.id, user, t, row.rev)
    .run();
}
export async function getEscape(db: D1Database, user: string, id: string): Promise<EscRun | null> {
  return decode(await db.prepare('SELECT * FROM escape_runs WHERE user_id = ? AND id = ?').bind(user, id).first<EscRow>());
}

// 사건마다 가장 좋은 등급(해결한 판만)
export async function escapeRecord(db: D1Database, user: string): Promise<Map<string, EscGrade>> {
  const { results } = await db
    .prepare("SELECT case_id, MIN(CASE grade WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END) AS g FROM escape_runs WHERE user_id = ? AND status = 'done' AND grade IS NOT NULL GROUP BY case_id")
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

// 재수사 기록(사건마다): 재수사로 해결한 횟수, 가장 빠른 시간(초), 무결점 도장
export type ReRecord = { clears: number; best: number | null; flawless: boolean };
export async function reRecord(db: D1Database, user: string): Promise<Map<string, ReRecord>> {
  const { results } = await db.prepare('SELECT case_id, clears, best_secs, flawless FROM escape_re WHERE user_id = ?').bind(user).all<{ case_id: string; clears: number; best_secs: number | null; flawless: number }>();
  return new Map(results.map((r) => [r.case_id, { clears: r.clears, best: r.best_secs, flawless: r.flawless > 0 }]));
}
// 재수사는 그 사건을 한 번이라도 해결한 사람만 해요
async function solvedOnce(db: D1Database, user: string, caseId: string): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 FROM escape_rewards WHERE user_id = ? AND case_id = ? LIMIT 1').bind(user, caseId).first());
}

export async function beginEscape(
  db: D1Database, user: string, caseId: string, now = new Date(), replace?: { id: string; rev: number }, re = false,
): Promise<string | null> {
  if (!escCase(caseId)) return null;
  if (!(await escapeOpen(db, user, caseId))) return null;
  if (re && !(await solvedOnce(db, user, caseId))) return null;
  // 판 번호(전에 이 사건을 시작한 횟수)는 넣는 순간에도 같을 때만 넣어요. 두 탭에서 동시에 시작해
  // 횟수가 바뀌었으면 다시 세서 해요(같은 판이 두 번 나오지 않게).
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await beginOnce(db, user, caseId, now, replace, re);
    if (out !== 'retry') return out;
  }
  return null;
}

// 서버 부스터(나리 2026-11-21): 보통 판은 등급 기준이 1번 넉넉하고(bst), 그날(한국 날짜) 처음 시작한 사건은
// 힌트 동전 1개를 들고 시작해요. 재수사·오늘의 사건은 등급이 없어서 그대로예요.
async function withBooster(db: D1Database, user: string, s: EscState, now: Date): Promise<EscState> {
  if (s.re) return s;
  const dayStart = new Date(dayStartMs(kstDay(now))).toISOString();
  const row = await db
    .prepare(
      // 보통 판만 세요. 재수사·오늘의 사건(state.re)을 먼저 해도 첫 보통 사건의 동전은 받아요(2026-11-21 점검).
      `SELECT booster, EXISTS (SELECT 1 FROM escape_runs WHERE user_id = ?1 AND started_at >= ?2
         AND json_extract(state, '$.re') IS NULL) AS played
       FROM members WHERE user_id = ?1 AND active = 1`,
    )
    .bind(user, dayStart)
    .first<{ booster: number; played: number }>();
  if (Number(row?.booster) !== 1) return s;
  if (Number(row?.played)) return { ...s, bst: 1 };
  return { ...s, bst: 1, gift: BOOSTER_DAILY_COINS, msg: `💎 부스터 선물: 오늘 첫 사건이라 힌트 동전 ${BOOSTER_DAILY_COINS}개를 들고 시작해요. ${s.msg}` };
}

const TRIED = 'SELECT COUNT(*) FROM escape_runs WHERE user_id = ?2 AND case_id = ?7';
async function beginOnce(
  db: D1Database, user: string, caseId: string, now: Date, replace?: { id: string; rev: number }, re = false,
): Promise<string | null | 'retry'> {
  const going = await activeEscape(db, user);
  if (going && !replace) return going.row.id;
  if (!going && !replace) await dropBrokenEscape(db, user, now.toISOString());
  if (replace && (!going || going.row.id !== replace.id || going.row.rev !== replace.rev)) return null;
  // 같은 사건이라도 일반 판 ↔ 재수사 판(또는 오늘의 사건 판)을 바꿔 고르면 새 판으로 덮어요
  if (going?.row.case_id === caseId && !!going.state.re === re && !going.state.daily) return going.row.id;
  // 이 사건을 전에 시작한 적이 있으면(해결했든 그만뒀든) 범인·단서·자리를 새로 섞은 판으로 해요(수수께끼는 같아요).
  const tried = (await db.prepare('SELECT COUNT(*) AS n FROM escape_runs WHERE user_id = ? AND case_id = ?').bind(user, caseId).first<{ n: number }>())?.n ?? 0;
  const def = escCase(caseId, tried)!;
  const id = crypto.randomUUID();
  const t = now.toISOString();
  const state = JSON.stringify(await withBooster(db, user, startEscape(def, re), now));
  if (replace) {
    const [quit] = await db.batch([
      db.prepare(`UPDATE escape_runs SET status = 'quit', updated_at = ?3, ended_at = ?3, mutation = ?5
        WHERE user_id = ?1 AND id = ?2 AND rev = ?4 AND status = 'going'
          AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
          AND (SELECT COUNT(*) FROM escape_runs WHERE user_id = ?1 AND case_id = ?7) = ?6`)
        .bind(user, replace.id, t, replace.rev, id, tried, caseId),
      db.prepare(`INSERT INTO escape_runs (id, user_id, case_id, state, started_at, updated_at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?5 FROM escape_runs WHERE id = ?6 AND mutation = ?1 AND status = 'quit'`)
        .bind(id, user, caseId, state, t, replace.id),
    ]);
    if (quit?.meta.changes === 1) return id;
    // 판 번호가 바뀌었으면(그 사이 다른 탭에서 같은 사건을 시작함) 다시 세요. 아니면 옛 화면이에요.
    const now2 = (await db.prepare('SELECT COUNT(*) AS n FROM escape_runs WHERE user_id = ? AND case_id = ?').bind(user, caseId).first<{ n: number }>())?.n ?? 0;
    return now2 !== tried ? 'retry' : null;
  }
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO escape_runs (id, user_id, case_id, state, started_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)
         AND (${TRIED}) = ?6`,
    )
    .bind(id, user, caseId, state, t, tried, caseId)
    .run();
  if ((r.meta.changes ?? 0) === 1) return id;
  const active = await activeEscape(db, user);
  if (active) return active.row.id;
  return 'retry';
}

// rev를 주면 화면에 보이던 판 순번과 같을 때만 그만둬요(다른 탭에서 진행한 판을 옛 버튼으로 잃지 않게).
export async function quitEscape(db: D1Database, user: string, id: string, rev?: number): Promise<boolean> {
  const t = new Date().toISOString();
  const r = await db
    .prepare("UPDATE escape_runs SET status = 'quit', updated_at = ?3, ended_at = ?3 WHERE id = ?1 AND user_id = ?2 AND status = 'going' AND (?4 IS NULL OR rev = ?4)")
    .bind(id, user, t, rev ?? null)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// 아직 보상을 받지 않은 사건에서 그만둔 보통 판들의 실수·힌트 합(재수사·오늘의 사건 판은 빼요)
async function quitPenalty(db: D1Database, user: string, caseId: string): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT state FROM escape_runs WHERE user_id = ?1 AND case_id = ?2 AND status = 'quit'
         AND NOT EXISTS (SELECT 1 FROM escape_rewards WHERE user_id = ?1 AND case_id = ?2)
         AND NOT EXISTS (SELECT 1 FROM escape_paid WHERE user_id = ?1 AND case_id = ?2)`,
    )
    .bind(user, caseId)
    .all<{ state: string }>();
  let n = 0;
  for (const r of results) {
    try {
      const s = JSON.parse(r.state) as Partial<EscState>;
      if (s.re || s.daily) continue;
      n += (Number.isSafeInteger(s.mistakes) ? s.mistakes! : 0) + (Number.isSafeInteger(s.hints) ? s.hints! : 0);
    } catch {
      // 읽을 수 없는 판은 세지 않아요
    }
  }
  return n;
}

// 행동 하나. rev = 화면에 보이던 판의 순번(옛 화면·두 번 누르기 막기).
// 해결하면 사건마다 처음 한 번만 경험치·젤리를 주고, 판 저장과 보상은 한 번에(전부 되거나 전부 안 되게) 반영해요.
export async function actEscapeRun(db: D1Database, user: string, id: string, rev: number, act: EscAction, now = new Date(), burn = false): Promise<'ok' | 'stale' | 'bad'> {
  const run = await getEscape(db, user, id);
  if (!run || run.row.status !== 'going' || run.row.rev !== rev) return 'stale';
  const s = actEscape(run.def, run.state, act, burn);
  if (!s) return 'bad';
  const t = now.toISOString();
  const token = crypto.randomUUID();
  if (s.re && s.done) return finishRe(db, user, id, rev, run.def.id, s, t, token);
  // 처음 푸는 사건이면, 그전에 그만둔 판의 실수·힌트도 등급에 더해요(그만두고 다시 시작해 실수를 지우지 않게).
  if (s.done && !s.daily) {
    const carried = await quitPenalty(db, user, run.def.id);
    if (carried > 0) s.carried = carried;
  }
  const g = s.done ? escGrade(s) : null;
  // 아직 진행 중인 판은 진행 내용만 저장해요(색인 칸을 건드리지 않아 DB 쓰기가 3줄 → 1줄).
  if (!s.done) {
    const r = await db
      .prepare(
        `UPDATE escape_runs SET state = ?4, rev = rev + 1, mutation = ?3, updated_at = ?5
         WHERE id = ?1 AND user_id = ?2 AND rev = ?6 AND status = 'going'
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
      )
      .bind(id, user, token, JSON.stringify(s), t, rev)
      .run();
    return (r.meta.changes ?? 0) === 1 ? 'ok' : 'stale';
  }
  // 첫 해결 보상은 한 번만: 게임 기록 초기화권으로 푼 기록을 지웠어도 이미 받은 보상(escape_paid)은 다시 주지 않아요
  const first = 'NOT EXISTS (SELECT 1 FROM escape_rewards WHERE user_id = ?2 AND case_id = ?9) AND NOT EXISTS (SELECT 1 FROM escape_paid WHERE user_id = ?2 AND case_id = ?9)';
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
          // 푼 기록은 보상이 없어도(초기화 뒤 다시 푼 사건) 남겨요. 보통 판만 여기로 와요(재수사는 finishRe).
          `INSERT INTO escape_rewards (user_id, case_id, run_id, claimed_at)
           SELECT user_id, case_id, id, ?3 FROM escape_runs WHERE id = ?1 AND mutation = ?2 AND status = 'done'
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

// 재수사 판 끝: 보상(경험치·젤리)은 없고 등급도 매기지 않아요(보통 판 기록과 섞이지 않게).
// 해결하면 사건마다 한 줄에 횟수·가장 빠른 시간·무결점 도장을 모아요. 실패하면 그만둔 판으로 남아요.
async function finishRe(db: D1Database, user: string, id: string, rev: number, caseId: string, s: EscState, t: string, token: string): Promise<'ok' | 'stale'> {
  const won = !s.failed;
  const stmts = [
    db
      .prepare(
        `UPDATE escape_runs SET state = ?4, rev = rev + 1, mutation = ?3, updated_at = ?5, ended_at = ?5,
           status = CASE WHEN ?6 THEN 'done' ELSE 'quit' END, grade = NULL, xp = 0, jelly = 0
         WHERE id = ?1 AND user_id = ?2 AND rev = ?7 AND status = 'going'
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
      )
      .bind(id, user, token, JSON.stringify(s), t, won ? 1 : 0, rev),
  ];
  if (won && s.daily) {
    // 오늘의 사건은 재수사 기록과 따로, 그날 줄에 시간과 무결점만 적어요
    stmts.push(
      db
        .prepare(
          `UPDATE escape_daily SET solved = 1, flawless = ?4,
             secs = (SELECT MAX(0, CAST(ROUND((julianday(ended_at) - julianday(started_at)) * 86400) AS INTEGER)) FROM escape_runs WHERE id = ?3 AND mutation = ?5 AND status = 'done')
           WHERE user_id = ?1 AND day = ?2 AND run_id = ?3 AND EXISTS (SELECT 1 FROM escape_runs WHERE id = ?3 AND mutation = ?5 AND status = 'done')`,
        )
        .bind(user, s.daily, id, s.mistakes === 0 ? 1 : 0, token),
      // 해결한 날 수 +1, 어제도 해결했으면 연속 +1(아니면 1부터). 같은 날 두 번 세지 않게 last_day를 봐요.
      db
        .prepare(
          `INSERT INTO escape_daily_stats (user_id, days, streak, last_day)
           SELECT ?1, 1, 1, ?2 WHERE EXISTS (SELECT 1 FROM escape_daily WHERE user_id = ?1 AND day = ?2 AND run_id = ?3 AND solved = 1)
           ON CONFLICT (user_id) DO UPDATE SET days = escape_daily_stats.days + 1,
             streak = CASE WHEN escape_daily_stats.last_day = ?4 THEN escape_daily_stats.streak + 1 ELSE 1 END, last_day = ?2
           WHERE escape_daily_stats.last_day IS NULL OR escape_daily_stats.last_day < ?2`,
        )
        .bind(user, s.daily, id, prevDay(s.daily)),
    );
  } else if (won) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO escape_re (user_id, case_id, clears, best_secs, flawless, updated_at)
           SELECT user_id, ?3, 1, MAX(0, CAST(ROUND((julianday(ended_at) - julianday(started_at)) * 86400) AS INTEGER)), ?4, ended_at
           FROM escape_runs WHERE id = ?1 AND mutation = ?2 AND status = 'done'
           ON CONFLICT (user_id, case_id) DO UPDATE SET clears = escape_re.clears + 1,
             best_secs = MIN(COALESCE(escape_re.best_secs, excluded.best_secs), excluded.best_secs),
             flawless = MAX(escape_re.flawless, excluded.flawless), updated_at = excluded.updated_at`,
        )
        .bind(id, token, caseId, s.mistakes === 0 ? 1 : 0),
    );
  }
  const r = await db.batch(stmts);
  return (r[0]?.meta.changes ?? 0) === 1 ? 'ok' : 'stale';
}

// 오늘의 사건 상태(사건 목록 맨 위에 보여 줘요)
export type DailyRow = { case_id: string; run_id: string; solved: number; secs: number | null; flawless: number };
export type DailyInfo = { day: string; caseId: string | null; today: DailyRow | null; days: number; streak: number };
// 오늘 풀 사건: 해결했고 지금도 열 수 있는 이야기 사건 중에서 골라요(도감 조건이 모자라진 사건은 빼요)
async function dailyCase(db: D1Database, user: string, day: string): Promise<string | null> {
  const [solved, dogam] = await Promise.all([db.prepare('SELECT case_id FROM escape_rewards WHERE user_id = ?').bind(user).all<{ case_id: string }>(), dogamProgress(db, user)]);
  const open = solved.results.map((r) => r.case_id).filter((id) => {
    const i = escapeUnlockIndex(id);
    if (i < 0) return false;
    const need = escapeNeed(i);
    return need.cards === 0 || meets(need, dogam);
  });
  return dailyPick(user, day, open);
}
export async function dailyInfo(db: D1Database, user: string, now = new Date()): Promise<DailyInfo | null> {
  if (!DAILY_OPEN) return null;
  const day = kstDay(now);
  const [today, stats] = await Promise.all([
    db.prepare('SELECT case_id, run_id, solved, secs, flawless FROM escape_daily WHERE user_id = ? AND day = ?').bind(user, day).first<DailyRow>(),
    db.prepare('SELECT days, streak, last_day FROM escape_daily_stats WHERE user_id = ?').bind(user).first<{ days: number; streak: number; last_day: string | null }>(),
  ]);
  return { day, caseId: today?.case_id ?? (await dailyCase(db, user, day)), today: today ?? null, days: stats?.days ?? 0, streak: shownStreak(stats?.streak ?? 0, stats?.last_day ?? null, day) };
}

// 오늘의 사건 시작. 오늘 이미 시작했으면 그 판이 진행 중일 때만 이어 해요('played' = 오늘 기회를 이미 씀).
// seen = 화면에 보이던 날짜·사건. 날이 바뀌었거나 사건이 달라졌으면 시작하지 않고 'stale'(옛 화면이 새 날 기회를 쓰지 않게).
// 하던 다른 사건이 있으면 replace(화면에 보이던 판·순번)가 맞을 때만 덮어요.
export async function beginDaily(
  db: D1Database, user: string, now = new Date(), replace?: { id: string; rev: number }, seen?: { day: string; caseId: string },
): Promise<string | 'played' | 'stale' | null> {
  if (!DAILY_OPEN) return null;
  const day = kstDay(now);
  if (seen && seen.day !== day) return 'stale';
  const mine = await db.prepare('SELECT run_id FROM escape_daily WHERE user_id = ? AND day = ?').bind(user, day).first<{ run_id: string }>();
  const going = await activeEscape(db, user);
  if (mine) return going?.row.id === mine.run_id ? mine.run_id : 'played';
  if (going && !replace) return null;
  if (replace && (!going || going.row.id !== replace.id || going.row.rev !== replace.rev)) return null;
  // 읽을 수 없는 진행 중 판이 남아 있으면 새 판을 막으니 먼저 정리해요(일반 사건 시작과 같게, 3차 점검)
  if (!going && !replace) await dropBrokenEscape(db, user, now.toISOString());
  const caseId = await dailyCase(db, user, day);
  if (seen && seen.caseId !== caseId) return 'stale';
  const def = caseId && escCase(caseId, dailyVariant(day));
  if (!caseId || !def) return null;
  const id = crypto.randomUUID();
  const t = now.toISOString();
  const state = JSON.stringify(startEscape(def, true, day));
  const fresh = `EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1) AND NOT EXISTS (SELECT 1 FROM escape_daily WHERE user_id = ?2 AND day = ?6)`;
  const stmts: D1PreparedStatement[] = [];
  if (replace) {
    stmts.push(
      db
        .prepare(`UPDATE escape_runs SET status = 'quit', updated_at = ?3, ended_at = ?3, mutation = ?5
          WHERE user_id = ?1 AND id = ?2 AND rev = ?4 AND status = 'going' AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
            AND NOT EXISTS (SELECT 1 FROM escape_daily WHERE user_id = ?1 AND day = ?6)`)
        .bind(user, replace.id, t, replace.rev, id, day),
    );
  }
  // 하루 한 판: 그날 줄이 없을 때만 판을 넣고, 넣은 판이 있을 때만 그날 줄을 넣어요(한 번에, 두 탭이 동시에 눌러도 하나만)
  stmts.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO escape_runs (id, user_id, case_id, state, started_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE ${fresh}
           AND (?7 IS NULL OR EXISTS (SELECT 1 FROM escape_runs WHERE id = ?7 AND mutation = ?1 AND status = 'quit'))`,
      )
      .bind(id, user, caseId, state, t, day, replace?.id ?? null),
    db
      .prepare(`INSERT OR IGNORE INTO escape_daily (user_id, day, case_id, run_id) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM escape_runs WHERE id = ?4 AND user_id = ?1)`)
      .bind(user, day, caseId, id),
  );
  await db.batch(stmts);
  const row = await db.prepare('SELECT run_id FROM escape_daily WHERE user_id = ? AND day = ?').bind(user, day).first<{ run_id: string }>();
  return row?.run_id === id ? id : null;
}
