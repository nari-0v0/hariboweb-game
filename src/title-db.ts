import { buyWithJelly, countOwnedCards, markPurchasesSeen } from './db';
import { FULL_LINE } from './bingo';
import { TITLES, titleById, titleItemId, titleProgress, type Title, type TitleStats } from './titles';

type N = { n: number };

// 칭호 조건에 쓰는 내 기록을 한 번에 읽어요
export async function loadTitleStats(db: D1Database, userId: string, nowIso: string): Promise<TitleStats> {
  const [cards, seasons, clears, bingo, got, gave, own, gamble] = await db.batch([
    db.prepare('SELECT xp, voice_seconds FROM cards WHERE owner_id = ?').bind(userId),
    // 끝난 시즌마다 내가 끝까지 있던 모둠의 퀘스트 수와 깬 수
    db
      .prepare(
        `SELECT sm.season_id, SUM(q.done_at IS NOT NULL) AS done, COUNT(*) AS total
         FROM season_members sm
         JOIN seasons s ON s.id = sm.season_id AND s.ends_at <= ?2
         JOIN season_quests q ON q.season_id = sm.season_id AND q.group_no = sm.group_no
         WHERE sm.user_id = ?1 AND sm.left_at IS NULL
         GROUP BY sm.season_id`,
      )
      .bind(userId, nowIso),
    // 다시 들어온 멤버는 나간 뒤 기록만 세요
    db.prepare("SELECT COUNT(*) AS n FROM season_titles WHERE user_id = ?1 AND created_at >= COALESCE((SELECT reset_at FROM members WHERE user_id = ?1), '')").bind(userId),
    // 다 채운 판 보너스(FULL_LINE)는 줄이 아니라서 따로 세요
    db
      .prepare("SELECT SUM(line != ?2) AS n, SUM(line = ?2) AS full FROM bingo_lines WHERE user_id = ?1 AND created_at >= COALESCE((SELECT reset_at FROM members WHERE user_id = ?1), '')")
      .bind(userId, FULL_LINE),
    db.prepare("SELECT COUNT(*) AS n FROM praises WHERE to_id = ?1 AND created_at >= COALESCE((SELECT reset_at FROM members WHERE user_id = ?1), '')").bind(userId),
    db.prepare("SELECT COUNT(*) AS n FROM praises WHERE from_id = ?1 AND created_at >= COALESCE((SELECT reset_at FROM members WHERE user_id = ?1), '')").bind(userId),
    db.prepare('SELECT solo_xp AS n FROM profiles WHERE user_id = ?').bind(userId),
    db.prepare('SELECT chips, all_in_wins, jackpots, naturals FROM gamble_accounts WHERE user_id = ?').bind(userId),
  ]);
  const cardRows = cards!.results as { xp: number; voice_seconds: number }[];
  const xps = cardRows.map((r) => Number(r.xp));
  const n = (r: D1Result | undefined) => Number((r?.results[0] as N | undefined)?.n ?? 0);
  return {
    gamble: gamble?.results[0] as TitleStats['gamble'],
    bestXp: xps.reduce((a, b) => Math.max(a, b), 0),
    ownXp: n(own),
    voiceSeconds: cardRows.reduce((a, r) => a + Number(r.voice_seconds), 0),
    bingoFull: Number((bingo?.results[0] as { full?: number } | undefined)?.full ?? 0),
    friendXps: xps,
    cards: await countOwnedCards(db, userId),
    seasons: (seasons!.results as { done: number; total: number }[]).map((r) => ({ done: Number(r.done), total: Number(r.total) })),
    fullClears: n(clears),
    bingoLines: n(bingo),
    praiseGot: n(got),
    praiseGave: n(gave),
  };
}

export async function ownedTitles(db: D1Database, userId: string): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT item_id FROM owned_items WHERE user_id = ? AND item_id LIKE 'title:%'`)
    .bind(userId)
    .all<{ item_id: string }>();
  return new Set(results.map((r) => r.item_id.slice(6)));
}

// 조건을 채운 칭호는 얻은 것으로 남겨요(나중에 기록이 줄어도 그대로). 새로 얻은 칭호 id를 돌려줘요.
export async function recordEarnedTitles(db: D1Database, userId: string, stats: TitleStats, owned: Set<string>): Promise<string[]> {
  const fresh = TITLES.filter((t) => t.rule.kind !== 'shop' && !owned.has(t.id) && titleProgress(t, stats).ok).map((t) => t.id);
  if (!fresh.length) return [];
  const t = new Date().toISOString();
  await db.batch(
    fresh.map((id) =>
      db
        .prepare(
          `INSERT INTO owned_items (user_id, item_id, acquired_at)
           SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
           ON CONFLICT DO NOTHING`,
        )
        .bind(userId, titleItemId(id), t),
    ),
  );
  for (const id of fresh) owned.add(id);
  return fresh;
}

export type TitleState = { title_id: string | null; title_applied: string | null; title_note: string | null };

export async function titleState(db: D1Database, userId: string): Promise<TitleState> {
  const row = await db
    .prepare('SELECT title_id, title_applied, title_note FROM profiles WHERE user_id = ?')
    .bind(userId)
    .first<TitleState>();
  return row ?? { title_id: null, title_applied: null, title_note: null };
}

// 칭호 고르기(null이면 떼기). 같은 걸 다시 고르면(다시 붙이기·다시 떼기) 봇이 한 번 더 해 봐요.
// 그때는 붙인 상태를 '?'(모름)로 둬서 봇 목록에 다시 나오게 해요.
export async function equipTitle(db: D1Database, userId: string, titleId: string | null): Promise<void> {
  await db
    .prepare(
      `INSERT INTO profiles (user_id, title_id, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET
         title_applied = CASE WHEN COALESCE(title_id, '') = COALESCE(?2, '') THEN '?' ELSE title_applied END,
         title_id = ?2, title_note = NULL, updated_at = ?3`,
    )
    .bind(userId, titleId, new Date().toISOString())
    .run();
}

// 상점 칭호를 도감 젤리로 사요(젤리 빼기와 칭호 주기를 한 번에)
export async function buyTitle(db: D1Database, userId: string, t: Title): Promise<'done' | 'owned' | 'not_enough_jelly' | 'not_for_sale'> {
  if (t.rule.kind !== 'shop') return 'not_for_sale';
  const result = await buyWithJelly(db, userId, titleItemId(t.id), t.rule.price);
  if (result === 'done') {
    // 결과는 칭호 화면에서 바로 보여 줘요(상점 결과 팝업에 또 뜨지 않게). 이 정리가 실패해도 산 건 산 거예요.
    try {
      const { results } = await db
        .prepare(`SELECT id FROM purchases WHERE user_id = ? AND item_id = ? AND seen_at IS NULL`)
        .bind(userId, titleItemId(t.id))
        .all<{ id: string }>();
      await markPurchasesSeen(db, userId, results.map((r) => r.id));
    } catch (e) {
      console.error('칭호 구매 팝업 정리 실패', e);
    }
  }
  return result;
}

// ── 하리보봇이 닉네임에 붙이기 ─────────────────────────────

export type TitleJob = { user: string; id: string; title: string | null };

export async function listTitleJobs(db: D1Database, limit = 50): Promise<TitleJob[]> {
  // 목록에서 빠진 칭호를 고른 채였으면(닉네임에 이미 붙은 사람도) 고른 것을 비워요. 그러면 봇이 닉네임에서 떼요.
  // 조건에 "지금 목록에 없는 칭호"를 넣어서, 그 사이 새로 고른 칭호는 건드리지 않아요.
  await db
    .prepare(`UPDATE profiles SET title_id = NULL WHERE title_id IS NOT NULL AND title_id NOT IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(TITLES.map((x) => x.id)))
    .run();
  const { results } = await db
    .prepare(
      `SELECT p.user_id, p.title_id FROM profiles p INDEXED BY profiles_title_pending
       JOIN members m ON m.user_id = p.user_id AND m.active = 1
       WHERE COALESCE(p.title_id, '') != COALESCE(p.title_applied, '')
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ user_id: string; title_id: string | null }>();
  return results.map((r) => {
    const t = titleById(r.title_id);
    // 목록에서 빠진 칭호는 떼요
    return t ? { user: r.user_id, id: t.id, title: t.name } : { user: r.user_id, id: '', title: null };
  });
}

export const TITLE_FAIL_REASONS = ['too_long', 'forbidden', 'left'] as const;

// 봇이 붙인(또는 못 붙인) 칭호를 적어요. 그 사이 다른 칭호를 골랐으면 다음 목록에 다시 나와요.
export async function settleTitle(db: D1Database, userId: string, titleId: string, reason: string | null): Promise<boolean> {
  const r = await db
    .prepare('UPDATE profiles SET title_applied = ?2, title_note = ?3 WHERE user_id = ?1')
    .bind(userId, titleId, reason)
    .run();
  return (r.meta.changes ?? 0) > 0;
}
