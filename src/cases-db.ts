import { characterUrl } from './character';
import { kstDay } from './db';
import { rng } from './expedition';
import {
  CASE_XP,
  DAILY_REWARD_CASES,
  SUSPECTS,
  caseById,
  caseJelly,
  grade,
  makePuzzle,
  type Answer,
  type CaseDef,
  type Grade,
  type Puzzle,
  type Suspect,
} from './cases';

// 용의자가 모자라면 채우는 가상 인물(실제 멤버가 아니에요)
const NPCS = ['떠돌이 상인', '안개 우체부', '수상한 손님', '옆 동네 구경꾼'];

// 용의자: 내가 카드를 가진 지금 있는 멤버 중 무작위 4명. 모자라면 가상 인물로 채워요.
export async function pickSuspects(db: D1Database, userId: string, seed: string): Promise<Suspect[]> {
  const { results } = await db
    .prepare(
      `SELECT m.user_id, m.display_name, p.character_id, p.deco_id
       FROM cards c JOIN members m ON m.user_id = c.target_id
       LEFT JOIN profiles p ON p.user_id = m.user_id
       WHERE c.owner_id = ? AND m.active = 1 AND m.user_id != ?`,
    )
    .bind(userId, userId)
    .all<{ user_id: string; display_name: string; character_id: string | null; deco_id: string | null }>();
  const r = rng(`${seed}:suspects`);
  const pool = [...results].sort((a, b) => a.user_id.localeCompare(b.user_id));
  const out: Suspect[] = [];
  while (out.length < SUSPECTS && pool.length) {
    const m = pool.splice(Math.floor(r() * pool.length), 1)[0]!;
    out.push({ id: m.user_id, name: m.display_name, art: characterUrl(m.character_id, m.user_id, m.deco_id) });
  }
  let n = 0;
  while (out.length < SUSPECTS) {
    out.push({ id: null, name: NPCS[n]!, art: characterUrl(null, `npc-${seed}-${n}`) });
    n++;
  }
  return out;
}

export type CaseRow = {
  id: string;
  user_id: string;
  case_id: string;
  seed: string;
  suspects: string;
  looked: string;
  status: 'going' | 'done' | 'quit';
  answer: string | null;
  grade: Grade | null;
  xp: number;
  jelly: number;
  ended_at: string | null;
};

export type CaseRun = { row: CaseRow; def: CaseDef; suspects: Suspect[]; looked: number[]; puzzle: Puzzle; answer: Answer | null };

export function loadCase(row: CaseRow): CaseRun | null {
  const def = caseById(row.case_id);
  if (!def) return null;
  const suspects = JSON.parse(row.suspects) as Suspect[];
  return {
    row,
    def,
    suspects,
    looked: JSON.parse(row.looked) as number[],
    puzzle: makePuzzle(def, row.seed, suspects),
    answer: row.answer ? (JSON.parse(row.answer) as Answer) : null,
  };
}

export async function currentCase(db: D1Database, userId: string): Promise<CaseRun | null> {
  const row = await db
    .prepare(`SELECT * FROM case_runs WHERE user_id = ? AND status = 'going' ORDER BY started_at DESC LIMIT 1`)
    .bind(userId)
    .first<CaseRow>();
  return row ? loadCase(row) : null;
}

export async function getCase(db: D1Database, userId: string, id: string): Promise<CaseRun | null> {
  const row = await db.prepare('SELECT * FROM case_runs WHERE id = ? AND user_id = ?').bind(id, userId).first<CaseRow>();
  return row ? loadCase(row) : null;
}

export async function startCase(db: D1Database, userId: string, caseId: string): Promise<'started' | 'bad_case'> {
  if (!caseById(caseId)) return 'bad_case';
  const id = crypto.randomUUID();
  const seed = crypto.randomUUID();
  const suspects = await pickSuspects(db, userId, seed);
  const t = new Date().toISOString();
  // 하던 사건은 덮고 새로 시작해요(한 사람에 진행 중인 사건은 하나)
  await db.batch([
    db.prepare(`UPDATE case_runs SET status = 'quit', updated_at = ?2, ended_at = ?2 WHERE user_id = ?1 AND status = 'going'`).bind(userId, t),
    db
      .prepare(`INSERT INTO case_runs (id, user_id, case_id, seed, suspects, looked, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', 'going', ?, ?)`)
      .bind(id, userId, caseId, seed, JSON.stringify(suspects), t, t),
  ]);
  return 'started';
}

export async function quitCase(db: D1Database, userId: string, runId: string): Promise<boolean> {
  const t = new Date().toISOString();
  const r = await db
    .prepare(`UPDATE case_runs SET status = 'quit', updated_at = ?3, ended_at = ?3 WHERE id = ?2 AND user_id = ?1 AND status = 'going'`)
    .bind(userId, runId, t)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export type CaseResult = { result: 'ok' | 'done' | 'stale' | 'bad' | 'none'; runId?: string };

// 장소 한 곳 조사. runId·at = 화면에 보이던 사건과 조사 횟수(옛 화면·두 번 누르기 막기)
export async function lookAt(db: D1Database, userId: string, runId: string, at: number, spot: number): Promise<CaseResult> {
  const run = await currentCase(db, userId);
  if (!run) return { result: 'none' };
  if (run.row.id !== runId || run.looked.length !== at) return { result: 'stale', runId: run.row.id };
  if (!Number.isInteger(spot) || spot < 0 || spot >= run.def.places.length || run.looked.includes(spot)) return { result: 'bad', runId: run.row.id };
  const r = await db
    .prepare(`UPDATE case_runs SET looked = ?3, updated_at = ?4 WHERE id = ?1 AND status = 'going' AND looked = ?2`)
    .bind(run.row.id, run.row.looked, JSON.stringify([...run.looked, spot]), new Date().toISOString())
    .run();
  return { result: (r.meta.changes ?? 0) > 0 ? 'ok' : 'stale', runId: run.row.id };
}

// 범인 지목. 하루 첫 3건이면 보상을 주고, 이 요청이 끝낸 경우에만 반영해요(한 트랜잭션).
export async function accuse(db: D1Database, userId: string, runId: string, at: number, answer: Answer, now = new Date()): Promise<CaseResult> {
  const run = await currentCase(db, userId);
  if (!run) return { result: 'none' };
  if (run.row.id !== runId || run.looked.length !== at) return { result: 'stale', runId: run.row.id };
  const ok = (v: number, n: number) => Number.isInteger(v) && v >= 0 && v < n;
  if (!ok(answer.culprit, run.suspects.length) || !ok(answer.method, run.def.methods.length) || !ok(answer.motive, run.def.motives.length))
    return { result: 'bad', runId: run.row.id };
  if (!run.looked.length) return { result: 'bad', runId: run.row.id }; // 한 곳도 안 보고 찍기는 안 돼요
  const g = grade(run.puzzle, answer, run.looked.length);
  const t = now.toISOString();
  const day = kstDay(now);
  const mark = `${t}#${crypto.randomUUID()}`;
  await db.batch([
    db
      .prepare(
        `UPDATE case_runs SET status = 'done', answer = ?3, grade = ?4, day = ?5, updated_at = ?6, ended_at = ?7,
           xp = CASE WHEN (SELECT COUNT(*) FROM case_runs WHERE user_id = ?8 AND day = ?5 AND status = 'done') < ?9 THEN ?10 ELSE 0 END,
           jelly = CASE WHEN (SELECT COUNT(*) FROM case_runs WHERE user_id = ?8 AND day = ?5 AND status = 'done') < ?9 THEN ?11 ELSE 0 END
         WHERE id = ?1 AND status = 'going' AND looked = ?2`,
      )
      .bind(run.row.id, run.row.looked, JSON.stringify(answer), g, day, t, mark, userId, DAILY_REWARD_CASES, CASE_XP, caseJelly(g)),
    db
      .prepare(
        `INSERT INTO profiles (user_id, solo_xp, dogam_jelly, updated_at)
         SELECT ?3, xp, jelly, ?4 FROM case_runs WHERE id = ?1 AND ended_at = ?2
         ON CONFLICT (user_id) DO UPDATE SET solo_xp = solo_xp + excluded.solo_xp, dogam_jelly = dogam_jelly + excluded.dogam_jelly,
           updated_at = excluded.updated_at`,
      )
      .bind(run.row.id, mark, userId, t),
  ]);
  const done = await db.prepare('SELECT 1 FROM case_runs WHERE id = ? AND ended_at = ?').bind(run.row.id, mark).first();
  return { result: done ? 'done' : 'stale', runId: run.row.id };
}

export type CaseRecord = { best: Map<string, Grade>; solved: number; played: number; today: number };

const ORDER: Grade[] = ['S', 'A', 'B', 'C', 'F'];

export async function caseRecord(db: D1Database, userId: string, now = new Date()): Promise<CaseRecord> {
  const [grades, today] = await db.batch([
    db.prepare(`SELECT case_id, grade, COUNT(*) AS n FROM case_runs WHERE user_id = ? AND status = 'done' GROUP BY case_id, grade`).bind(userId),
    db.prepare(`SELECT COUNT(*) AS n FROM case_runs WHERE user_id = ? AND day = ? AND status = 'done'`).bind(userId, kstDay(now)),
  ]);
  const best = new Map<string, Grade>();
  let solved = 0;
  let played = 0;
  for (const r of grades!.results as { case_id: string; grade: Grade; n: number }[]) {
    played += Number(r.n);
    if (r.grade !== 'F') solved += Number(r.n);
    const cur = best.get(r.case_id);
    if (!cur || ORDER.indexOf(r.grade) < ORDER.indexOf(cur)) best.set(r.case_id, r.grade);
  }
  return { best, solved, played, today: Number((today!.results[0] as { n: number } | undefined)?.n ?? 0) };
}
