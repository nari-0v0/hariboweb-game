import { characterUrl } from './character';
import { expireAllHands, gambleMyRanks, gambleRanks } from './gamble-db';
import { xpForLevel } from './levels';
import { seasonAt } from './team';
import { notTestMember } from './test-accounts';

// 순위 메뉴(/rank): 도감·빙고(젤리피)·원정대·사건파일·겜블장. 지금 서버에 있는 멤버만, 3위까지 + 내 순위.
// 시상대에는 멤버 캐릭터 그림(나리 그림)을 같이 보여 줘요.

export type PodiumRow = { rank: number; name: string; value: number; char: string | null; label?: string[] };
export type Podium = { top: PodiumRow[]; me: PodiumRow | null };

export const PODIUM_SIZE = 3;

type Raw = { user_id: string; name: string | null; value: number; character_id?: string | null; deco_id?: string | null } & Record<string, unknown>;

// 값이 큰 순(같으면 SQL이 정한 순서). 같은 값이면 같은 순위예요.
export function toPodium(rows: Raw[], userId: string, size = PODIUM_SIZE): Podium {
  const ranked: (PodiumRow & { id: string })[] = [];
  rows.forEach((r, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.value === r.value ? prev.rank : i + 1;
    ranked.push({ id: r.user_id, rank, name: r.name ?? '알 수 없음', value: r.value, char: characterUrl(r.character_id, r.user_id, r.deco_id) });
  });
  const strip = ({ rank, name, value, char }: PodiumRow) => ({ rank, name, value, char });
  const mine = ranked.find((r) => r.id === userId);
  return { top: ranked.slice(0, size).map(strip), me: mine ? strip(mine) : null };
}

// 겜블장 순위처럼 이름·값(·그림)만 있는 목록(이미 큰 순): 내 순위 없이 3위까지
export function plainPodium(list: { name: string; value: number; char?: string | null }[]): Podium {
  const p = toPodium(list.map((x, i) => ({ user_id: String(i), name: x.name, value: x.value })), '');
  return { top: p.top.map((r, i) => ({ ...r, char: list[i]?.char ?? null })), me: null };
}

// 순위는 모두에게 같은 목록이라, 서버 하나에서 1분 동안은 읽은 걸 다시 써요(무료 DB 읽기 한도, 2026-11-17).
// 내 순위는 이 목록에서 찾으니 그대로 맞아요. 1분 늦게 바뀔 수는 있어요.
const RANK_CACHE_MS = 60_000;
const rankCache = new WeakMap<D1Database, Map<string, { at: number; rows: Promise<Raw[]> }>>();
async function rows(db: D1Database, sql: string, ...binds: unknown[]): Promise<Raw[]> {
  let byDb = rankCache.get(db);
  if (!byDb) rankCache.set(db, (byDb = new Map()));
  const key = JSON.stringify([sql, binds]);
  const hit = byDb.get(key);
  const now = Date.now();
  if (hit && now - hit.at < RANK_CACHE_MS) return hit.rows;
  const load = db
    .prepare(sql)
    .bind(...binds)
    .all<Raw>()
    .then(({ results }) => results.filter((r) => r.value > 0));
  byDb.set(key, { at: now, rows: load });
  load.catch(() => byDb.delete(key));
  return load;
}

// 높은 레벨 카드 순위(나리 2026-11-19): 가장 높은 단계 카드가 많은 사람이 위, 같으면 다음 단계 카드 수로 비교.
// 단계는 원정대 조건(Lv5·10·15·20·30)에 50·100을 더했어요. Lv5 카드가 없으면 순위에 안 나와요.
export const LEVEL_TIERS = [100, 50, 30, 20, 15, 10, 5] as const;
const tierCol = (t: number) => `t${t}`;
export const TIER_SQL = LEVEL_TIERS.map((t) => `SUM(CASE WHEN c.xp >= ${xpForLevel(t)} THEN 1 ELSE 0 END) AS ${tierCol(t)}`).join(', ');

export function levelPodium(list: Raw[], userId: string, size = PODIUM_SIZE): Podium {
  const keyed = list
    .map((r, i) => ({ r, i, key: LEVEL_TIERS.map((t) => Number(r[tierCol(t)]) || 0) }))
    .filter((x) => x.key.some((n) => n > 0));
  const cmp = (a: number[], b: number[]) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return b[k]! - a[k]!;
    return 0;
  };
  keyed.sort((a, b) => cmp(a.key, b.key) || a.i - b.i);
  const ranked: (PodiumRow & { id: string })[] = [];
  keyed.forEach(({ r, key }, i) => {
    const prev = keyed[i - 1];
    const rank = prev && cmp(prev.key, key) === 0 ? ranked[i - 1]!.rank : i + 1;
    // 가장 높은 단계와, 그보다 카드가 더 많은 바로 아래 단계까지 보여 줘요(같은 최고 단계끼리 순위가 갈린 이유).
    const top = key.findIndex((n) => n > 0);
    const label = [`Lv${LEVEL_TIERS[top]}↑ ${key[top]}장`];
    const next = key.findIndex((n, k) => k > top && n > key[top]!);
    if (next > 0) label.push(`Lv${LEVEL_TIERS[next]}↑ ${key[next]}장`);
    ranked.push({ id: r.user_id, rank, name: r.name ?? '알 수 없음', value: key[top]!, char: characterUrl(r.character_id, r.user_id, r.deco_id), label });
  });
  const strip = ({ rank, name, value, char, label }: PodiumRow) => ({ rank, name, value, char, label });
  const mine = ranked.find((r) => r.id === userId);
  return { top: ranked.slice(0, size).map(strip), me: mine ? strip(mine) : null };
}

const WHO = `m.display_name AS name, p.character_id, p.deco_id`;

export type Rankings = {
  dogam: Podium; // 모은 도감 카드 수(지금 있는 멤버 카드만)
  dogamLevel: Podium; // 높은 레벨 카드를 많이 가진 순(나리 2026-11-19)
  jellypiSeason: Podium;
  jellypiAll: Podium;
  journey: Podium; // 원정대 가장 높이 간 레벨
  escape: Podium; // 해결한 사건 수
  gamble: { chips: Podium; best: Podium; allIn: Podium; seasonTop: { name: string; value: number; char?: string } | null };
};

// tab을 주면 그 탭에 필요한 순위만 읽어요(다른 탭 쿼리가 실패해도 보던 탭은 열려요).
export async function loadRankings(db: D1Database, userId: string, nowMs: number, tab?: 'dogam' | 'bingo' | 'journey' | 'escape' | 'gamble'): Promise<Rankings> {
  const want = (t: NonNullable<typeof tab>) => !tab || tab === t;
  const none = Promise.resolve([] as Raw[]);
  const now = new Date(nowMs).toISOString();
  if (want('gamble')) await expireAllHands(db, now).catch((e) => console.error('지난 카드 21 정산 실패', e));
  const season = await seasonAt(db, now);
  const jellypi = (seasonId: string | null) =>
    rows(
      db,
      `SELECT j.user_id, ${WHO}, SUM(j.amount) AS value FROM jellypi j
       JOIN members m ON m.user_id = j.user_id AND m.active = 1 LEFT JOIN profiles p ON p.user_id = j.user_id
       WHERE ?1 IS NULL OR j.season_id = ?1 GROUP BY j.user_id ORDER BY value DESC, MAX(j.created_at) ASC, j.user_id`,
      seasonId,
    );
  const [dogam, journey, escape, jpSeason, jpAll, gamble, gambleMine] = await Promise.all([
    !want('dogam') ? none : rows(
      db,
      // 높은 레벨 카드 수도 같은 줄에서 같이 세요(카드 표를 두 번 읽지 않게).
      `SELECT c.owner_id AS user_id, ${WHO}, COUNT(*) AS value, ${TIER_SQL} FROM cards c
       JOIN members m ON m.user_id = c.owner_id AND m.active = 1
       JOIN members t ON t.user_id = c.target_id AND t.active = 1
       LEFT JOIN profiles p ON p.user_id = c.owner_id
       WHERE c.owner_id != c.target_id AND ${notTestMember('c.target_id')} GROUP BY c.owner_id ORDER BY value DESC, MAX(c.first_met) ASC, c.owner_id`,
    ),
    // 원정대 화면의 내 최고 기록과 같게, 끝난 판(완주·실패)만 세요. 그만둔 판은 빼요.
    !want('journey') ? none : rows(
      db,
      `SELECT j.user_id, ${WHO}, MAX((j.chapter - 1) * 20 + j.day) AS value FROM journey_runs j
       JOIN members m ON m.user_id = j.user_id AND m.active = 1 LEFT JOIN profiles p ON p.user_id = j.user_id
       WHERE j.day > 0 AND j.status = 'done' GROUP BY j.user_id ORDER BY value DESC, SUM(j.cleared) DESC, j.user_id`,
    ),
    !want('escape') ? none : rows(
      db,
      `SELECT e.user_id, ${WHO}, COUNT(*) AS value FROM escape_rewards e
       JOIN members m ON m.user_id = e.user_id AND m.active = 1 LEFT JOIN profiles p ON p.user_id = e.user_id
       GROUP BY e.user_id ORDER BY value DESC, MAX(e.claimed_at) ASC, e.user_id`,
    ),
    season && want('bingo') ? jellypi(season.id) : none,
    want('bingo') ? jellypi(null) : none,
    want('gamble') ? gambleRanks(db, now) : Promise.resolve([]),
    want('gamble') ? gambleMyRanks(db, userId) : Promise.resolve([]),
  ]);
  const [chips = [], best = [], allIn = [], top = []] = gamble;
  return {
    dogam: toPodium(dogam, userId),
    dogamLevel: levelPodium(dogam, userId),
    jellypiSeason: toPodium(jpSeason, userId),
    jellypiAll: toPodium(jpAll, userId),
    journey: toPodium(journey, userId),
    escape: toPodium(escape, userId),
    gamble: {
      chips: { ...plainPodium(chips), me: gambleMine[0] ?? null },
      best: { ...plainPodium(best), me: gambleMine[1] ?? null },
      allIn: { ...plainPodium(allIn), me: gambleMine[2] ?? null },
      seasonTop: top[0] ?? null,
    },
  };
}
