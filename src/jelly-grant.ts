// 운영자(나리)가 디스코드 /도감젤리지급 으로 도감 젤리를 주거나 빼요.
// 봇이 바로 POST /api/bot/jelly-grants 로 보내고, 기록은 jelly_grants 에 남아요.

export const GRANT_MAX = 10000;
export const GRANT_REASON_MAX = 100;

export type JellyGrant = { id: string; user: string; amount: number; reason: string | null; by: string };
export type GrantResult = { result: 'applied' | 'duplicate' | 'no_member'; balance: number | null };

const isId = (v: unknown): v is string => typeof v === 'string' && /^\d{17,20}$/.test(v);

export function parseGrant(raw: unknown): { ok: true; value: JellyGrant } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'JSON 객체가 아니에요' };
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[A-Za-z0-9:_-]{1,64}$/.test(r.id)) return { ok: false, error: 'id가 잘못됐어요' };
  if (!isId(r.user)) return { ok: false, error: 'user가 잘못됐어요' };
  if (!isId(r.by)) return { ok: false, error: 'by가 잘못됐어요' };
  const amount = r.amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > GRANT_MAX) {
    return { ok: false, error: `amount는 0이 아닌 -${GRANT_MAX}~${GRANT_MAX} 정수예요` };
  }
  let reason: string | null = null;
  if (r.reason != null) {
    if (typeof r.reason !== 'string') return { ok: false, error: 'reason이 잘못됐어요' };
    const trimmed = [...r.reason.trim()].slice(0, GRANT_REASON_MAX).join('');
    reason = trimmed || null;
  }
  return { ok: true, value: { id: r.id, user: r.user, amount, reason, by: r.by } };
}

async function balanceOf(db: D1Database, user: string): Promise<number> {
  const row = await db.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').bind(user).first<{ dogam_jelly: number }>();
  return row?.dogam_jelly ?? 0;
}

// 지금 서버에 있는 멤버에게만 줘요. 빼는 경우 0개 밑으로는 내려가지 않아요.
// 기록에는 요청한 수가 아니라 실제로 바뀐 수를 남겨요(잔액 3개에서 -10이면 -3, 점검 W112).
// 기록 저장·젤리 반영·반영 표시를 한 번에 해서, 같은 번호를 두 번 보내도 한 번만 반영돼요.
// 대상 확인 뒤 초기화·탈퇴됐으면 기록도 잔액도 옛 요청으로 다시 만들지 않아요.
export async function grantJelly(db: D1Database, g: JellyGrant, nowMs: number): Promise<GrantResult> {
  const seen = await db.prepare('SELECT applied_at FROM jelly_grants WHERE id = ?').bind(g.id).first<{ applied_at: string | null }>();
  if (seen?.applied_at) return { result: 'duplicate', balance: await balanceOf(db, g.user) };
  const member = await db.prepare('SELECT reset_at FROM members WHERE user_id = ? AND active = 1').bind(g.user).first<{ reset_at: string | null }>();
  if (!member) return { result: 'no_member', balance: null };
  const t = new Date(nowMs).toISOString();
  const mark = `${t}#${crypto.randomUUID()}`;
  await db.batch([
    db
      .prepare(`INSERT OR IGNORE INTO jelly_grants (id, user_id, amount, reason, granted_by, created_at)
        SELECT ?1, ?2, MAX(0, COALESCE((SELECT dogam_jelly FROM profiles WHERE user_id = ?2), 0) + ?3) - COALESCE((SELECT dogam_jelly FROM profiles WHERE user_id = ?2), 0), ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1 AND COALESCE(reset_at, '') = ?7)`)
      .bind(g.id, g.user, g.amount, g.reason, g.by, t, member.reset_at ?? ''),
    db
      .prepare(
        `INSERT INTO profiles (user_id, dogam_jelly, updated_at)
         SELECT ?1, MAX(0, ?2), ?3
         WHERE EXISTS (SELECT 1 FROM jelly_grants WHERE id = ?4 AND user_id = ?1 AND applied_at IS NULL)
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1 AND COALESCE(reset_at, '') = ?5)
         ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = MAX(0, dogam_jelly + ?2), updated_at = ?3`,
      )
      .bind(g.user, g.amount, t, g.id, member.reset_at ?? ''),
    db
      .prepare(
        `UPDATE jelly_grants SET applied_at = ?2
         WHERE id = ?1 AND applied_at IS NULL AND EXISTS (SELECT 1 FROM members WHERE user_id = jelly_grants.user_id AND active = 1 AND COALESCE(reset_at, '') = ?3)`,
      )
      .bind(g.id, mark, member.reset_at ?? ''),
  ]);
  const after = await db.prepare('SELECT applied_at, user_id FROM jelly_grants WHERE id = ?').bind(g.id).first<{ applied_at: string | null; user_id: string }>();
  if (!after?.applied_at) return { result: 'no_member', balance: null };
  // 같은 번호가 다른 사람 앞으로 이미 있으면 그 기록이 이겨요(봇 실수). 이번 요청은 중복으로 봐요.
  if (after.user_id !== g.user) return { result: 'duplicate', balance: null };
  return { result: after.applied_at === mark ? 'applied' : 'duplicate', balance: await balanceOf(db, g.user) };
}
