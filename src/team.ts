// 하리보 빙고의 팀 퀘스트(빙고 가운데 칸), 서버 퀘스트(초록하리보 납치 대소동!), 젤리피 기록.
// 신청·인증·관리자 확인은 없어요. 봇이 보내는 통화방 1분 기록으로 저절로 세요.
import { kstParts, type Season } from './season';
import { seasonLabel, seasonResultAlerts } from './alerts';
import { fallbackWeek } from './bingo';

const DAY_MS = 86_400_000;

// 팀 짜기에서 "주로 노는 시간대"를 볼 때 시즌 시작 전 이만큼의 기록을 봐요
export const TEAM_PRIOR_DAYS = 14;
// 팀 퀘스트(나리 2026-11-21, 매주 팀): 이번 시즌 같은 통화방에서 합쳐서 TEAM_GOAL_MIN분 이상 함께한 팀원이
// 한 명이라도 있으면 나는 달성, 팀에서 TEAM_TARGET명이 달성하면 팀 완료.
// (11/17~11/20 규칙 "팀 절반과 각각 30분, 절반 달성"은 한 팀도 못 깼어요.)
export const TEAM_GOAL_MIN = 60;
export const TEAM_TARGET = 4;

// 달성에 필요한 "TEAM_GOAL_MIN분 함께한 팀원" 수: 1명(혼자 남은 팀은 0명이라 보너스 칸이에요)
export function matesNeeded(teamSize: number): number {
  return Math.max(0, Math.min(teamSize - 1, 1));
}

// 시즌마다 그 시즌이 시작할 때의 규칙으로 판정해요. 지난 시즌을 다시 볼 때(빙고 다시 확인, 늦은 정산) 새 규칙으로 바뀌지 않게요.
// 2026-11-21 시즌 전: 팀 인원 절반과 각각 30분이면 나는 달성, 팀 절반(최소 2)이 달성하면 팀 완료.
export const TEAM_RULE_FROM = '2026-11-21';
export type TeamRule = { goalMin: number; need: (size: number) => number; target: (size: number) => number };
export const TEAM_RULE: TeamRule = { goalMin: TEAM_GOAL_MIN, need: matesNeeded, target: (n) => Math.min(TEAM_TARGET, n) };
export const OLD_TEAM_RULE: TeamRule = {
  goalMin: 30,
  need: (n) => Math.max(1, Math.min(n - 1, Math.round(n / 2))),
  target: (n) => Math.min(Math.max(2, Math.round(n / 2)), n),
};
export const teamRuleFor = (seasonId: string): TeamRule => (seasonId < TEAM_RULE_FROM ? OLD_TEAM_RULE : TEAM_RULE);
// 초록하리보와 같은 통화방에서 이만큼 함께하면 납치 성공
export const KIDNAP_MIN = 30;

// 보상(시즌 끝에 한 번, 목표를 채웠을 때만, 직접 달성/참여한 사람만)
export const TEAM_JELLY = 3;
export const SERVER_JELLY = 5;
// 젤리피(쓸 수 없는 기록)
export const JP_LINE = 1;
export const JP_FULL = 3;
export const JP_TEAM = 3;
export const JP_SERVER = 2;
// 시즌이 끝나고 늦게 오는 기록을 기다리는 시간(모둠 퀘스트와 같아요)
export const SETTLE_GRACE_MS = 30 * 60 * 1000;

// ── 통화 시간대 ──

export type Slot = 'day' | 'eve' | 'night' | 'dawn';
export function slotOf(hour: number): Slot {
  if (hour >= 18 && hour < 22) return 'eve';
  if (hour >= 22 || hour < 2) return 'night';
  if (hour < 6) return 'dawn';
  return 'day';
}

const isWeekend = (day: string) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

// ── 시즌 시작 전 2주 기록 ──

export type Prior = {
  voiced: Set<string>; // 그 2주에 통화방에 나온 사람
  minutes: Map<string, number>; // "a|b"(a < b) → 같이 통화한 분
  slot: Map<string, string>; // 사람 → 주로 통화한 시간대("주말-night" 같은 꼴)
};

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

export async function loadPrior(db: D1Database, season: Season): Promise<Prior> {
  const cutoffIso = new Date(Date.parse(season.start) - TEAM_PRIOR_DAYS * DAY_MS).toISOString();
  const fromDay = kstParts(cutoffIso).day;
  const toDay = kstParts(season.start).day;
  // 봇이 주기를 못 보낸 동안 쓴 임시 주(id가 w로 시작, bingo_periods에 없어요)도 같이 봐요.
  const tempWeeks: string[] = [];
  for (let ms = Date.parse(cutoffIso); ms < Date.parse(season.start) + 7 * DAY_MS; ms += 7 * DAY_MS) {
    const w = fallbackWeek(ms);
    if (w.start < season.start && w.end > cutoffIso && !tempWeeks.includes(w.id)) tempWeeks.push(w.id);
  }
  const [voice, dayPairs, oldestDay, periodPairs, slots] = await Promise.all([
    db
      .prepare('SELECT DISTINCT user_id FROM member_voice_day WHERE day >= ?1 AND day < ?2 AND minutes > 0')
      .bind(fromDay, toDay)
      .all<{ user_id: string }>(),
    // 하루치 짝 기록(pair_day)이 2주 전까지 남아 있으면 그걸로 정확히 2주만 세요.
    db
      .prepare('SELECT a, b, SUM(minutes) AS minutes FROM pair_day WHERE day >= ?1 AND day < ?2 GROUP BY a, b')
      .bind(fromDay, toDay)
      .all<{ a: string; b: string; minutes: number }>(),
    db.prepare('SELECT MIN(day) AS day FROM pair_day').first<{ day: string | null }>(),
    // 하루치 기록이 아직 2주치가 안 쌓였으면(보관 기간을 늘리기 전 기록) 빙고 기간마다 모아 둔 짝 기록으로 세요.
    // 기간이 2주 경계에 걸쳐 있으면(시즌을 14일이 아닌 길이로 바꾼 경우) 2주 안에 든 만큼만 비율로 세요.
    db
      .prepare(
        `SELECT a, b, CAST(ROUND(SUM(minutes * share)) AS INTEGER) AS minutes FROM (
           SELECT bp.a, bp.b, bp.minutes,
             MAX(0.0, MIN(julianday(p.ends_at), julianday(?1)) - MAX(julianday(p.starts_at), julianday(?2)))
               / MAX(julianday(p.ends_at) - julianday(p.starts_at), 1e-9) AS share
           FROM bingo_pair bp JOIN bingo_periods p ON p.id = bp.week
           WHERE p.starts_at < ?1 AND p.ends_at > ?2
           UNION ALL
           SELECT a, b, minutes, 1.0 AS share FROM bingo_pair WHERE week IN (SELECT value FROM json_each(?3))
         ) GROUP BY a, b`,
      )
      .bind(season.start, cutoffIso, JSON.stringify(tempWeeks))
      .all<{ a: string; b: string; minutes: number }>(),
    db
      .prepare('SELECT user_id, day, slot, minutes FROM member_voice_slot WHERE day >= ?1 AND day < ?2')
      .bind(fromDay, toDay)
      .all<{ user_id: string; day: string; slot: string; minutes: number }>(),
  ]);
  const exact = !!oldestDay?.day && oldestDay.day <= fromDay;
  const pairs = exact ? dayPairs : periodPairs;
  const bySlot = new Map<string, Map<string, number>>();
  for (const r of slots.results) {
    const key = `${isWeekend(r.day) ? '주말' : '평일'}-${r.slot}`;
    const m = bySlot.get(r.user_id) ?? bySlot.set(r.user_id, new Map()).get(r.user_id)!;
    m.set(key, (m.get(key) ?? 0) + r.minutes);
  }
  const slot = new Map<string, string>();
  for (const [u, m] of bySlot) slot.set(u, [...m].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]![0]);
  return {
    voiced: new Set(voice.results.map((r) => r.user_id)),
    minutes: new Map(pairs.results.map((r) => [pairKey(r.a, r.b), r.minutes])),
    slot,
  };
}

const parseGames = (raw: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

// 시즌의 서버 퀘스트 목표를 처음 한 번 정해요(이미 정했으면 아무것도 안 해요).
// 새 시즌은 팀을 만든 바로 뒤에, 이 기능 전에 시작한 시즌은 다음 동기화 때 정해요.
// (예전에는 여기서 팀 퀘스트 짝(team_pairs)도 정했어요. 2026-11-17부터 팀원 누구와든 세서 짝을 정하지 않아요.)
export async function ensureSeasonQuests(db: D1Database, season: Season, nowMs: number): Promise<boolean> {
  if (await db.prepare('SELECT 1 FROM server_quest WHERE season_id = ?').bind(season.id).first()) return false;
  const [members, newbie] = await Promise.all([
    db.prepare('SELECT 1 AS ok FROM season_members WHERE season_id = ? AND left_at IS NULL LIMIT 1').bind(season.id).first<{ ok: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM members WHERE active = 1 AND is_newbie = 1').first<{ n: number }>(),
  ]);
  if (!members) return false;
  const n = newbie?.n ?? 0;
  await db
    .prepare('INSERT OR IGNORE INTO server_quest (season_id, newbies, target, created_at) VALUES (?, ?, ?, ?)')
    .bind(season.id, n, kidnapTarget(n), new Date(nowMs).toISOString())
    .run();
  return true;
}

// 납치할 초록하리보 수 목표: 시즌 시작 때 초록하리보 수의 절반(최소 1)
export function kidnapTarget(newbies: number): number {
  return Math.max(1, Math.round(newbies / 2));
}

// ── 팀 퀘스트 상태 ──

export type TeamProgress = {
  bonus: boolean; // 남은 팀원이 2명보다 적어서 가운데 칸을 저절로 채운 팀
  candidates: string[]; // 지금 남아 있는 팀원
  need: number; // 나는 달성에 필요한 "TEAM_GOAL_MIN분 이상 함께한 팀원" 수
  achievers: string[]; // 그중 달성한 사람
  target: number;
  complete: boolean; // 목표를 채움
};

// 같은 시즌에 나갔다 다시 들어온 사람이 나가기 전에 쌓은 분(season_pair_reset). 키는 "나|상대"예요.
export type PairResets = Map<string, number>;
export const resetKey = (me: string, other: string) => `${me}|${other}`;

// 내 판정에 쓰는 함께한 분: 다시 들어온 사람은 나가기 전 분을 빼요(상대 쪽 판정에는 그대로).
export const myMinutes = (userId: string, other: string, minutes: Map<string, number>, resets: PairResets = new Map()) =>
  Math.max(0, (minutes.get(pairKey(other, userId)) ?? 0) - (resets.get(resetKey(userId, other)) ?? 0));

// TEAM_GOAL_MIN분 이상 함께한 팀원 수(떠난 팀원과 함께한 시간도 이미 함께한 거라 세요)
export function matesOf(userId: string, members: string[], minutes: Map<string, number>, resets: PairResets = new Map(), goalMin = TEAM_GOAL_MIN): number {
  return members.filter((u) => u !== userId && myMinutes(userId, u, minutes, resets) >= goalMin).length;
}

// members: 이 팀에 한 번이라도 있었던 사람(떠난 사람 포함).
// 나는 달성 = TEAM_GOAL_MIN분 이상 함께한 팀원(떠난 팀원과 함께한 것도 세요)이 1명 이상.
// 팀 완료 = TEAM_TARGET명(남은 팀원이 그보다 적으면 남은 팀원 모두)이 달성. 남은 팀원이 2명보다 적으면 보너스 칸.
export function teamProgress(
  members: string[],
  minutes: Map<string, number>,
  left: Set<string>,
  resets: PairResets = new Map(),
  rule: TeamRule = TEAM_RULE,
): TeamProgress {
  const all = [...new Set(members)];
  const candidates = all.filter((u) => !left.has(u)).sort();
  const need = rule.need(candidates.length);
  const achievers = candidates.filter((u) => matesOf(u, all, minutes, resets, rule.goalMin) >= need);
  const bonus = candidates.length < 2;
  const target = bonus ? 0 : rule.target(candidates.length);
  return { bonus, candidates, need, achievers, target, complete: !bonus && achievers.length >= target };
}

// pairs: 팀원 두 사람(a < b)이 이번 시즌에 같은 통화방에서 함께한 분. 화면에서 "누구와 몇 분"을 보여 줄 때 써요.
export type TeamState = TeamProgress & {
  no: number;
  members: { id: string; name: string; left: boolean }[];
  pairs: { a: string; b: string; minutes: number }[];
  resets?: PairResets; // 같은 시즌 재가입자의 나가기 전 분(없으면 빼지 않아요)
  goalMin?: number; // 이 시즌 규칙의 "함께한 분"(없으면 TEAM_GOAL_MIN)
};

// 시즌의 모든 팀 상태(팀이 10개 안팎이라 한 번에 읽어요)
export async function loadTeams(db: D1Database, seasonId: string): Promise<Map<number, TeamState>> {
  const [members, pairs, ready, resetRows] = await Promise.all([
    db
      .prepare(
        `SELECT s.user_id, s.group_no, s.left_at, m.display_name FROM season_members s
         LEFT JOIN members m ON m.user_id = s.user_id WHERE s.season_id = ? ORDER BY s.joined_at, s.user_id`,
      )
      .bind(seasonId)
      .all<{ user_id: string; group_no: number; left_at: string | null; display_name: string | null }>(),
    db
      .prepare('SELECT group_no, a, b, minutes FROM gq_pair WHERE season_id = ?')
      .bind(seasonId)
      .all<{ group_no: number; a: string; b: string; minutes: number }>(),
    // 서버 퀘스트를 아직 안 정했으면 시즌을 막 만든 참이라 팀 퀘스트도 "보너스"로 보면 안 돼요.
    db.prepare('SELECT 1 AS ok FROM server_quest WHERE season_id = ?').bind(seasonId).first<{ ok: number }>(),
    db
      .prepare("SELECT user_id, other, minutes FROM season_pair_reset WHERE season_id = ? AND kind = 'team'")
      .bind(seasonId)
      .all<{ user_id: string; other: string; minutes: number }>(),
  ]);
  const resets: PairResets = new Map(resetRows.results.map((r) => [resetKey(r.user_id, r.other), r.minutes]));
  const minutes = new Map<string, number>();
  for (const r of pairs.results) minutes.set(pairKey(r.a, r.b), (minutes.get(pairKey(r.a, r.b)) ?? 0) + r.minutes);
  const left = new Set(members.results.filter((m) => m.left_at).map((m) => m.user_id));
  const nos = [...new Set(members.results.map((m) => m.group_no))].sort((a, b) => a - b);
  const rule = teamRuleFor(seasonId);
  const out = new Map<number, TeamState>();
  for (const no of nos) {
    out.set(no, {
      no,
      members: members.results
        .filter((m) => m.group_no === no)
        .map((m) => ({ id: m.user_id, name: m.display_name ?? '알 수 없음', left: !!m.left_at })),
      pairs: ready
        ? pairs.results
            .filter((p) => p.group_no === no)
            .map((p) => ({ a: p.a, b: p.b, minutes: minutes.get(pairKey(p.a, p.b)) ?? 0 }))
        : [],
      resets,
      goalMin: rule.goalMin,
      ...(ready
        ? teamProgress(
            members.results.filter((m) => m.group_no === no).map((m) => m.user_id),
            minutes,
            left,
            resets,
            rule,
          )
        : { bonus: false, candidates: [], need: 0, achievers: [], target: 0, complete: false }),
    });
  }
  return out;
}

// 나와 이번 시즌에 함께한 팀원과 분(많이 함께한 순). 떠난 팀원은 함께한 시간이 있을 때만(달성에 세니까) 보여요.
export function myMates(team: TeamState, userId: string): { id: string; name: string; minutes: number; left: boolean }[] {
  const mins = new Map(
    team.pairs
      .filter((p) => p.a === userId || p.b === userId)
      .map((p) => {
        const other = p.a === userId ? p.b : p.a;
        return [other, Math.max(0, p.minutes - (team.resets?.get(resetKey(userId, other)) ?? 0))];
      }),
  );
  return team.members
    .map((m) => ({ id: m.id, name: m.name, minutes: mins.get(m.id) ?? 0, left: m.left }))
    .filter((m) => m.id !== userId && (!m.left || m.minutes > 0))
    .sort((x, y) => y.minutes - x.minutes || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
}

export type MyTeam = 'done' | 'todo' | 'team-done' | 'bonus' | 'none';

// 빙고 가운데 칸: 내가 달성했거나, 우리 팀이 목표를 채웠거나, 보너스 칸이면 채운 칸
export function myTeamState(team: TeamState | undefined, userId: string): MyTeam {
  if (!team || team.members.every((m) => m.id !== userId || m.left)) return 'none';
  if (team.bonus) return 'bonus';
  if (team.achievers.includes(userId)) return 'done';
  return team.complete ? 'team-done' : 'todo';
}
export const centerDone = (s: MyTeam) => s === 'done' || s === 'team-done' || s === 'bonus';

// 이 빙고 기간이 든 시즌
export async function seasonAt(db: D1Database, iso: string): Promise<Season | null> {
  const r = await db
    .prepare('SELECT id, starts_at, ends_at FROM seasons WHERE starts_at <= ?1 AND ends_at > ?1 ORDER BY id DESC LIMIT 1')
    .bind(iso)
    .first<{ id: string; starts_at: string; ends_at: string }>();
  return r ? { id: r.id, start: r.starts_at, end: r.ends_at } : null;
}

// 사람마다 팀 상태(시즌에 팀이 없으면 'none')
export async function teamStatesFor(db: D1Database, seasonId: string | null, userIds: string[]): Promise<Map<string, MyTeam>> {
  const out = new Map(userIds.map((u): [string, MyTeam] => [u, 'none']));
  if (!seasonId || !userIds.length) return out;
  const teams = await loadTeams(db, seasonId);
  for (const team of teams.values()) for (const m of team.members) if (out.has(m.id) && !m.left) out.set(m.id, myTeamState(team, m.id));
  return out;
}

// ── 서버 퀘스트: 초록하리보 납치 대소동! ──

export type ServerQuest = {
  newbies: number; // 시즌 시작 때 초록하리보 수
  target: number;
  kidnapped: string[]; // 납치된 초록하리보
  participants: string[]; // 납치에 참여한 사람(납치된 초록하리보 본인도)
  met: boolean;
};

// rows: 30분 넘게 함께한 초록하리보·상대. 납치 수(서버 진행)는 그대로 세고,
// 같은 시즌에 나갔다 다시 들어온 사람은 나가기 전 분을 빼고도 30분이 넘어야 참여자예요(resets 키: "kidnap|나|초록하리보", "kidnapped|나|상대").
export function serverProgress(
  newbies: number,
  target: number,
  rows: { newbie_id: string; user_id: string; minutes?: number }[],
  resets: Map<string, number> = new Map(),
): ServerQuest {
  const kidnapped = [...new Set(rows.map((r) => r.newbie_id))].sort();
  const left = (key: string, m: number | undefined) => (m ?? KIDNAP_MIN) - (resets.get(key) ?? 0) >= KIDNAP_MIN;
  const participants = [
    ...new Set(
      rows.flatMap((r) => [
        ...(left(`kidnapped|${r.newbie_id}|${r.user_id}`, r.minutes) ? [r.newbie_id] : []),
        ...(left(`kidnap|${r.user_id}|${r.newbie_id}`, r.minutes) ? [r.user_id] : []),
      ]),
    ),
  ].sort();
  return { newbies, target, kidnapped, participants, met: kidnapped.length >= target };
}

export async function loadServerQuest(db: D1Database, seasonId: string): Promise<ServerQuest | null> {
  const [row, { results }, resetRows] = await Promise.all([
    db.prepare('SELECT newbies, target FROM server_quest WHERE season_id = ?').bind(seasonId).first<{ newbies: number; target: number }>(),
    db
      .prepare('SELECT newbie_id, user_id, minutes FROM kidnap_min WHERE season_id = ? AND minutes >= ?')
      .bind(seasonId, KIDNAP_MIN)
      .all<{ newbie_id: string; user_id: string; minutes: number }>(),
    db
      .prepare("SELECT kind, user_id, other, minutes FROM season_pair_reset WHERE season_id = ? AND kind IN ('kidnap', 'kidnapped')")
      .bind(seasonId)
      .all<{ kind: string; user_id: string; other: string; minutes: number }>(),
  ]);
  const resets = new Map(resetRows.results.map((r) => [`${r.kind}|${r.user_id}|${r.other}`, r.minutes]));
  return row ? serverProgress(row.newbies, row.target, results, resets) : null;
}

// 통화방 1분 기록 → 초록하리보와 같이 있던 분(동기화와 같은 트랜잭션, 묶음이 한 번만 반영돼요)
export function kidnapStatements(
  db: D1Database,
  seasonId: string,
  rooms: { members: string[] }[],
  newbie: Set<string>,
): D1PreparedStatement[] {
  const mins = new Map<string, number>();
  for (const r of rooms) {
    const ids = [...new Set(r.members)];
    if (ids.length < 2) continue;
    for (const nb of ids)
      if (newbie.has(nb))
        for (const u of ids) if (u !== nb) mins.set(`${nb}|${u}`, (mins.get(`${nb}|${u}`) ?? 0) + 1);
  }
  const add = db.prepare(
    `INSERT INTO kidnap_min (season_id, newbie_id, user_id, minutes) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (season_id, newbie_id, user_id) DO UPDATE SET minutes = minutes + ?4`,
  );
  return [...mins].map(([k, n]) => {
    const [nb, u] = k.split('|') as [string, string];
    return add.bind(seasonId, nb, u, n);
  });
}

// ── 시즌 끝 보상 ──

// 시즌이 끝나고 SETTLE_GRACE_MS가 지나면 한 번: 팀 목표를 채운 팀의 달성자에게 젤리 3 + 젤리피 3,
// 서버 목표를 채웠으면 참여자에게 젤리 5 + 젤리피 2. 못 채우면 아무도 못 받아요. 지금 서버에 있는 멤버만 받아요.
// 두 번 주지 않게: season_settle에 이번 표시(mark)를 적고, 그 표시가 적힌 때만 보상을 줘요.
export async function settleSeason(db: D1Database, season: Season, nowMs: number): Promise<boolean> {
  if (Date.parse(season.end) + SETTLE_GRACE_MS > nowMs) return false;
  const { results: had } = await db.prepare('SELECT kind FROM season_settle WHERE season_id = ?').bind(season.id).all<{ kind: string }>();
  const done = new Set(had.map((r) => r.kind));
  if (done.has('team') && done.has('server')) return false;
  const [teams, server] = await Promise.all([loadTeams(db, season.id), loadServerQuest(db, season.id)]);
  const t = new Date(nowMs).toISOString();
  const mark = `${t}#${crypto.randomUUID()}`;
  const settle = db.prepare('INSERT OR IGNORE INTO season_settle (season_id, kind, mark, created_at) VALUES (?, ?, ?, ?)');
  const marked = `EXISTS (SELECT 1 FROM season_settle WHERE season_id = ?2 AND kind = ?3 AND mark = ?4)
    AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1
      AND COALESCE(reset_at, '') < (SELECT ends_at FROM seasons WHERE id = ?2))`;
  const jelly = db.prepare(
    `INSERT INTO profiles (user_id, dogam_jelly, updated_at) SELECT ?1, ?5, ?6 WHERE ${marked}
     ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + excluded.dogam_jelly, updated_at = excluded.updated_at`,
  );
  const jp = db.prepare(
    `INSERT OR IGNORE INTO jellypi (user_id, season_id, source, ref, amount, created_at) SELECT ?1, ?2, ?3, ?2, ?5, ?6 WHERE ${marked}`,
  );
  const stmts: D1PreparedStatement[] = [];
  if (!done.has('team')) {
    stmts.push(settle.bind(season.id, 'team', mark, t));
    for (const team of teams.values())
      if (team.complete)
        for (const u of team.achievers) {
          stmts.push(jelly.bind(u, season.id, 'team', mark, TEAM_JELLY, t));
          stmts.push(jp.bind(u, season.id, 'team', mark, JP_TEAM, t));
        }
  }
  if (!done.has('server')) {
    stmts.push(settle.bind(season.id, 'server', mark, t));
    if (server?.met)
      for (const u of server.participants) {
        stmts.push(jelly.bind(u, season.id, 'server', mark, SERVER_JELLY, t));
        stmts.push(jp.bind(u, season.id, 'server', mark, JP_SERVER, t));
      }
  }
  // 결과 알림(웹 🔔). 이번에 정산한 경우에만, 사람마다 한 번만 넣어요.
  if (!done.has('team') || !done.has('server')) {
    const alert = db.prepare(
      `INSERT OR IGNORE INTO alerts (user_id, ref, title, body, created_at) SELECT ?1, ?2, ?3, ?4, ?5
       WHERE EXISTS (SELECT 1 FROM season_settle WHERE season_id = ?6 AND mark = ?7)
         AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1
           AND COALESCE(reset_at, '') < (SELECT ends_at FROM seasons WHERE id = ?6))`,
    );
    const lines = seasonResultAlerts(
      done.has('team') ? [] : [...teams.values()].map((tm) => ({ complete: tm.complete, bonus: tm.bonus, achievers: tm.achievers, members: tm.members })),
      done.has('server') ? null : server ? { met: server.met, participants: server.participants } : null,
      { teamJelly: TEAM_JELLY, teamJp: JP_TEAM, serverJelly: SERVER_JELLY, serverJp: JP_SERVER },
    );
    const title = `지난 시즌 퀘스트 결과 (${seasonLabel(season.start, season.end)})`;
    for (const [u, list] of lines) stmts.push(alert.bind(u, `season:${season.id}`, title, list.join('\n'), t, season.id, mark));
  }
  await db.batch(stmts);
  return true;
}

// 끝난 지 2주 안 됐고 아직 보상을 안 준 시즌들
export async function settleEnded(db: D1Database, nowMs: number): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT id, starts_at, ends_at FROM seasons s WHERE ends_at <= ?1 AND ends_at > ?2
       AND (SELECT COUNT(*) FROM season_settle x WHERE x.season_id = s.id) < 2`,
    )
    .bind(new Date(nowMs - SETTLE_GRACE_MS).toISOString(), new Date(nowMs - 14 * DAY_MS).toISOString())
    .all<{ id: string; starts_at: string; ends_at: string }>();
  for (const r of results) await settleSeason(db, { id: r.id, start: r.starts_at, end: r.ends_at }, nowMs);
}

// ── 젤리피 순위 ──

export type JellypiRow = { rank: number; id: string; name: string; total: number };
export type JellypiRanking = { top: JellypiRow[]; me: JellypiRow | null };

// 많이 모은 순, 같으면 먼저 모은 사람(마지막으로 받은 때가 이른 사람)이 위. 지금 서버에 있는 멤버만.
export async function jellypiRanking(db: D1Database, seasonId: string | null, userId: string, limit = 10): Promise<JellypiRanking> {
  const { results } = await db
    .prepare(
      `SELECT j.user_id, m.display_name, SUM(j.amount) AS total, MAX(j.created_at) AS last FROM jellypi j
       JOIN members m ON m.user_id = j.user_id AND m.active = 1
       WHERE ?1 IS NULL OR j.season_id = ?1 GROUP BY j.user_id HAVING SUM(j.amount) > 0
       ORDER BY total DESC, last ASC, j.user_id`,
    )
    .bind(seasonId)
    .all<{ user_id: string; display_name: string | null; total: number; last: string }>();
  const rows = results.map((r, i): JellypiRow => ({ rank: i + 1, id: r.user_id, name: r.display_name ?? '알 수 없음', total: r.total }));
  return { top: rows.slice(0, limit), me: rows.find((r) => r.id === userId) ?? null };
}

// ── /bingo 화면용 ──

export type BingoExtras = {
  season: Season | null;
  team: TeamState | null; // 내 팀(이번 시즌에 팀이 없으면 null)
  server: ServerQuest | null;
};

export async function bingoExtras(db: D1Database, userId: string, periodStart: string): Promise<BingoExtras> {
  const season = await seasonAt(db, periodStart);
  // 젤리피 순위는 순위 화면(rankings.ts)에서 따로 읽어요. 빙고·팀 패널은 쓰지 않아서 여기서는 안 읽어요.
  const [teams, server] = await Promise.all([
    season ? loadTeams(db, season.id) : Promise.resolve(new Map<number, TeamState>()),
    season ? loadServerQuest(db, season.id) : Promise.resolve(null),
  ]);
  const team = [...teams.values()].find((x) => x.members.some((m) => m.id === userId && !m.left)) ?? null;
  return { season, team, server };
}

// ── 디스코드 고정 패널: 팀 순위 ──

export type TeamRank = { no: number; rank: number; done: number; total: number; size: number; complete: boolean; bonus: boolean };

// 팀 목표를 채운 팀 → 달성 비율이 높은 팀 → 달성한 사람이 많은 팀 순. 보너스 칸 팀(후보가 2명 미만)은 맨 뒤.
export function rankTeams(teams: Iterable<TeamState>): TeamRank[] {
  const rows = [...teams].map((t) => ({
    no: t.no,
    reached: t.achievers.length, // 정렬용(목표를 넘겨 달성한 사람도 세요). 보여 줄 done은 목표까지만.
    done: Math.min(t.achievers.length, t.target),
    total: t.target,
    size: t.members.filter((m) => !m.left).length,
    complete: t.complete,
    bonus: t.bonus,
  }));
  const ratio = (r: (typeof rows)[number]) => (r.total ? r.done / r.total : 0);
  rows.sort((x, y) => Number(x.bonus) - Number(y.bonus) || Number(y.complete) - Number(x.complete) || ratio(y) - ratio(x) || y.reached - x.reached || x.no - y.no);
  return rows.map(({ reached: _, ...r }, i) => ({ ...r, rank: i + 1 }));
}
