import { MAX_LEVEL, xpForLevel } from './levels';

// 봇이 보내는 동기화 묶음을 검사하고 D1에 한 번에 반영해요. 자세한 형식은 docs/bot-sync.md
const ID = /^\d{17,20}$/;
const MAX_ITEMS = 5000;
const MAX_XP = 100_000;
const MAX_JELLY_EARNED = 100; // 한 묶음에서 한 사람이 받는 도감 젤리

export type SyncPayload = {
  batch_id: string;
  members: { id: string; name: string; avatar_url: string | null; joined_at: string | null; is_newbie: boolean }[];
  removed: string[];
  pair_xp: { a: string; b: string; xp: number; voice_seconds: number; scrims: number; at: string }[];
  solo_xp: { id: string; xp: number }[];
  // 봇이 센 도감 젤리(출석, 하루 통화 등). 겜블 젤리와는 상관없어요.
  jelly_earned: { id: string; amount: number }[];
};

type Result = { ok: true; value: SyncPayload } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown, max = MAX_XP): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function list(raw: Record<string, unknown>, key: string): unknown[] | string {
  const v = raw[key] ?? [];
  if (!Array.isArray(v)) return `${key}는 배열이어야 해요`;
  if (v.length > MAX_ITEMS) return `${key}는 한 번에 ${MAX_ITEMS}개까지예요`;
  return v;
}

export function parseSync(raw: unknown): Result {
  if (!isObj(raw)) return { ok: false, error: '본문이 JSON 객체가 아니에요' };
  const batch_id = raw.batch_id;
  if (typeof batch_id !== 'string' || batch_id.length < 1 || batch_id.length > 100)
    return { ok: false, error: 'batch_id가 필요해요' };

  const lists = ['members', 'removed', 'pair_xp', 'solo_xp', 'jelly_earned'].map((k) => list(raw, k));
  const bad = lists.find((l) => typeof l === 'string');
  if (bad) return { ok: false, error: bad as string };
  const [rawMembers, rawRemoved, rawPairs, rawSolo, rawJelly] = lists as unknown[][];

  const members: SyncPayload['members'] = [];
  for (const m of rawMembers!) {
    if (!isObj(m) || typeof m.id !== 'string' || !ID.test(m.id)) return { ok: false, error: 'members.id가 잘못됐어요' };
    if (typeof m.name !== 'string' || m.name.length < 1 || m.name.length > 100)
      return { ok: false, error: `members.name이 잘못됐어요 (${m.id})` };
    const avatar = m.avatar_url ?? null;
    if (avatar !== null && (typeof avatar !== 'string' || !avatar.startsWith('https://')))
      return { ok: false, error: `members.avatar_url이 잘못됐어요 (${m.id})` };
    const joined = m.joined_at ?? null;
    if (joined !== null && !isTime(joined)) return { ok: false, error: `members.joined_at이 잘못됐어요 (${m.id})` };
    // members[].jelly(예전 겜블 젤리 잔액)는 더 이상 쓰지 않아서 와도 무시해요
    members.push({ id: m.id, name: m.name, avatar_url: avatar, joined_at: joined, is_newbie: m.is_newbie === true });
  }

  const removed: string[] = [];
  for (const id of rawRemoved!) {
    if (typeof id !== 'string' || !ID.test(id)) return { ok: false, error: 'removed에 잘못된 id가 있어요' };
    removed.push(id);
  }

  const pair_xp: SyncPayload['pair_xp'] = [];
  for (const p of rawPairs!) {
    if (!isObj(p) || typeof p.a !== 'string' || typeof p.b !== 'string' || !ID.test(p.a) || !ID.test(p.b))
      return { ok: false, error: 'pair_xp.a/b가 잘못됐어요' };
    if (p.a === p.b) return { ok: false, error: 'pair_xp에 같은 사람끼리 짝이 있어요' };
    const voice = p.voice_seconds ?? 0;
    const scrims = p.scrims ?? 0;
    if (!isCount(p.xp) || !isCount(voice, 86_400 * 31) || !isCount(scrims, 1000))
      return { ok: false, error: `pair_xp 숫자가 잘못됐어요 (${p.a}, ${p.b})` };
    if (!isTime(p.at)) return { ok: false, error: `pair_xp.at이 잘못됐어요 (${p.a}, ${p.b})` };
    pair_xp.push({ a: p.a, b: p.b, xp: p.xp, voice_seconds: voice, scrims, at: new Date(p.at).toISOString() });
  }

  const solo_xp: SyncPayload['solo_xp'] = [];
  for (const s of rawSolo!) {
    if (!isObj(s) || typeof s.id !== 'string' || !ID.test(s.id) || !isCount(s.xp))
      return { ok: false, error: 'solo_xp가 잘못됐어요' };
    solo_xp.push({ id: s.id, xp: s.xp });
  }

  const jelly_earned: SyncPayload['jelly_earned'] = [];
  for (const j of rawJelly!) {
    if (!isObj(j) || typeof j.id !== 'string' || !ID.test(j.id) || !isCount(j.amount, MAX_JELLY_EARNED) || j.amount === 0)
      return { ok: false, error: `jelly_earned가 잘못됐어요 (1~${MAX_JELLY_EARNED})` };
    jelly_earned.push({ id: j.id, amount: j.amount });
  }

  return { ok: true, value: { batch_id, members, removed, pair_xp, solo_xp, jelly_earned } };
}

// 카드 레벨이 오르면 그 카드 주인에게 도감 젤리 1개씩.
// 카드마다 젤리를 준 레벨(jelly_level)을 적어 두고, 같은 트랜잭션 안에서 경험치를 올린 뒤
// "지금 레벨 - 준 레벨"만큼 줘요. 그래서 동기화가 겹쳐도 레벨마다 딱 한 번만 받아요.
export const JELLY_PER_CARD_LEVEL = 1;

// SQL 안에서 경험치 → 레벨(levels.ts의 levelFromXp와 같아요)
export function levelSql(col: string): string {
  const needs = Array.from({ length: MAX_LEVEL - 1 }, (_, i) => `(${xpForLevel(i + 2)})`).join(',');
  return `(1 + (SELECT COUNT(*) FROM (VALUES ${needs}) WHERE column1 <= ${col}))`;
}

// 떠난 멤버(또는 아직 members에 없는 사람)의 경험치는 버려요. 그래서 봇은 경험치에 나오는 사람을 같은 묶음의 members에도 넣어요.
// 모든 문장을 하나의 트랜잭션으로 실행해요. 같은 batch_id가 또 오면 첫 INSERT에서 막혀 아무것도 반영되지 않아요.
// 같은 묶음이 두 번 반영되지 않게 batch_id를 적어 두는데, 끝없이 쌓이지 않게 30일 지난 기록은 지워요.
// 대신 봇이 만든 지 25일이 넘은 묶음은 받지 않아요(기록이 지워진 뒤 옛 묶음이 다시 와서 두 번 반영되지 않게).
export const SYNC_BATCH_KEEP_DAYS = 30;
export const SYNC_BATCH_MAX_AGE_DAYS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

// 봇의 batch_id는 "만든 시각-무작위"예요. 시각을 못 읽으면 null.
export function batchTime(batchId: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2}))/.exec(batchId);
  if (!m) return null;
  const ms = Date.parse(m[1]!);
  return Number.isFinite(ms) ? ms : null;
}

// 만든 시각이 없거나, 25일보다 오래됐거나, 하루 넘게 미래인 묶음은 받지 않아요.
// (기록을 30일 뒤 지우니까, 시각을 모르는 묶음이 나중에 다시 오면 두 번 반영될 수 있어요)
export function isStaleBatch(batchId: string, nowMs: number): boolean {
  const ms = batchTime(batchId);
  if (ms === null) return true;
  return nowMs - ms > SYNC_BATCH_MAX_AGE_DAYS * DAY_MS || ms - nowMs > DAY_MS;
}

export async function applySync(db: D1Database, p: SyncPayload, nowMs = Date.now()): Promise<'applied' | 'duplicate' | 'stale'> {
  const t = new Date(nowMs).toISOString();
  if (isStaleBatch(p.batch_id, nowMs)) return 'stale';
  const seen = await db.prepare('SELECT 1 FROM sync_batches WHERE batch_id = ?').bind(p.batch_id).first();
  if (seen) return 'duplicate';

  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT INTO sync_batches (batch_id, applied_at) VALUES (?, ?)').bind(p.batch_id, t),
    db.prepare('DELETE FROM sync_batches WHERE applied_at < ?').bind(new Date(nowMs - SYNC_BATCH_KEEP_DAYS * DAY_MS).toISOString()),
  ];

  const upsertMember = db.prepare(
    `INSERT INTO members (user_id, display_name, avatar_url, joined_at, is_newbie, active, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)
     ON CONFLICT (user_id) DO UPDATE SET display_name = ?2, avatar_url = ?3,
       joined_at = COALESCE(?4, joined_at), is_newbie = ?5, active = 1, updated_at = ?6`,
  );
  for (const m of p.members) stmts.push(upsertMember.bind(m.id, m.name, m.avatar_url, m.joined_at, m.is_newbie ? 1 : 0, t));

  const addPair = db.prepare(
    `INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
     ON CONFLICT (owner_id, target_id) DO UPDATE SET xp = xp + ?3, voice_seconds = voice_seconds + ?4,
       scrims = scrims + ?5, first_met = MIN(first_met, ?6), updated_at = ?7`,
  );
  for (const x of p.pair_xp) {
    stmts.push(addPair.bind(x.a, x.b, x.xp, x.voice_seconds, x.scrims, x.at, t));
    stmts.push(addPair.bind(x.b, x.a, x.xp, x.voice_seconds, x.scrims, x.at, t));
  }

  const addSolo = db.prepare(
    `INSERT INTO profiles (user_id, solo_xp, updated_at)
     SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
     ON CONFLICT (user_id) DO UPDATE SET solo_xp = solo_xp + ?2, updated_at = ?3`,
  );
  for (const s of p.solo_xp) stmts.push(addSolo.bind(s.id, s.xp, t));

  // 도감 젤리: 봇이 센 것. 지금 서버에 있는 멤버만 받아요.
  const addJelly = db.prepare(
    `INSERT INTO profiles (user_id, dogam_jelly, updated_at)
     SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
     ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + ?2, updated_at = ?3`,
  );
  const earned = new Map<string, number>();
  for (const j of p.jelly_earned) earned.set(j.id, (earned.get(j.id) ?? 0) + j.amount);
  for (const [id, amount] of earned) stmts.push(addJelly.bind(id, amount, t));

  // 도감 젤리: 카드 레벨업. 경험치를 올린 다음, 아직 젤리를 안 준 레벨만큼 주고 준 레벨을 적어요.
  const level = levelSql('xp');
  const levelUp = `(SELECT COALESCE(SUM(${level} - jelly_level), 0) * ${JELLY_PER_CARD_LEVEL} FROM cards WHERE owner_id = ?1 AND ${level} > jelly_level)`;
  const addLevelJelly = db.prepare(
    `INSERT INTO profiles (user_id, dogam_jelly, updated_at)
     SELECT ?1, ${levelUp}, ?2 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1) AND ${levelUp} > 0
     ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + excluded.dogam_jelly, updated_at = ?2`,
  );
  const markLevel = db.prepare(`UPDATE cards SET jelly_level = ${level} WHERE owner_id = ?1 AND ${level} > jelly_level`);
  for (const owner of new Set(p.pair_xp.flatMap((x) => [x.a, x.b]))) {
    stmts.push(addLevelJelly.bind(owner, t));
    stmts.push(markLevel.bind(owner));
  }

  // 나간 사람: 본인 카드와 도감은 지우고, 다른 사람이 가진 그 사람 카드는 흐리게 남겨요.
  for (const id of p.removed) {
    stmts.push(db.prepare('UPDATE members SET active = 0, updated_at = ? WHERE user_id = ?').bind(t, id));
    stmts.push(db.prepare('DELETE FROM profiles WHERE user_id = ?').bind(id));
    stmts.push(db.prepare('DELETE FROM cards WHERE owner_id = ?').bind(id));
    stmts.push(db.prepare('DELETE FROM owned_items WHERE user_id = ?').bind(id));
    stmts.push(db.prepare("UPDATE purchases SET status = 'failed', reason = 'left' WHERE user_id = ? AND status = 'pending'").bind(id));
  }

  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes('UNIQUE') && String(e).includes('sync_batches')) return 'duplicate';
    throw e;
  }
  return 'applied';
}
