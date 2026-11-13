import { askAi } from './ai';

// 같이 배정되지 않기: 멤버가 "다시 같은 팀에 배정되고 싶지 않은 사람"과 사유를 적으면,
// Workers AI(무료 사용량)가 사유를 한 번 검토하고, 하리보봇이 비공개 채널에 올려 나리가 [승인]/[반려]를 눌러요.
// AI가 장난·내용 없음으로 거른 요청(ai_rejected)도 채널에 올라가고, 나리가 [승인]으로 뒤집을 수 있어요.
// 승인된 짝은 다음 팀 짜기와 시즌 중간 합류에서 같은 팀에 넣지 않아요. 기간은 없어요(출시 초기화 때 다시 시작).
// 상대에게는 어떤 알림도 가지 않아요.
// 한 사람이 제외할 수 있는 사람은 최대 3명(검토 중 + 승인된 것). 잘못 눌렀거나 다시 같이 놀고 싶으면
// 빙고 화면에서 [풀기]를 눌러 바로 지울 수 있어요(승인 없이). 봇 메시지는 나리가 버튼을 누를 때 "지워졌어요"로 닫혀요.

export const BLOCK_MAX_PENDING = 3;
export const BLOCK_REASON_MAX = 500;

export const BLOCK_QUESTION = '다시 같은 판에 배정된다고 생각하면, 뭐가 제일 마음에 걸려요?';
export const BLOCK_HELP = '불편했던 순간이나 다시 겪고 싶지 않은 일을 말할 수 있는 만큼 적어 주세요.';
// 나리가 정한 안내 문구(한 줄씩 끊어서 보여 줘요)
export const BLOCK_NOTICE = [
  'AI가 적어 준 사유를 검토해 같은 판에 배정할지 판단해요.',
  '너무 단순한 사유는 다시 추천될 수 있어요!',
  '상대에게는 아무 알림도 가지 않아요.',
];
export const BLOCK_LIMIT_NOTICE = `최대 ${BLOCK_MAX_PENDING}명까지 배정을 제외시킬 수 있어요!`;
export const BLOCK_UNDO_NOTICE = '잘못 눌렀거나 다시 같이 게임하고 싶으면 [풀기]를 눌러 주세요. 다음 팀 짜기부터 다시 같은 팀이 될 수 있어요.';
export const BLOCK_MORE = '한 문장만 더 적어 줄래요? 어떤 일이 있었는지 적어 주면 판단에 도움이 돼요.';

// 내용 없는 답: 이런 말만 있거나(ㅋ·ㅎ·ㅇ·문장부호·띄어쓰기 빼고) 2자 이하
const EMPTY_WORDS = ['그냥', '그냥요', '몰라', '몰라요', '모름', '없어', '없어요', '없음', '별로', '별로요', '싫어서', '싫어서요', '싫음', '비밀', '비밀이요', 'ㅇㅇ'];

export function isEmptyReason(raw: string): boolean {
  const core = raw
    .replace(/[\sㅋㅎㅠㅜ.,!?~…·\-_'"^]/g, '')
    .replace(/^ㅇㅇ$/, '');
  if (core.length <= 2) return true;
  return EMPTY_WORDS.includes(core);
}

// ── AI 검토 ──

export type AiVerdict = { verdict: 'ok' | 'vague' | 'reject'; summary: string };

const AI_PROMPT = `너는 디스코드 게임 모임의 팀 배정 도우미야. 한 멤버가 "다른 멤버와 같은 팀에 배정되고 싶지 않다"며 사유를 적었어.
사유를 읽고 JSON 한 줄로만 답해: {"verdict":"ok|vague|reject","summary":"한국어 한 줄 요약(40자 이내)"}
- ok: 어떤 일이 있었는지, 왜 불편한지 구체적으로 적혀 있음
- vague: 진지해 보이지만 무슨 일이 있었는지 알기 어려움
- reject: 장난, 내용 없음, 상대를 모욕하는 말만 있음
상대의 실명이나 개인정보를 요약에 넣지 마.`;

// AI가 없거나(로컬·바인딩 없음) 실패하거나 무료 사용량이 끝나면 null: 기다리지 않고 규칙 검사만으로 넘겨요.
export async function reviewReason(ai: Ai | undefined, reason: string): Promise<AiVerdict | null> {
  const text = await askAi(ai, AI_PROMPT, reason.slice(0, BLOCK_REASON_MAX), 120, '배정 제외');
  return text ? parseVerdict(text) : null;
}

export function parseVerdict(text: string): AiVerdict | null {
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as { verdict?: unknown; summary?: unknown };
    if (v.verdict !== 'ok' && v.verdict !== 'vague' && v.verdict !== 'reject') return null;
    const summary = typeof v.summary === 'string' ? v.summary.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    return { verdict: v.verdict, summary };
  } catch {
    return null;
  }
}

// ── 신청 ──

export type BlockResult = 'done' | 'self' | 'unknown' | 'dup' | 'limit' | 'empty' | 'more';

// asked: 이미 한 문장 더 적어 달라고 했으면 true(또 묻지 않고 받아요)
export async function requestBlock(
  db: D1Database,
  ai: Ai | undefined,
  fromId: string,
  toId: string,
  rawReason: string,
  asked: boolean,
  nowMs: number,
): Promise<BlockResult> {
  if (fromId === toId) return 'self';
  const reason = rawReason.trim().slice(0, BLOCK_REASON_MAX);
  const [target, mine] = await Promise.all([
    db.prepare('SELECT 1 FROM members WHERE user_id = ? AND active = 1').bind(toId).first(),
    db
      .prepare("SELECT to_id FROM assign_blocks WHERE from_id = ? AND status IN ('pending', 'ai_rejected', 'approved')")
      .bind(fromId)
      .all<{ to_id: string }>(),
  ]);
  if (!target) return 'unknown';
  if (mine.results.some((r) => r.to_id === toId)) return 'dup';
  if (mine.results.length >= BLOCK_MAX_PENDING) return 'limit';
  if (isEmptyReason(reason)) return 'empty';
  const verdict = await reviewReason(ai, reason);
  if (verdict?.verdict === 'vague' && !asked) return 'more';
  const status = verdict?.verdict === 'reject' ? 'ai_rejected' : 'pending';
  const result = await db
    .prepare(`INSERT INTO assign_blocks (from_id, to_id, reason, ai_verdict, ai_summary, status, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
      WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
        AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)
        AND NOT EXISTS (SELECT 1 FROM assign_blocks WHERE from_id = ?1 AND to_id = ?2 AND status IN ('pending', 'ai_rejected', 'approved'))
        AND (SELECT COUNT(*) FROM assign_blocks WHERE from_id = ?1 AND status IN ('pending', 'ai_rejected', 'approved')) < ?8`)
    .bind(fromId, toId, reason, verdict?.verdict ?? null, verdict?.summary || null, status, new Date(nowMs).toISOString(), BLOCK_MAX_PENDING)
    .run();
  if (result.meta.changes) return 'done';
  const active = await db.prepare('SELECT COUNT(*) AS n FROM members WHERE user_id IN (?, ?) AND active = 1').bind(fromId, toId).first<{ n: number }>();
  if (active?.n !== 2) return 'unknown';
  const duplicate = await db.prepare("SELECT 1 FROM assign_blocks WHERE from_id = ? AND to_id = ? AND status IN ('pending', 'ai_rejected', 'approved')")
    .bind(fromId, toId).first();
  return duplicate ? 'dup' : 'limit';
}

// 내가 제외한 사람(검토 중 + 승인). 나리가 반려한 요청은 빼요.
export type MyBlock = { id: number; name: string; state: 'review' | 'approved' };

export async function myBlocks(db: D1Database, userId: string): Promise<MyBlock[]> {
  const { results } = await db
    .prepare(
      `SELECT b.id, b.status, m.display_name AS name FROM assign_blocks b LEFT JOIN members m ON m.user_id = b.to_id
       WHERE b.from_id = ? AND b.status IN ('pending', 'ai_rejected', 'approved') ORDER BY b.id`,
    )
    .bind(userId)
    .all<{ id: number; status: string; name: string | null }>();
  return results.map((r) => ({ id: r.id, name: r.name ?? '알 수 없음', state: r.status === 'approved' ? 'approved' : 'review' }));
}

// 풀기: 내 요청만, 검토 중이든 승인됐든 바로 지워요. 지웠으면 true.
export async function cancelBlock(db: D1Database, userId: string, id: number): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM assign_blocks WHERE id = ? AND from_id = ? AND status IN ('pending', 'ai_rejected', 'approved')")
    .bind(id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

// 신청 상자에서 고를 수 있는 멤버(나 빼고 지금 있는 사람, 이름 순)
export async function blockCandidates(db: D1Database, userId: string): Promise<{ id: string; name: string }[]> {
  const { results } = await db
    .prepare('SELECT user_id, display_name FROM members WHERE active = 1 AND user_id != ? ORDER BY display_name, user_id')
    .bind(userId)
    .all<{ user_id: string; display_name: string }>();
  return results.map((r) => ({ id: r.user_id, name: r.display_name }));
}

// ── 봇 ──

export type PendingBlock = {
  id: number;
  from: { id: string; name: string };
  to: { id: string; name: string };
  reason: string;
  ai_verdict: string | null;
  ai_summary: string | null;
  // pending: 나리가 결정할 요청, ai_rejected: AI가 거른 요청(나리가 승인하면 뒤집혀요)
  status: 'pending' | 'ai_rejected';
  created_at: string;
};

// 아직 채널에 안 올린 요청(오래된 것부터). AI가 거른 요청도 나리가 볼 수 있게 같이 올려요.
export async function listUnpostedBlocks(db: D1Database, limit = 10): Promise<PendingBlock[]> {
  const { results } = await db
    .prepare(
      `SELECT b.id, b.from_id, f.display_name AS from_name, b.to_id, t.display_name AS to_name, b.reason, b.ai_verdict, b.ai_summary, b.status, b.created_at
       FROM assign_blocks b LEFT JOIN members f ON f.user_id = b.from_id LEFT JOIN members t ON t.user_id = b.to_id
       WHERE b.status IN ('pending', 'ai_rejected') AND b.message_id IS NULL ORDER BY b.id LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: number; from_id: string; from_name: string | null; to_id: string; to_name: string | null; reason: string; ai_verdict: string | null; ai_summary: string | null; status: string; created_at: string }>();
  return results.map((r) => ({
    id: r.id,
    from: { id: r.from_id, name: r.from_name ?? '알 수 없음' },
    to: { id: r.to_id, name: r.to_name ?? '알 수 없음' },
    reason: r.reason,
    ai_verdict: r.ai_verdict,
    ai_summary: r.ai_summary,
    status: r.status === 'ai_rejected' ? 'ai_rejected' : 'pending',
    created_at: r.created_at,
  }));
}

// 같은 메시지 번호로 다시 보내도 true예요(봇이 응답을 못 받아 다시 보낼 때 메시지를 지우지 않게요).
export async function markBlockPosted(db: D1Database, id: number, messageId: string, nowMs: number): Promise<boolean> {
  await db
    .prepare('UPDATE assign_blocks SET message_id = ?, posted_at = ? WHERE id = ? AND message_id IS NULL')
    .bind(messageId, new Date(nowMs).toISOString(), id)
    .run();
  const row = await db.prepare('SELECT message_id FROM assign_blocks WHERE id = ?').bind(id).first<{ message_id: string | null }>();
  return row?.message_id === messageId;
}

// 결정은 대기 중이거나 AI가 거른 요청에만 적용돼요(두 번 눌러도 처음 것만). 지금 상태를 돌려줘요.
export async function decideBlock(
  db: D1Database,
  id: number,
  decision: 'approved' | 'rejected',
  by: string,
  nowMs: number,
): Promise<{ applied: boolean; status: string; decided_at: string | null } | null> {
  const t = new Date(nowMs).toISOString();
  const res = await db
    .prepare("UPDATE assign_blocks SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status IN ('pending', 'ai_rejected')")
    .bind(decision, t, by, id)
    .run();
  const row = await db.prepare('SELECT status, decided_at FROM assign_blocks WHERE id = ?').bind(id).first<{ status: string; decided_at: string | null }>();
  if (!row) return null;
  return { applied: (res.meta?.changes ?? 0) > 0, status: row.status, decided_at: row.decided_at };
}

// ── 팀 짜기 ──

export const blockKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

// 승인된 짝(서로 같은 팀에 넣지 않아요)
export async function approvedBlocks(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT from_id, to_id FROM assign_blocks WHERE status = 'approved'").all<{ from_id: string; to_id: string }>();
  return new Set(results.map((r) => blockKey(r.from_id, r.to_id)));
}

// 같은 팀에 승인된 짝이 있으면 다른 팀 사람과 한 명씩 바꿔요.
// 바꾼 뒤 두 팀의 막힌 짝 수가 줄어들 때만 바꿔요(한 팀에 짝이 여럿이어도 하나씩 풀려요).
// keep(팀원 목록)이 false가 되는 바꾸기는 하지 않아요(팀 퀘스트 짝 같은 다른 조건을 지키려고).
export function separateBlocked(
  plan: Map<string, number>,
  blocked: Set<string>,
  keep: (ids: string[]) => boolean = () => true,
): Map<string, number> {
  if (!blocked.size) return plan;
  const members = (no: number) => [...plan].filter(([, g]) => g === no).map(([id]) => id);
  const clashes = (ids: string[]) => {
    let n = 0;
    ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => blocked.has(blockKey(a, b)) && n++));
    return n;
  };
  const ids = [...plan.keys()].sort();
  for (let round = 0; round < 6; round++) {
    let moved = false;
    for (const x of ids) {
      const no = plan.get(x)!;
      const mine = members(no);
      if (!mine.some((y) => y !== x && blocked.has(blockKey(x, y)))) continue;
      const mineBefore = clashes(mine);
      for (const y of ids) {
        const other = plan.get(y)!;
        if (other === no) continue;
        const theirs = members(other);
        const a = [...mine.filter((u) => u !== x), y];
        const b = [...theirs.filter((u) => u !== y), x];
        if (clashes(a) + clashes(b) >= mineBefore + clashes(theirs) || !keep(a) || !keep(b)) continue;
        plan.set(x, other);
        plan.set(y, no);
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return plan;
}
