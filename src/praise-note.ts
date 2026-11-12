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

// 욕설 단어(띄어쓰기·문장부호·숫자를 빼고 찾아요)
const BAD_WORDS = [
  '씨발', '시발', '씨바', '시바', 'ㅅㅂ', 'ㅆㅂ', '병신', '븅신', 'ㅂㅅ', '개새', '개색', '새끼', 'ㅅㄲ', '좆', 'ㅈ같', '존나', 'ㅈㄴ',
  '지랄', 'ㅈㄹ', '꺼져', '닥쳐', '미친놈', '미친년', '또라이', '등신', '찐따', '느금', '니애미', '느그애미', '애미', '애비', '엠창',
  '죽어', '뒤져', '뒤지', '한남', '한녀', '틀딱', '급식충', '병맛', 'fuck', 'shit', 'bitch',
];

export function hasBadWord(note: string): boolean {
  const core = note.toLowerCase().replace(/[\s0-9.,!?~…·\-_'"^*()[\]{}<>/\\|@#$%&+=:;]/g, '');
  return BAD_WORDS.some((w) => core.includes(w));
}

const AI_PROMPT = `너는 디스코드 게임 모임의 칭찬 한마디 검사기야. 한 멤버가 같이 논 사람에게 칭찬과 함께 보낼 한마디를 적었어.
JSON 한 줄로만 답해: {"verdict":"ok|bad"}
- ok: 칭찬, 고마움, 응원, 장난스럽지만 다정한 말
- bad: 비꼬기, 놀리기, 욕, 모욕, 성적인 말, 개인정보, 칭찬처럼 보이지만 상대를 깎아내리는 말`;

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

// 보낼 한마디. 비꼬기·욕이면 null(칭찬만 전해요). AI가 없거나 실패하면 욕설 단어 검사만 해요.
export async function checkNote(ai: Ai | undefined, raw: unknown): Promise<{ note: string | null; filtered: boolean }> {
  const note = cleanNote(raw);
  if (!note) return { note: null, filtered: false };
  if (hasBadWord(note)) return { note: null, filtered: true };
  const verdict = parseNoteVerdict(await askAi(ai, AI_PROMPT, note, 20, '칭찬 한마디'));
  return verdict === 'bad' ? { note: null, filtered: true } : { note, filtered: false };
}

export type PraiseBoxItem = { id: number; day: string; note: string | null; hidden: boolean; unread: boolean };
export type PraiseBox = { unread: number; total: number; items: PraiseBoxItem[] };

// 받은 칭찬(최근 것부터). 보낸 사람은 돌려주지 않아요.
// created_at은 "ISO 시각#무작위"라서 앞 24자(ISO 시각)만 견줘요.
export async function praiseBox(db: D1Database, userId: string, limit = 20): Promise<PraiseBox> {
  const seen = await db.prepare('SELECT praise_seen_at FROM profiles WHERE user_id = ?').bind(userId).first<{ praise_seen_at: string | null }>();
  const since = seen?.praise_seen_at ?? '';
  const [rows, counts] = await Promise.all([
    db
      .prepare('SELECT rowid AS id, day, note, note_hidden, created_at FROM praises WHERE to_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(userId, limit)
      .all<{ id: number; day: string; note: string | null; note_hidden: number; created_at: string }>(),
    db
      .prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN substr(created_at, 1, 24) > ? THEN 1 ELSE 0 END) AS unread FROM praises WHERE to_id = ?')
      .bind(since, userId)
      .first<{ total: number; unread: number | null }>(),
  ]);
  return {
    unread: Number(counts?.unread ?? 0),
    total: Number(counts?.total ?? 0),
    items: rows.results.map((r) => ({
      id: Number(r.id),
      day: r.day,
      note: r.note_hidden ? null : r.note,
      hidden: r.note_hidden === 1,
      unread: r.created_at.slice(0, 24) > since,
    })),
  };
}

// 칭찬함을 봤어요(안 읽은 개수를 0으로)
export async function markPraiseSeen(db: D1Database, userId: string, nowMs: number): Promise<void> {
  const t = new Date(nowMs).toISOString();
  await db
    .prepare(
      `INSERT INTO profiles (user_id, praise_seen_at, updated_at) VALUES (?1, ?2, ?2)
       ON CONFLICT (user_id) DO UPDATE SET praise_seen_at = excluded.praise_seen_at`,
    )
    .bind(userId, t)
    .run();
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
