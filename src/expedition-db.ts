import { characterUrl } from './character';
import { kstDay } from './db';
import {
  DAILY_REWARD_RUNS,
  RUN_XP,
  ROLES,
  applyChoice,
  defaultRole,
  isRole,
  levelBonus,
  replay,
  rollConditions,
  runJelly,
  type Crew,
  type Ending,
  type FindId,
  type RoleId,
  type RunState,
} from './expedition';

export const CREW_SIZE = 3;

export type Candidate = { id: string; name: string; art: string; role: RoleId; xp: number; me: boolean };

type CandRow = {
  user_id: string;
  display_name: string;
  xp: number | null;
  character_id: string | null;
  deco_id: string | null;
  exp_role: string | null;
};

const roleFor = (r: { user_id: string; exp_role: string | null }): RoleId => (isRole(r.exp_role) ? r.exp_role : defaultRole(r.user_id));

// 데려갈 수 있는 대원: 나 + 내가 카드를 가진 지금 있는 멤버
export async function listCandidates(db: D1Database, userId: string): Promise<Candidate[]> {
  const { results } = await db
    .prepare(
      `SELECT m.user_id, m.display_name, CASE WHEN m.user_id = ?1 THEN COALESCE(p.solo_xp, 0) ELSE c.xp END AS xp,
              p.character_id, p.deco_id, p.exp_role
       FROM members m
       LEFT JOIN cards c ON c.owner_id = ?1 AND c.target_id = m.user_id
       LEFT JOIN profiles p ON p.user_id = m.user_id
       WHERE m.active = 1 AND (m.user_id = ?1 OR c.owner_id IS NOT NULL)
       ORDER BY m.user_id = ?1 DESC, xp DESC, m.display_name`,
    )
    .bind(userId)
    .all<CandRow>();
  return results.map((r) => ({
    id: r.user_id,
    name: r.display_name,
    art: characterUrl(r.character_id, r.user_id, r.deco_id),
    role: roleFor(r),
    xp: Number(r.xp ?? 0),
    me: r.user_id === userId,
  }));
}

export async function myRole(db: D1Database, userId: string): Promise<{ role: RoleId; chosen: boolean }> {
  const row = await db.prepare('SELECT exp_role FROM profiles WHERE user_id = ?').bind(userId).first<{ exp_role: string | null }>();
  return isRole(row?.exp_role) ? { role: row!.exp_role as RoleId, chosen: true } : { role: defaultRole(userId), chosen: false };
}

export async function setRole(db: D1Database, userId: string, role: RoleId): Promise<void> {
  await db
    .prepare(
      `INSERT INTO profiles (user_id, exp_role, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET exp_role = ?2, updated_at = ?3`,
    )
    .bind(userId, role, new Date().toISOString())
    .run();
}

// 고른 사람이 3명보다 적으면 견습 대원으로 채워요(대원에 없는 역할부터)
export function buildCrew(picked: Candidate[], seed: string): Crew[] {
  const conds = rollConditions(seed, CREW_SIZE);
  const crew: Omit<Crew, 'cond'>[] = picked.slice(0, CREW_SIZE).map((c) => ({ id: c.id, name: c.name, art: c.art, role: c.role, bonus: levelBonus(c.xp) }));
  const missing = ROLES.map((r) => r.id).filter((r) => !crew.some((c) => c.role === r));
  let n = 1;
  while (crew.length < CREW_SIZE) {
    const role = missing.shift() ?? 'guard';
    crew.push({ id: null, name: `견습 대원 ${n}`, art: characterUrl(null, `apprentice-${seed}-${n}`), role, bonus: 0 });
    n++;
  }
  return crew.map((c, i) => ({ ...c, cond: conds[i]! }));
}

export type RunRow = {
  id: string;
  user_id: string;
  seed: string;
  crew: string;
  choices: string;
  status: 'going' | 'done' | 'quit';
  ending: Ending | null;
  xp: number;
  jelly: number;
  ended_at: string | null;
};

export type Run = { row: RunRow; crew: Crew[]; choices: number[]; state: RunState };

export function loadRun(row: RunRow): Run {
  const crew = JSON.parse(row.crew) as Crew[];
  const choices = JSON.parse(row.choices) as number[];
  return { row, crew, choices, state: replay(row.seed, crew, choices) };
}

export async function currentRun(db: D1Database, userId: string): Promise<Run | null> {
  const row = await db
    .prepare(`SELECT * FROM exp_runs WHERE user_id = ? AND status = 'going' ORDER BY started_at DESC LIMIT 1`)
    .bind(userId)
    .first<RunRow>();
  if (!row) return null;
  try {
    return loadRun(row);
  } catch (e) {
    // 사건 내용이 바뀌어서 다시 계산할 수 없는 옛 원정은 그만둔 것으로 해요
    console.error('원정 다시 계산 실패', row.id, e);
    await db.prepare(`UPDATE exp_runs SET status = 'quit', updated_at = ?2, ended_at = ?2 WHERE id = ?1 AND status = 'going'`).bind(row.id, new Date().toISOString()).run();
    return null;
  }
}

export async function getRun(db: D1Database, userId: string, id: string): Promise<Run | null> {
  const row = await db.prepare('SELECT * FROM exp_runs WHERE id = ? AND user_id = ?').bind(id, userId).first<RunRow>();
  try {
    return row ? loadRun(row) : null;
  } catch {
    return null;
  }
}

export async function startRun(db: D1Database, userId: string, pickIds: string[]): Promise<'started' | 'too_many' | 'bad_pick'> {
  const ids = [...new Set(pickIds)];
  if (ids.length > CREW_SIZE) return 'too_many';
  const cands = await listCandidates(db, userId);
  const picked = ids.map((id) => cands.find((c) => c.id === id));
  if (picked.some((p) => !p)) return 'bad_pick';
  const id = crypto.randomUUID();
  const seed = crypto.randomUUID();
  const crew = buildCrew(picked as Candidate[], seed);
  const t = new Date().toISOString();
  // 하던 원정은 그만둔 것으로 하고 새로 시작해요(한 사람에 진행 중인 원정은 하나)
  await db.batch([
    db.prepare(`UPDATE exp_runs SET status = 'quit', updated_at = ?2, ended_at = ?2 WHERE user_id = ?1 AND status = 'going'`).bind(userId, t),
    db
      .prepare(`INSERT INTO exp_runs (id, user_id, seed, crew, choices, status, started_at, updated_at) VALUES (?, ?, ?, ?, '[]', 'going', ?, ?)`)
      .bind(id, userId, seed, JSON.stringify(crew), t, t),
  ]);
  return 'started';
}

export async function quitRun(db: D1Database, userId: string): Promise<void> {
  const t = new Date().toISOString();
  await db.prepare(`UPDATE exp_runs SET status = 'quit', updated_at = ?2, ended_at = ?2 WHERE user_id = ?1 AND status = 'going'`).bind(userId, t).run();
}

export type ActResult = { result: 'ok' | 'done' | 'stale' | 'bad' | 'none'; runId?: string };

// 선택 하나 반영. runId·at = 화면에 보이던 원정과 차례(다른 탭의 옛 화면, 뒤로 가기, 두 번 누르기로 엉뚱하게 반영되지 않게)
export async function act(db: D1Database, userId: string, runId: string, at: number, choice: number, now = new Date()): Promise<ActResult> {
  const run = await currentRun(db, userId);
  if (!run) return { result: 'none' };
  if (run.row.id !== runId || run.choices.length !== at) return { result: 'stale', runId: run.row.id };
  const s = run.state;
  if (!applyChoice(run.row.seed, run.crew, s, choice, at)) return { result: 'bad', runId: run.row.id };
  const old = run.row.choices;
  const next = JSON.stringify([...run.choices, choice]);
  const t = now.toISOString();
  if (s.phase !== 'done') {
    const r = await db
      .prepare(`UPDATE exp_runs SET choices = ?3, updated_at = ?4 WHERE id = ?1 AND status = 'going' AND choices = ?2`)
      .bind(run.row.id, old, next, t)
      .run();
    return { result: (r.meta.changes ?? 0) > 0 ? 'ok' : 'stale', runId: run.row.id };
  }
  // 끝: 하루 첫 3판이면 보상, 발견품은 늘 모아요. 한 트랜잭션으로, 이 요청이 끝낸 경우에만 반영해요.
  const day = kstDay(now);
  const mark = `${t}#${crypto.randomUUID()}`;
  const won = 'EXISTS (SELECT 1 FROM exp_runs WHERE id = ?1 AND ended_at = ?2)';
  const finds = new Map<FindId, number>();
  for (const f of s.finds) finds.set(f, (finds.get(f) ?? 0) + 1);
  await db.batch([
    db
      .prepare(
        `UPDATE exp_runs SET choices = ?3, status = 'done', ending = ?4, day = ?5, updated_at = ?6, ended_at = ?7,
           xp = CASE WHEN (SELECT COUNT(*) FROM exp_runs WHERE user_id = ?8 AND day = ?5 AND status = 'done') < ?9 THEN ?10 ELSE 0 END,
           jelly = CASE WHEN (SELECT COUNT(*) FROM exp_runs WHERE user_id = ?8 AND day = ?5 AND status = 'done') < ?9 THEN ?11 ELSE 0 END
         WHERE id = ?1 AND status = 'going' AND choices = ?2`,
      )
      .bind(run.row.id, old, next, s.ending, day, t, mark, userId, DAILY_REWARD_RUNS, RUN_XP, runJelly(s.ending!)),
    db
      .prepare(
        `INSERT INTO profiles (user_id, solo_xp, dogam_jelly, updated_at)
         SELECT ?3, xp, jelly, ?4 FROM exp_runs WHERE id = ?1 AND ended_at = ?2
         ON CONFLICT (user_id) DO UPDATE SET solo_xp = solo_xp + excluded.solo_xp, dogam_jelly = dogam_jelly + excluded.dogam_jelly,
           updated_at = excluded.updated_at`,
      )
      .bind(run.row.id, mark, userId, t),
    ...[...finds].map(([f, n]) =>
      db
        .prepare(
          `INSERT INTO exp_finds (user_id, find_id, count, first_at) SELECT ?3, ?4, ?5, ?6 WHERE ${won}
           ON CONFLICT (user_id, find_id) DO UPDATE SET count = count + excluded.count`,
        )
        .bind(run.row.id, mark, userId, f, n, t),
    ),
  ]);
  const done = await db.prepare(`SELECT 1 FROM exp_runs WHERE id = ? AND ended_at = ?`).bind(run.row.id, mark).first();
  return { result: done ? 'done' : 'stale', runId: run.row.id };
}

export type ExpRecord = { finds: Map<string, number>; endings: Set<string>; today: number; runs: number };

export async function myRecord(db: D1Database, userId: string, now = new Date()): Promise<ExpRecord> {
  const [finds, endings, today] = await db.batch([
    db.prepare('SELECT find_id, count FROM exp_finds WHERE user_id = ?').bind(userId),
    db.prepare(`SELECT ending, COUNT(*) AS n FROM exp_runs WHERE user_id = ? AND status = 'done' GROUP BY ending`).bind(userId),
    db.prepare(`SELECT COUNT(*) AS n FROM exp_runs WHERE user_id = ? AND day = ? AND status = 'done'`).bind(userId, kstDay(now)),
  ]);
  const endRows = endings!.results as { ending: string; n: number }[];
  return {
    finds: new Map((finds!.results as { find_id: string; count: number }[]).map((r) => [r.find_id, Number(r.count)])),
    endings: new Set(endRows.map((r) => r.ending)),
    runs: endRows.reduce((a, r) => a + Number(r.n), 0),
    today: Number((today!.results[0] as { n: number } | undefined)?.n ?? 0),
  };
}
