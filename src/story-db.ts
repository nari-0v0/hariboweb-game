import { buildCrew, listCandidates } from './expedition-db';
import { kstDay } from './db';
import { DAILY_REWARD_RUNS, RUN_XP, isRole, runJelly } from './expedition';
import { CASE_XP, DAILY_REWARD_CASES, caseJelly } from './cases';
import { advanceStory, startStory, type StoryAction, type StoryState } from './story';
import { region, storyCase, type Mark } from './story-content';
import { storyEvent } from './story-content';
import { isJellyState } from './jelly-investigation';

export type StoryRow = { id: string; user_id: string; kind: 'case' | 'expedition'; content_id: string; state: string; revision: number; status: string; xp: number; jelly: number; season_id: string | null; mutation: string };
export type StoryRun = { row: StoryRow; state: StoryState };
export function decodeStory(row: StoryRow): StoryRun | null {
  try {
    const s = JSON.parse(row.state) as StoryState;
    const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
    if (![1, 2, 3, 4].includes(s.version) || s.kind !== row.kind || s.content !== row.content_id || !Array.isArray(s.crew) || !strings(s.seen) || !strings(s.route) || !strings(s.journal) || !strings(s.log)) return null;
    if (!s.marks || typeof s.marks !== 'object' || Array.isArray(s.marks) || !Object.values(s.marks).every(v => typeof v === 'string')) return null;
    if (![s.hp, s.tools, s.time, s.position, row.revision].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
    if (!['play', 'epilogue', 'done'].includes(s.phase) || typeof s.correct !== 'boolean' || (s.ending !== null && typeof s.ending !== 'string')) return null;
    if (s.crew.some(c => !c || typeof c.name !== 'string' || typeof c.art !== 'string' || !isRole(c.role))) return null;
    if (!(s.kind === 'case' ? storyCase(s.content) : region(s.content))) return null;
    if (s.version >= 2) {
      const p = s.interaction;
      if (!p || (s.kind === 'case' ? p.mode !== 'case' : p.mode !== 'map')) return null;
      if (p.mode === 'case' && !strings(p.links)) return null;
      if (s.version === 4 && (s.kind !== 'case' || s.content !== 'jelly500' || p.mode !== 'case' || s.seen.some(id => !/^[A-L]$/.test(id)))) return null;
      if (s.version === 3 && (s.kind !== 'case' || s.content !== 'jelly500' || p.mode !== 'case' || !isJellyState(p.jelly))) return null;
      if (p.mode === 'map' && (p.skillsUsed !== undefined && (!strings(p.skillsUsed) || p.skillsUsed.some(r => !isRole(r))))) return null;
      if (p.mode === 'map' && p.cells.some(c => (c.peeked !== undefined && typeof c.peeked !== 'boolean') || (c.traced !== undefined && typeof c.traced !== 'boolean'))) return null;
      if (p.mode === 'map' && (!Array.isArray(p.cells) || p.cells.length !== 25 || p.camp !== 20 || !Array.isArray(p.crewAt) || p.crewAt.length !== 3 || p.crewAt.some(n => !Number.isInteger(n) || n < 0 || n > 24) || p.cells.some(c => !c || !Array.isArray(c.ports) || c.ports.some(n => !Number.isInteger(n) || n < 0 || n > 3) || !Number.isInteger(c.rotation) || c.rotation < 0 || c.rotation > 3 || typeof c.revealed !== 'boolean' || typeof c.surveyed !== 'boolean' || (c.event !== null && !storyEvent(c.event))))) return null;
    }
    return { row, state: s };
  } catch { return null; }
}
export async function storyMarks(db: D1Database, user: string): Promise<Mark> {
  const { results } = await db.prepare('SELECT mark, value FROM story_marks WHERE user_id = ?').bind(user).all<{ mark: string; value: string }>();
  return Object.fromEntries(results.map(r => [r.mark, r.value]));
}
export async function getStory(db: D1Database, user: string, id: string): Promise<StoryRun | null> {
  const row = await db.prepare('SELECT * FROM story_runs WHERE user_id = ? AND id = ?').bind(user, id).first<StoryRow>();
  return row ? decodeStory(row) : null;
}
export async function activeStory(db: D1Database, user: string, kind: string): Promise<StoryRun | null> {
  const row = await db.prepare("SELECT * FROM story_runs WHERE user_id = ? AND kind = ? AND status = 'going'").bind(user, kind).first<StoryRow>();
  if (!row) return null;
  const run = decodeStory(row);
  // 선택형 v1 진행 판은 기록을 보존한 채 덮고 새 조작형 판으로 시작해요. 보상은 지급하지 않아요.
  if (!run || run.state.version === 1) {
    await db.prepare("UPDATE story_runs SET status = 'quit', ended_at = ?, updated_at = ? WHERE id = ? AND revision = ? AND status = 'going'").bind(new Date().toISOString(), new Date().toISOString(), row.id, row.revision).run();
    return null;
  }
  if (run.state.version < 4 && run.state.kind === 'case' && run.state.content === 'jelly500') {
    const next = startStory('case', 'jelly500', run.state.crew, run.state.marks);
    next.seen = [];
    next.journal = [...run.state.journal, '모순 재구성 조사로 전환했다. 영구 발견과 이전 일지는 유지하고 원기록을 새로 확인한다.'];
    next.log = ['사건의 설정과 원기록이 확장됐어요. 기존 발견 보상은 유지되며, 세 장소의 상충하는 기록을 새로 조사할 수 있어요.'];
    await db.prepare("UPDATE story_runs SET state = ?, revision = revision + 1, updated_at = ?, mutation = ? WHERE id = ? AND user_id = ? AND revision = ? AND status = 'going'")
      .bind(JSON.stringify(next), new Date().toISOString(), crypto.randomUUID(), row.id, user, row.revision).run();
    const upgraded = await getStory(db, user, row.id);
    return upgraded?.row.status === 'going' ? upgraded : null;
  }
  return run;
}
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function beginStory(db: D1Database, user: string, kind: StoryState['kind'], content: string, ids: string[], requestId: string): Promise<string | null> {
  if (!uuid(requestId) || !(kind === 'case' ? storyCase(content) : region(content)) || ids.length > 3 || new Set(ids).size !== ids.length) return null;
  const previous = await getStory(db, user, requestId);
  if (previous) return previous.row.kind === kind ? previous.row.id : null;
  const active = await activeStory(db, user, kind);
  if (active) return active.row.id;
  const candidates = await listCandidates(db, user);
  if (ids.some(id => !candidates.some(c => c.id === id))) return null;
  const crew = buildCrew(ids.map(id => candidates.find(c => c.id === id)!), requestId);
  const s = startStory(kind, content, crew, await storyMarks(db, user));
  const t = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO story_runs (id, user_id, kind, content_id, state, started_at, updated_at, mutation)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ? AND active = 1)`)
    .bind(requestId, user, kind, content, JSON.stringify(s), t, t, requestId, user).run();
  return (await activeStory(db, user, kind))?.row.id ?? null;
}

export async function actStory(db: D1Database, user: string, id: string, revision: number, action: StoryAction, now = new Date()): Promise<'ok' | 'stale' | 'bad'> {
  if (!uuid(id) || !Number.isSafeInteger(revision) || revision < 0) return 'bad';
  const run = await getStory(db, user, id);
  if (!run || run.row.status !== 'going' || run.row.revision !== revision) return 'stale';
  const advanced = advanceStory(run.state, action);
  if (!advanced) return 'bad';
  const { state: s, grants } = advanced;
  const token = crypto.randomUUID(), t = now.toISOString(), day = kstDay(now);
  const finished = s.phase === 'done', quit = s.ending === 'quit';
  const eligible = finished && s.correct && !quit;
  const table = s.kind === 'case' ? 'case_runs' : 'exp_runs';
  const limit = s.kind === 'case' ? DAILY_REWARD_CASES : DAILY_REWARD_RUNS;
  const xp = s.kind === 'case' ? CASE_XP : RUN_XP;
  const jelly = s.kind === 'case' ? caseJelly('A') : runJelly(s.ending === 'return' ? 'retreat' : s.ending === 'hidden' ? 'hidden' : 'treasure');
  // 기존 모드와 같은 일일 한도. SQL 식별자는 서버가 정한 두 값 중 하나뿐이에요.
  const quota = `(SELECT COUNT(*) FROM ${table} WHERE user_id = ?2 AND day = ?7 AND status = 'done') +
    (SELECT COUNT(*) FROM story_runs WHERE user_id = ?2 AND kind = ?8 AND day = ?7 AND status = 'done') < ${limit}`;
  const first = `NOT EXISTS (SELECT 1 FROM story_rewards WHERE user_id = ?2 AND kind = ?8 AND content_id = ?9)`;
  const won = `EXISTS (SELECT 1 FROM story_runs WHERE id = ?1 AND user_id = ?2 AND mutation = ?3)`;
  const paid = eligible ? `CASE WHEN ${quota} AND ${first} THEN 1 ELSE 0 END` : '0';
  const batch = [db.prepare(`UPDATE story_runs SET state = ?4, revision = revision + 1, mutation = ?3,
      status = ?5, updated_at = ?6, day = CASE WHEN ?10 THEN ?7 ELSE NULL END,
      ended_at = CASE WHEN ?10 THEN ?6 ELSE NULL END,
      season_id = CASE WHEN ?10 THEN (SELECT id FROM seasons WHERE starts_at <= ?6 AND ends_at > ?6 ORDER BY starts_at DESC LIMIT 1) ELSE NULL END,
      xp = ${xp} * (${paid}), jelly = ${jelly} * (${paid})
    WHERE id = ?1 AND user_id = ?2 AND revision = ?11 AND status = 'going'
      AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`)
    .bind(id, user, token, JSON.stringify(s), finished ? (quit ? 'quit' : 'done') : 'going', t, day, s.kind, s.content, finished ? 1 : 0, revision)];
  for (const [key, value] of Object.entries(grants)) batch.push(db.prepare(`INSERT INTO story_marks (user_id, mark, value, updated_at)
    SELECT ?2, ?4, ?5, ?6 WHERE ${won}
    ON CONFLICT(user_id, mark) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(id, user, token, key, value, t));
  if (eligible) {
    batch.push(db.prepare(`INSERT INTO story_rewards (user_id, kind, content_id, run_id, claimed_at)
      SELECT ?2, kind, content_id, id, ?4 FROM story_runs WHERE id = ?1 AND user_id = ?2 AND mutation = ?3 AND xp > 0`).bind(id, user, token, t));
    batch.push(db.prepare(`INSERT INTO profiles (user_id, solo_xp, dogam_jelly, updated_at)
      SELECT ?2, xp, jelly, ?4 FROM story_runs WHERE id = ?1 AND user_id = ?2 AND mutation = ?3 AND xp > 0
      ON CONFLICT(user_id) DO UPDATE SET solo_xp = COALESCE(profiles.solo_xp, 0) + excluded.solo_xp,
        dogam_jelly = COALESCE(profiles.dogam_jelly, 0) + excluded.dogam_jelly, updated_at = excluded.updated_at`).bind(id, user, token, t));
  }
  // D1 batch은 전부 커밋되거나 전부 롤백됩니다. 외부 BEGIN/COMMIT이나 응답 이후 지급은 없어요.
  const result = await db.batch(batch);
  return (result[0]?.meta.changes ?? 0) === 1 ? 'ok' : 'stale';
}
