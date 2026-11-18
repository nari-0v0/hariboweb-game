// 칭찬 한마디와 칭찬함.
// 받는 사람에게는 보낸 사람을 보여 주지 않아요(DB에만 남아요). 알림(DM·채팅)은 없고, 안 읽은 개수만 보여 줘요.
import { askAi } from './ai';

export const PRAISE_NOTE_MAX = 100;
export const PRAISE_BOX_NOTICE = '받는 사람에게는 보낸 사람이 보이지 않아요.';

// 띄어쓰기를 한 칸으로, 앞뒤 공백 없이, 100자까지
export function cleanNote(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return [...raw.replace(/\s+/g, ' ').trim()].slice(0, PRAISE_NOTE_MAX).join('').trim();
}

const AI_PROMPT = `너는 디스코드 게임 모임의 칭찬 한마디 검사기야. 한 멤버가 같이 논 사람에게 칭찬과 함께 보낼 한마디를 적었어.
JSON 한 줄로만 답해: {"verdict":"ok|bad"}
- ok: 칭찬, 고마움, 응원, 장난스럽지만 다정한 말. 욕설이 섞여 있어도 강조나 친한 장난이면 ok야(예: "존나 잘함", "ㅅㅂ 개웃겼어").
- bad: 상대를 비꼬거나 깎아내리는 말, 상대를 향한 모욕, 성적인 말, 개인정보`;

export function parseNoteVerdict(text: string): 'ok' | 'bad' | null {
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const v = (JSON.parse(m[0]) as { verdict?: unknown }).verdict;
    return v === 'ok' || v === 'bad' ? v : null;
  } catch {
    return null;
  }
}

// 보낼 한마디. 비꼬기·모욕이면 null(칭찬만 전해요). 욕설은 막지 않아요(나리 2026-11-16).
// AI가 없거나 실패하면 그대로 보내요.
export async function checkNote(
  ai: Ai | undefined,
  raw: unknown,
): Promise<{ note: string | null; filtered: boolean; verdict?: 'ok' | 'bad' | 'none' }> {
  const note = cleanNote(raw);
  if (!note) return { note: null, filtered: false };
  const answer = await askAi(ai, AI_PROMPT, note, 20, '칭찬 한마디');
  const parsed = parseNoteVerdict(answer);
  // 답은 왔는데 판단을 못 읽으면 답 앞부분을 남겨요(왜 'none'인지 로그에서 보려고)
  if (answer && !parsed) console.error(`칭찬 한마디 AI 답을 못 읽었어요: ${answer.slice(0, 120)}`);
  const verdict = parsed ?? 'none';
  return verdict === 'bad' ? { note: null, filtered: true, verdict } : { note, filtered: false, verdict };
}

// AI 판단 기록(비공개 로그 채널용). 원래 한마디를 그대로 남겨요(걸러진 것도).
export async function logAiCheck(
  db: D1Database,
  kind: 'praise',
  fromId: string,
  toId: string | null,
  text: string,
  verdict: 'ok' | 'bad' | 'none',
  nowMs: number,
): Promise<void> {
  await db
    .prepare('INSERT INTO ai_logs (kind, from_id, to_id, text, verdict, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(kind, fromId, toId, text, verdict, new Date(nowMs).toISOString())
    .run();
}

export type AiLogRow = {
  id: number;
  kind: string;
  from: { id: string; name: string };
  to: { id: string; name: string } | null;
  text: string;
  verdict: string;
  created_at: string;
};

// 봇이 아직 안 올린 AI 판단 기록(오래된 것부터)
export async function listUnpostedAiLogs(db: D1Database, limit = 20): Promise<AiLogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT l.id, l.kind, l.from_id, f.display_name AS from_name, l.to_id, t.display_name AS to_name, l.text, l.verdict, l.created_at
       FROM ai_logs l LEFT JOIN members f ON f.user_id = l.from_id LEFT JOIN members t ON t.user_id = l.to_id
       WHERE l.posted_at IS NULL ORDER BY l.id LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: number; kind: string; from_id: string; from_name: string | null; to_id: string | null; to_name: string | null; text: string; verdict: string; created_at: string }>();
  return results.map((r) => ({
    id: r.id,
    kind: r.kind,
    from: { id: r.from_id, name: r.from_name ?? '알 수 없음' },
    to: r.to_id ? { id: r.to_id, name: r.to_name ?? '알 수 없음' } : null,
    text: r.text,
    verdict: r.verdict,
    created_at: r.created_at,
  }));
}

// 봇이 채널에 올린 기록을 표시해요. 표시한 개수를 돌려줘요.
export async function markAiLogsPosted(db: D1Database, ids: number[], nowMs: number): Promise<number> {
  if (!ids.length) return 0;
  const r = await db
    .prepare('UPDATE ai_logs SET posted_at = ? WHERE posted_at IS NULL AND id IN (SELECT value FROM json_each(?))')
    .bind(new Date(nowMs).toISOString(), JSON.stringify(ids))
    .run();
  return r.meta.changes ?? 0;
}

export type PraiseBoxItem = { id: number; day: string; note: string | null; hidden: boolean; unread: boolean };
export type PraiseBox = { unread: number; total: number; items: PraiseBoxItem[] };

// 받은 칭찬(최근 것부터). 보낸 사람은 돌려주지 않아요.
// 읽음 표시는 칭찬마다 남겨요. 같은 밀리초에 도착한 새 칭찬도 구별해요.
// allUnread: 웹 칭찬함처럼 열면 다 읽음이 되는 곳에서만 안 읽은 칭찬을 limit보다 많아도 다 가져와요(봇 카드는 최근 limit개 그대로).
export async function praiseBox(db: D1Database, userId: string, limit = 20, allUnread = false): Promise<PraiseBox> {
  // 떠났다가 다시 들어온 사람은 다시 들어온 뒤에 받은 칭찬만 보여요
  const fresh = "created_at >= COALESCE((SELECT reset_at FROM members WHERE user_id = ?1), '')";
  // 개수와 목록은 같은 조회에서 정해요. 둘 사이 새 칭찬이 오면, 먼저 센 개수만큼만
  // 가져오다가 기존 한마디가 목록에서 밀려난 채 읽음 처리될 수 있어요.
  const rows = await db
    .prepare(`WITH inbox AS (
      SELECT rowid AS id, day, note, note_hidden, created_at, read_at,
        COUNT(*) OVER () AS total,
        SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) OVER () AS unread_count
      FROM praises WHERE to_id = ?1 AND ${fresh}
    )
    SELECT * FROM inbox
    WHERE (?3 AND read_at IS NULL) OR id IN (SELECT id FROM inbox ORDER BY created_at DESC, id DESC LIMIT ?2)
    ORDER BY created_at DESC, id DESC`)
    .bind(userId, limit, allUnread ? 1 : 0)
    .all<{ id: number; day: string; note: string | null; note_hidden: number; created_at: string; read_at: string | null; total: number; unread_count: number }>();
  const counts = rows.results[0];
  return {
    unread: Number(counts?.unread_count ?? 0),
    total: Number(counts?.total ?? 0),
    items: rows.results.map((r) => ({
      id: Number(r.id),
      day: r.day,
      note: r.note_hidden ? null : r.note,
      hidden: r.note_hidden === 1,
      unread: r.read_at === null,
    })),
  };
}

// 이번 칭찬함에 실제로 담은 번호만 읽음으로 표시해요.
export async function markPraiseSeen(db: D1Database, userId: string, nowMs: number, ids: readonly number[]): Promise<void> {
  const t = new Date(nowMs).toISOString();
  await db
    .prepare(
      `INSERT INTO profiles (user_id, praise_seen_at, updated_at)
       SELECT ?1, ?2, ?2 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
       ON CONFLICT (user_id) DO UPDATE SET praise_seen_at = excluded.praise_seen_at
       WHERE profiles.praise_seen_at IS NULL OR profiles.praise_seen_at < excluded.praise_seen_at`,
    )
    .bind(userId, t)
    .run();
  if (!ids.length) return;
  await db.prepare(`UPDATE praises SET read_at = ?2 WHERE to_id = ?1 AND read_at IS NULL
      AND rowid IN (SELECT value FROM json_each(?3)) AND substr(created_at, 1, 24) <= ?2
      AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)`)
    .bind(userId, t, JSON.stringify(ids)).run();
}

// 받은 사람만 자기 칭찬의 한마디를 숨길 수 있어요
export async function hidePraiseNote(db: D1Database, userId: string, id: number): Promise<boolean> {
  const res = await db.prepare('UPDATE praises SET note_hidden = 1 WHERE rowid = ? AND to_id = ? AND note IS NOT NULL').bind(id, userId).run();
  return (res.meta?.changes ?? 0) > 0;
}

// "11월 12일"
export function praiseDayLabel(day: string): string {
  const m = day.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : day;
}
