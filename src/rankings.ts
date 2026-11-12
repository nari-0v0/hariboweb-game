import { gambleRanks } from './gamble-db';
import { jellypiRanking, seasonAt } from './team';

// 순위 메뉴(/rank): 도감·빙고(젤리피)·원정대·사건파일·겜블장. 지금 서버에 있는 멤버만, 3위까지 + 내 순위.

export type PodiumRow = { rank: number; name: string; value: number };
export type Podium = { top: PodiumRow[]; me: PodiumRow | null };

export const PODIUM_SIZE = 3;

type Raw = { user_id: string; name: string | null; value: number };

// 값이 큰 순(같으면 SQL이 정한 순서). 같은 값이면 같은 순위예요.
export function toPodium(rows: Raw[], userId: string, size = PODIUM_SIZE): Podium {
  const ranked: (PodiumRow & { id: string })[] = [];
  rows.forEach((r, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.value === r.value ? prev.rank : i + 1;
    ranked.push({ id: r.user_id, rank, name: r.name ?? '알 수 없음', value: r.value });
  });
  const strip = ({ rank, name, value }: PodiumRow) => ({ rank, name, value });
  const mine = ranked.find((r) => r.id === userId);
  return { top: ranked.slice(0, size).map(strip), me: mine ? strip(mine) : null };
}

// 겜블장 순위처럼 이름과 값만 있는 목록(이미 큰 순): 내 순위 없이 3위까지
export function plainPodium(list: { name: string; value: number }[]): Podium {
  return { top: toPodium(list.map((x, i) => ({ user_id: String(i), name: x.name, value: x.value })), '').top, me: null };
}

async function rows(db: D1Database, sql: string, ...binds: unknown[]): Promise<Raw[]> {
  const { results } = await db.prepare(sql).bind(...binds).all<Raw>();
  return results.filter((r) => r.value > 0);
}

export type Rankings = {
  dogam: Podium; // 모은 도감 카드 수(지금 있는 멤버 카드만)
  jellypiSeason: Podium;
  jellypiAll: Podium;
  journey: Podium; // 원정대 가장 멀리 간 날
  escape: Podium; // 해결한 사건 수
  gamble: { chips: Podium; best: Podium; allIn: Podium; seasonTop: { name: string; value: number } | null };
};

export async function loadRankings(db: D1Database, userId: string, nowMs: number): Promise<Rankings> {
  const now = new Date(nowMs).toISOString();
  const season = await seasonAt(db, now);
  const [dogam, journey, escape, jpSeason, jpAll, gamble] = await Promise.all([
    rows(
      db,
      `SELECT c.owner_id AS user_id, m.display_name AS name, COUNT(*) AS value FROM cards c
       JOIN members m ON m.user_id = c.owner_id AND m.active = 1
       JOIN members t ON t.user_id = c.target_id AND t.active = 1
       WHERE c.owner_id != c.target_id GROUP BY c.owner_id ORDER BY value DESC, MAX(c.first_met) ASC, c.owner_id`,
    ),
    rows(
      db,
      `SELECT j.user_id, m.display_name AS name, MAX((j.chapter - 1) * 20 + j.day) AS value FROM journey_runs j
       JOIN members m ON m.user_id = j.user_id AND m.active = 1
       GROUP BY j.user_id ORDER BY value DESC, SUM(j.cleared) DESC, j.user_id`,
    ),
    rows(
      db,
      `SELECT e.user_id, m.display_name AS name, COUNT(*) AS value FROM escape_rewards e
       JOIN members m ON m.user_id = e.user_id AND m.active = 1
       GROUP BY e.user_id ORDER BY value DESC, MAX(e.claimed_at) ASC, e.user_id`,
    ),
    season ? jellypiRanking(db, season.id, userId, 1000) : Promise.resolve({ top: [], me: null }),
    jellypiRanking(db, null, userId, 1000),
    gambleRanks(db, now),
  ]);
  const jp = (r: Awaited<ReturnType<typeof jellypiRanking>>) =>
    toPodium(r.top.map((x) => ({ user_id: x.id, name: x.name, value: x.total })), userId);
  const [chips = [], best = [], allIn = [], top = []] = gamble;
  return {
    dogam: toPodium(dogam, userId),
    jellypiSeason: jp(jpSeason),
    jellypiAll: jp(jpAll),
    journey: toPodium(journey, userId),
    escape: toPodium(escape, userId),
    gamble: { chips: plainPodium(chips), best: plainPodium(best), allIn: plainPodium(allIn), seasonTop: top[0] ?? null },
  };
}
