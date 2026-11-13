import { characterUrl } from './character';
import { gambleMyRanks, gambleRanks } from './gamble-db';
import { seasonAt } from './team';

// 순위 메뉴(/rank): 도감·빙고(젤리피)·원정대·사건파일·겜블장. 지금 서버에 있는 멤버만, 3위까지 + 내 순위.
// 시상대에는 멤버 캐릭터 그림(나리 그림)을 같이 보여 줘요.

export type PodiumRow = { rank: number; name: string; value: number; char: string | null };
export type Podium = { top: PodiumRow[]; me: PodiumRow | null };

export const PODIUM_SIZE = 3;

type Raw = { user_id: string; name: string | null; value: number; character_id?: string | null; deco_id?: string | null };

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

async function rows(db: D1Database, sql: string, ...binds: unknown[]): Promise<Raw[]> {
  const { results } = await db.prepare(sql).bind(...binds).all<Raw>();
  return results.filter((r) => r.value > 0);
}

const WHO = `m.display_name AS name, p.character_id, p.deco_id`;

export type Rankings = {
  dogam: Podium; // 모은 도감 카드 수(지금 있는 멤버 카드만)
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
      `SELECT c.owner_id AS user_id, ${WHO}, COUNT(*) AS value FROM cards c
       JOIN members m ON m.user_id = c.owner_id AND m.active = 1
       JOIN members t ON t.user_id = c.target_id AND t.active = 1
       LEFT JOIN profiles p ON p.user_id = c.owner_id
       WHERE c.owner_id != c.target_id GROUP BY c.owner_id ORDER BY value DESC, MAX(c.first_met) ASC, c.owner_id`,
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
