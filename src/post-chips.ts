import { gameDay } from './day';

// 구인구직 포럼·디스타그램에 사람이 직접 글을 쓰면 겜블장 젤칩을 줘요(나리 2026-11-21).
// 봇이 글을 보자마자 POST /api/bot/post-chips 로 보내고, 글이 지워지면 POST /api/bot/post-chips/revoke 로 다시 빼요(docs/bot-sync.md).
// 도감 젤리와는 상관없어요. 받은 사람에게 알림은 보내지 않아요.
export const POST_CHIPS = 100;
export const POST_CHIPS_PER_DAY = 4; // 구인구직·디스타그램 합쳐서
const MAX_AGE_MS = 2 * 86_400_000;
const FUTURE_MS = 5 * 60_000;

export type PostKind = 'recruit' | 'distagram';
export type PostChip = { id: string; user: string; kind: PostKind; at: string };
export type PostChipResult = { result: 'applied' | 'duplicate' | 'limit' | 'no_member' | 'too_old'; left: number };

const isId = (v: unknown): v is string => typeof v === 'string' && /^\d{17,20}$/.test(v);

export function parsePostChip(raw: unknown): { ok: true; value: PostChip } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'JSON 객체가 아니에요' };
  const r = raw as Record<string, unknown>;
  if (!isId(r.id)) return { ok: false, error: 'id(글 번호)가 잘못됐어요' };
  if (!isId(r.user)) return { ok: false, error: 'user가 잘못됐어요' };
  if (r.kind !== 'recruit' && r.kind !== 'distagram') return { ok: false, error: 'kind는 recruit 또는 distagram이에요' };
  if (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) return { ok: false, error: 'at이 잘못됐어요' };
  return { ok: true, value: { id: r.id, user: r.user, kind: r.kind, at: new Date(r.at).toISOString() } };
}

async function usedOn(db: D1Database, user: string, day: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM post_chips WHERE user_id = ? AND day = ?').bind(user, day).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

// 글을 쓴 시각의 도감 날짜로 하루 4번을 세요. 같은 글 번호는 한 번만이에요.
// 지금 서버에 있는 멤버만, 초기화·재가입 전에 쓴 글은 받지 않아요.
export async function grantPostChips(db: D1Database, p: PostChip, nowMs: number): Promise<PostChipResult> {
  const atMs = Date.parse(p.at);
  const day = gameDay(atMs);
  if (atMs < nowMs - MAX_AGE_MS || atMs > nowMs + FUTURE_MS) return { result: 'too_old', left: 0 };
  const seen = await db.prepare('SELECT 1 FROM post_chips WHERE id = ?').bind(p.id).first();
  if (seen) return { result: 'duplicate', left: Math.max(0, POST_CHIPS_PER_DAY - (await usedOn(db, p.user, day))) };
  const member = await db.prepare('SELECT reset_at FROM members WHERE user_id = ? AND active = 1').bind(p.user).first<{ reset_at: string | null }>();
  if (!member || (member.reset_at && p.at < member.reset_at)) return { result: 'no_member', left: 0 };
  const t = new Date(nowMs).toISOString();
  // 개수 확인과 넣기를 한 문장으로 해서, 거의 동시에 와도 4번을 넘지 않아요.
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO post_chips (id, user_id, kind, day, chips, posted_at, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
       WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)
         AND (SELECT COUNT(*) FROM post_chips WHERE user_id = ?2 AND day = ?4) < ?8`,
    )
    .bind(p.id, p.user, p.kind, day, POST_CHIPS, p.at, t, POST_CHIPS_PER_DAY)
    .run();
  const used = await usedOn(db, p.user, day);
  const left = Math.max(0, POST_CHIPS_PER_DAY - used);
  if (r.meta.changes === 1) return { result: 'applied', left };
  const again = await db.prepare('SELECT 1 FROM post_chips WHERE id = ?').bind(p.id).first();
  return { result: again ? 'duplicate' : 'limit', left };
}

export type RevokeResult = { result: 'revoked' | 'already' | 'not_found'; taken: number };

// 글이 지워졌어요: 준 젤칩을 다 빼요. 모자라면 빚으로 남아 마이너스로 보여요(나리 2026-11-21). 같은 글 번호는 한 번만 빼요.
export async function revokePostChips(db: D1Database, id: string, nowMs: number): Promise<RevokeResult> {
  const r = await db.prepare('UPDATE post_chips SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL').bind(id, new Date(nowMs).toISOString()).run();
  const row = await db.prepare('SELECT taken FROM post_chips WHERE id = ?').bind(id).first<{ taken: number | null }>();
  if (!row) return { result: 'not_found', taken: 0 };
  return { result: r.meta.changes === 1 ? 'revoked' : 'already', taken: Number(row.taken ?? 0) };
}
