// 빙고: 생명력(커뮤니티) 주기마다 멤버마다 3×3 빙고판. 활동하면 칸이 저절로 채워지고, 한 줄마다 젤리와 경험치를 받아요.
// 신청이나 인증, 관리자 확인은 없어요. 알림도 보내지 않아요(고정 패널과 웹 /bingo에서만 보여요).
import { kstParts, type RoomMinute, type Attendance } from './season';
import { seededRandom, shuffle } from './quests';
import { type MyTeam, JP_FULL, JP_LINE, centerDone, seasonAt, teamStatesFor } from './team';

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;

// 한 줄 보상과 9칸 다 채운 보상
export const LINE_JELLY = 1;
export const LINE_XP = 30;
export const FULL_JELLY = 3;
export const FULL_LINE = 8;
// 이번 주 "N명과 같이 통화"에 셀 최소 시간, "처음 보는 사람"과 통화해야 하는 시간, 하루 통화로 칠 시간
const PARTNER_MIN = 10;
const NEW_FRIEND_MIN = 30;
const VOICE_DAY_MIN = 30;

// ── 주 ──

export type Week = { id: string; start: string; end: string };

// 한국 시간 월요일 0시에 시작하는 주
export function weekOf(ms: number): Week {
  const d = new Date(ms + KST_MS);
  const back = (d.getUTCDay() + 6) % 7;
  const mondayKst = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
  const startMs = mondayKst - KST_MS;
  return {
    id: new Date(mondayKst).toISOString().slice(0, 10),
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 7 * DAY_MS).toISOString(),
  };
}

// 한국 날짜(YYYY-MM-DD) → 그 날이 들어 있는 주
export function weekOfDay(day: string): Week {
  return weekOf(Date.parse(`${day}T00:00:00Z`) - KST_MS);
}

// ── 빙고 기간 = 생명력 주기의 절반("이번 주") ──
// 봇이 동기화 때 보내는 주기(season, 2주)를 반으로 나눠 bingo_periods에 적어 두고, 그 기간마다 빙고판이 새로 나와요.
// 그래서 생명력 주기 하나에 빙고판이 2번 나와요.
// 주기를 아직 모르면(봇이 주기를 안 보냈으면) 월요일 기준 주로 대신해요.

export function periodFor(ms: number, periods: Week[]): Week {
  const iso = new Date(ms).toISOString();
  return periods.find((p) => p.start <= iso && iso < p.end) ?? fallbackWeek(ms);
}

// 주기를 모를 때 대신 쓰는 월요일 주. id 앞에 w를 붙여요: 나중에 같은 날 시작하는 진짜 기간(id = 그 날짜)이
// 생겨도 임시 주에 채운 칸·기록을 물려받지 않게요.
export function fallbackWeek(ms: number): Week {
  const w = weekOf(ms);
  return { ...w, id: `w${w.id}` };
}

// 지금과 가까운 주기들(최근 60일 안에 끝난 것부터)
export async function loadPeriods(db: D1Database, nowMs: number): Promise<Week[]> {
  const { results } = await db
    .prepare('SELECT id, starts_at, ends_at FROM bingo_periods WHERE ends_at > ? ORDER BY starts_at DESC LIMIT 20')
    .bind(new Date(nowMs - 60 * DAY_MS).toISOString())
    .all<{ id: string; starts_at: string; ends_at: string }>();
  return results.map((r) => ({ id: r.id, start: r.starts_at, end: r.ends_at }));
}

// 주기 하나 → 앞 절반, 뒤 절반. id는 각 절반이 시작하는 날의 한국 날짜.
export function splitCycle(start: string, end: string): Week[] {
  const s = Date.parse(start);
  const e = Date.parse(end);
  const mid = s + Math.round((e - s) / 2 / 3_600_000) * 3_600_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  return [
    { id: kstParts(iso(s)).day, start: iso(s), end: iso(mid) },
    { id: kstParts(iso(mid)).day, start: iso(mid), end: iso(e) },
  ];
}

export function savePeriod(db: D1Database, p: Week): D1PreparedStatement {
  return db
    .prepare('INSERT INTO bingo_periods (id, starts_at, ends_at) VALUES (?1, ?2, ?3) ON CONFLICT (id) DO UPDATE SET starts_at = ?2, ends_at = ?3')
    .bind(p.id, p.start, p.end);
}

export async function currentPeriod(db: D1Database, nowMs: number): Promise<Week> {
  return periodFor(nowMs, await loadPeriods(db, nowMs));
}

// 출석은 한국 날짜로 와요. 그 날 정오(한국 시간)가 든 기간으로 쳐요.
const dayNoonMs = (day: string) => Date.parse(`${day}T12:00:00Z`) - KST_MS;

const isWeekend = (day: string) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

// ── 칸 ──

export type BingoStats = {
  voice: number; // 다른 사람과 같은 통화방에 있던 분
  crowd: number; // 4명 이상 있던 방에서
  night: number; // 밤 10시~새벽 2시
  weekend: number; // 토·일
  voiceDays: number; // 30분 넘게 통화한 날 수
  attendDays: number;
  partners: number; // 10분 넘게 같이 통화한 사람 수
  bestPair: number; // 한 사람과 제일 오래 통화한 분
  newFriends: number; // 이번 주에 처음 만나서 30분 넘게 통화한 사람 수
  praiseGiven: number;
  praiseGot: number;
  panel: number;
  web: number;
};

export const emptyStats = (): BingoStats => ({
  voice: 0, crowd: 0, night: 0, weekend: 0, voiceDays: 0, attendDays: 0, partners: 0,
  bestPair: 0, newFriends: 0, praiseGiven: 0, praiseGot: 0, panel: 0, web: 0,
});

export type Diff = 'easy' | 'normal' | 'hard';
type CellDef = {
  id: string;
  icon: string;
  stat: keyof BingoStats;
  // 쉬움·보통·어려움 목표(null이면 그 난이도로는 안 나와요)
  targets: [number | null, number | null, number | null];
  text: (target: number) => string;
  unit?: 'min';
};

const time = (min: number) => (min % 60 === 0 ? `${min / 60}시간` : min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간 ${min % 60}분`);

// 내전은 쉬는 중(2026-11 ~ 약 2달)이라 칸에 넣지 않아요.
export const CELLS: CellDef[] = [
  { id: 'voice', icon: '🎧', stat: 'voice', targets: [60, 180, 420], text: (t) => `통화 ${time(t)}`, unit: 'min' },
  { id: 'attend', icon: '📅', stat: 'attendDays', targets: [2, 4, 6], text: (t) => `출석 ${t}일` },
  { id: 'praise', icon: '💛', stat: 'praiseGiven', targets: [1, 3, 6], text: (t) => `칭찬 ${t}번 주기` },
  { id: 'praised', icon: '🎁', stat: 'praiseGot', targets: [null, 1, 3], text: (t) => `칭찬 ${t}번 받기` },
  { id: 'partners', icon: '👋', stat: 'partners', targets: [2, 4, 7], text: (t) => `${t}명과 같이 통화` },
  { id: 'crowd', icon: '👥', stat: 'crowd', targets: [30, 60, 180], text: (t) => `4명 이상 방에서 ${time(t)}`, unit: 'min' },
  { id: 'night', icon: '🌙', stat: 'night', targets: [30, 60, 180], text: (t) => `밤 10시~새벽 2시 통화 ${time(t)}`, unit: 'min' },
  { id: 'weekend', icon: '🎉', stat: 'weekend', targets: [30, 90, 240], text: (t) => `주말에 통화 ${time(t)}`, unit: 'min' },
  { id: 'days', icon: '🗓️', stat: 'voiceDays', targets: [2, 3, 5], text: (t) => `${t}일 동안 30분씩 통화` },
  { id: 'pair', icon: '🤝', stat: 'bestPair', targets: [60, 120, 300], text: (t) => `한 사람과 ${time(t)} 통화`, unit: 'min' },
  { id: 'panel', icon: '🃏', stat: 'panel', targets: [1, null, null], text: () => '패널에서 내 카드 열기' },
  { id: 'web', icon: '🌐', stat: 'web', targets: [1, null, null], text: () => '웹 도감에서 내 카드 보기' },
];

const DIFFS: Diff[] = ['easy', 'normal', 'hard'];
// 개인 칸 8개: 쉬움 3, 보통 3, 어려움 2. 가운데(4번) 칸은 팀 퀘스트예요.
const BOARD_DIFFS: Diff[] = ['easy', 'easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard'];
export const CENTER = 4;

export type BoardCell = { def: CellDef; diff: Diff; target: number };

// 주와 멤버로 정해지는 개인 칸 8개(같은 주에는 몇 번을 봐도 같아요). 칸마다 다른 종류.
export function boardFor(weekId: string, userId: string): BoardCell[] {
  const rand = seededRandom(`bingo:${weekId}:${userId}`);
  const pool = shuffle(CELLS, rand);
  const used = new Set<string>();
  const cells: BoardCell[] = [];
  // 고를 수 있는 종류가 적은 난이도(어려움 → 보통 → 쉬움)부터 골라요
  for (const diff of [...BOARD_DIFFS].reverse()) {
    const i = DIFFS.indexOf(diff);
    const def = pool.find((d) => !used.has(d.id) && d.targets[i] !== null)!;
    used.add(def.id);
    cells.push({ def, diff, target: def.targets[i]! });
  }
  return shuffle(cells, rand);
}

// 줄: 가로 3, 세로 3, 대각선 2
export const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export type BingoCellView = { id: string; icon: string; text: string; diff: Diff; value: number; target: number; done: boolean; unit?: 'min'; center?: true };
export type BingoView = {
  week: Week;
  cells: BingoCellView[];
  lines: number[]; // 채운 줄 번호
  filled: number;
  full: boolean;
  jelly: number; // 이번 주 빙고로 받을(받은) 젤리
  xp: number;
  team: MyTeam; // 가운데 칸(팀 퀘스트) 내 상태
};

const CENTER_TEXT: Record<MyTeam, string> = {
  done: '팀 퀘스트 달성',
  'team-done': '팀 퀘스트 팀 완료',
  todo: '팀 퀘스트',
  bonus: '보너스 칸',
  none: '팀 퀘스트(팀 없음)',
};

// 가운데 칸: 지난 2주간 10분 미만 통화자와 이번 시즌 30분. 내가 달성했거나 팀이 목표를 채웠거나 보너스 칸이면 채운 칸.
export function centerCell(team: MyTeam): BingoCellView {
  const done = centerDone(team);
  return { id: 'team', icon: '👫', text: CENTER_TEXT[team], diff: 'normal', value: done ? 1 : 0, target: 1, done, center: true };
}

export function bingoView(week: Week, userId: string, stats: BingoStats, team: MyTeam = 'none'): BingoView {
  const cells: BingoCellView[] = boardFor(week.id, userId).map((c) => {
    const value = stats[c.def.stat];
    return { id: c.def.id, icon: c.def.icon, text: c.def.text(c.target), diff: c.diff, value: Math.min(value, c.target), target: c.target, done: value >= c.target, ...(c.def.unit ? { unit: c.def.unit } : {}) };
  });
  cells.splice(CENTER, 0, centerCell(team));
  const lines = LINES.flatMap((l, i) => (l.every((x) => cells[x]!.done) ? [i] : []));
  const filled = cells.filter((c) => c.done).length;
  const full = filled === cells.length;
  return { week, cells, lines, filled, full, jelly: lines.length * LINE_JELLY + (full ? FULL_JELLY : 0), xp: lines.length * LINE_XP, team };
}

// ── 봇 기록 모으기(동기화와 같은 트랜잭션) ──

// 통화방 1분 기록과 출석을 주·사람·날로 모아 더해요. 묶음이 한 번만 반영되니까 두 번 세지 않아요.
// 어느 주·사람이 바뀌었는지도 돌려줘요(동기화 뒤에 보상을 확인하려고).
export function bingoStatements(
  db: D1Database,
  rooms: RoomMinute[],
  attendance: Attendance[],
  periods: Week[] = [],
): { stmts: D1PreparedStatement[]; touched: Map<string, Set<string>>; periods: Map<string, Week> } {
  const used = new Map<string, Week>();
  const periodId = (ms: number) => {
    const p = periodFor(ms, periods);
    used.set(p.id, p);
    return p.id;
  };
  const day = new Map<string, { minutes: number; crowd: number; night: number; attended: number }>();
  const pairs = new Map<string, number>();
  const pairDays = new Map<string, number>();
  const touched = new Map<string, Set<string>>();
  const touch = (week: string, u: string) => (touched.get(week) ?? touched.set(week, new Set()).get(week)!).add(u);
  const dayRow = (k: string) => day.get(k) ?? day.set(k, { minutes: 0, crowd: 0, night: 0, attended: 0 }).get(k)!;
  for (const r of rooms) {
    const ids = [...new Set(r.members)].sort();
    if (ids.length < 2) continue;
    const { day: d, hour } = kstParts(r.at);
    const week = periodId(Date.parse(r.at));
    const night = hour >= 22 || hour < 2;
    for (const u of ids) {
      const row = dayRow(`${week}|${u}|${d}`);
      row.minutes++;
      if (ids.length >= 4) row.crowd++;
      if (night) row.night++;
      touch(week, u);
    }
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = `${week}|${ids[i]}|${ids[j]}`;
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
        const dk = `${d}|${ids[i]}|${ids[j]}`;
        pairDays.set(dk, (pairDays.get(dk) ?? 0) + 1);
      }
  }
  for (const a of attendance) {
    const week = periodId(dayNoonMs(a.day));
    dayRow(`${week}|${a.id}|${a.day}`).attended = 1;
    touch(week, a.id);
  }
  const addDay = db.prepare(
    `INSERT INTO bingo_day (week, user_id, day, minutes, crowd, night, attended) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (week, user_id, day) DO UPDATE SET minutes = minutes + ?4, crowd = crowd + ?5, night = night + ?6,
       attended = MAX(attended, ?7)`,
  );
  const addPair = db.prepare(
    `INSERT INTO bingo_pair (week, a, b, minutes) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (week, a, b) DO UPDATE SET minutes = minutes + ?4`,
  );
  const stmts: D1PreparedStatement[] = [];
  for (const [k, v] of day) {
    const [week, u, d] = k.split('|') as [string, string, string];
    stmts.push(addDay.bind(week, u, d, v.minutes, v.crowd, v.night, v.attended));
  }
  for (const [k, n] of pairs) {
    const [week, a, b] = k.split('|') as [string, string, string];
    stmts.push(addPair.bind(week, a, b, n));
  }
  // 칭찬하기용 하루치 짝(봇이 재시작해도 오늘 같이 논 사람을 알 수 있게)
  const addPairDay = db.prepare(
    `INSERT INTO pair_day (day, a, b, minutes) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (day, a, b) DO UPDATE SET minutes = minutes + ?4`,
  );
  for (const [k, n] of pairDays) {
    const [d, a, b] = k.split('|') as [string, string, string];
    stmts.push(addPairDay.bind(d, a, b, n));
  }
  return { stmts, touched, periods: used };
}

// 한 번만 하면 되는 칸(패널에서 내 카드 열기, 웹에서 내 카드 보기)
export async function markFlag(db: D1Database, userId: string, flag: 'panel' | 'web', nowMs: number): Promise<boolean> {
  const period = await currentPeriod(db, nowMs);
  const res = await db
    .prepare('INSERT OR IGNORE INTO bingo_flag (week, user_id, flag) VALUES (?, ?, ?)')
    .bind(period.id, userId, flag)
    .run();
  const fresh = (res.meta?.changes ?? 0) > 0;
  if (fresh) await grantBingo(db, period, [userId], nowMs);
  return fresh;
}

// ── 읽기 ──

// 한 주의 여러 사람 기록을 한 번에 읽어요(무료 요금제는 요청 하나에 D1 질의 50번까지라 사람마다 따로 읽지 않아요).
export async function loadStats(db: D1Database, week: Week, userIds: string[]): Promise<Map<string, BingoStats>> {
  const out = new Map(userIds.map((u) => [u, emptyStats()]));
  if (!userIds.length) return out;
  const ids = JSON.stringify(userIds);
  const firstDay = kstParts(week.start).day;
  const lastDay = kstParts(new Date(Date.parse(week.end) - 1).toISOString()).day;
  const [days, pairs, newCards, praises, flags] = await Promise.all([
    db
      .prepare('SELECT user_id, day, minutes, crowd, night, attended FROM bingo_day WHERE week = ?1 AND user_id IN (SELECT value FROM json_each(?2))')
      .bind(week.id, ids)
      .all<{ user_id: string; day: string; minutes: number; crowd: number; night: number; attended: number }>(),
    db
      .prepare(
        `SELECT a AS user_id, b AS other, minutes FROM bingo_pair WHERE week = ?1 AND a IN (SELECT value FROM json_each(?2))
         UNION ALL
         SELECT b AS user_id, a AS other, minutes FROM bingo_pair WHERE week = ?1 AND b IN (SELECT value FROM json_each(?2))`,
      )
      .bind(week.id, ids)
      .all<{ user_id: string; other: string; minutes: number }>(),
    db
      .prepare(
        `SELECT owner_id, target_id FROM cards WHERE owner_id IN (SELECT value FROM json_each(?1)) AND first_met >= ?2 AND first_met < ?3`,
      )
      .bind(ids, week.start, week.end)
      .all<{ owner_id: string; target_id: string }>(),
    db
      .prepare(
        `SELECT from_id AS user_id, 'given' AS kind, COUNT(*) AS n FROM praises
           WHERE day >= ?1 AND day <= ?2 AND created_at >= ?4 AND created_at < ?5
             AND from_id IN (SELECT value FROM json_each(?3)) GROUP BY from_id
         UNION ALL
         SELECT to_id AS user_id, 'got' AS kind, COUNT(*) AS n FROM praises
           WHERE day >= ?1 AND day <= ?2 AND created_at >= ?4 AND created_at < ?5
             AND to_id IN (SELECT value FROM json_each(?3)) GROUP BY to_id`,
      )
      // 날짜로 먼저 좁히고(색인), 칭찬한 시각으로 이 빙고판 기간 [시작, 끝) 안에 든 것만 세요.
      // created_at은 "ISO시각#무작위"라서 문자열 비교로 시각 순서가 맞아요.
      .bind(firstDay, lastDay, ids, week.start, week.end)
      .all<{ user_id: string; kind: string; n: number }>(),
    db
      .prepare('SELECT user_id, flag FROM bingo_flag WHERE week = ?1 AND user_id IN (SELECT value FROM json_each(?2))')
      .bind(week.id, ids)
      .all<{ user_id: string; flag: string }>(),
  ]);
  for (const r of days.results) {
    const s = out.get(r.user_id)!;
    s.voice += r.minutes;
    s.crowd += r.crowd;
    s.night += r.night;
    if (isWeekend(r.day)) s.weekend += r.minutes;
    if (r.minutes >= VOICE_DAY_MIN) s.voiceDays++;
    if (r.attended) s.attendDays++;
  }
  const pairMin = new Map<string, number>();
  for (const r of pairs.results) {
    const s = out.get(r.user_id)!;
    pairMin.set(`${r.user_id}|${r.other}`, r.minutes);
    if (r.minutes >= PARTNER_MIN) s.partners++;
    s.bestPair = Math.max(s.bestPair, r.minutes);
  }
  for (const r of newCards.results)
    if ((pairMin.get(`${r.owner_id}|${r.target_id}`) ?? 0) >= NEW_FRIEND_MIN) out.get(r.owner_id)!.newFriends++;
  for (const r of praises.results) {
    const s = out.get(r.user_id)!;
    if (r.kind === 'given') s.praiseGiven = r.n;
    else s.praiseGot = r.n;
  }
  for (const r of flags.results) {
    const s = out.get(r.user_id)!;
    if (r.flag === 'panel') s.panel = 1;
    if (r.flag === 'web') s.web = 1;
  }
  return out;
}

// ── 보상 ──

// 채운 줄마다 젤리와 내 카드 경험치, 9칸을 다 채우면 젤리 더. 지금 서버에 있는 멤버만 받아요.
// 같은 줄을 두 번 받지 않게: 이번 표시(mark)로 줄을 적고, 그 표시가 적힌 때만 보상을 줘요(동시에 확인해도 한 번).
export async function grantBingo(db: D1Database, week: Week, userIds: string[], nowMs: number): Promise<Map<string, BingoView>> {
  const views = new Map<string, BingoView>();
  const active = userIds.length
    ? (
        await db
          .prepare('SELECT user_id FROM members WHERE active = 1 AND user_id IN (SELECT value FROM json_each(?))')
          .bind(JSON.stringify(userIds))
          .all<{ user_id: string }>()
      ).results.map((r) => r.user_id)
    : [];
  if (!active.length) return views;
  const season = await seasonAt(db, week.start);
  const [stats, given, teams] = await Promise.all([
    loadStats(db, week, active),
    db
      .prepare('SELECT user_id, line FROM bingo_lines WHERE week = ?1 AND user_id IN (SELECT value FROM json_each(?2))')
      .bind(week.id, JSON.stringify(active))
      .all<{ user_id: string; line: number }>(),
    teamStatesFor(db, season?.id ?? null, active),
  ]);
  const had = new Set(given.results.map((r) => `${r.user_id}|${r.line}`));
  const t = new Date(nowMs).toISOString();
  const mark = `${t}#${crypto.randomUUID()}`;
  const addLine = db.prepare('INSERT OR IGNORE INTO bingo_lines (week, user_id, line, mark, created_at) VALUES (?, ?, ?, ?, ?)');
  const reward = db.prepare(
    `INSERT INTO profiles (user_id, dogam_jelly, solo_xp, updated_at)
     SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM bingo_lines WHERE week = ?5 AND user_id = ?1 AND line = ?6 AND mark = ?7)
       AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
     ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + excluded.dogam_jelly, solo_xp = solo_xp + excluded.solo_xp,
       updated_at = excluded.updated_at`,
  );
  // 젤리피(쓸 수 없는 기록): 한 줄 1, 9칸 3. 시즌 순위에 쌓여요.
  const addJellypi = db.prepare(
    `INSERT OR IGNORE INTO jellypi (user_id, season_id, source, ref, amount, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM bingo_lines WHERE week = ?7 AND user_id = ?1 AND line = ?8 AND mark = ?9)
       AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)`,
  );
  const seasonId = season?.id ?? week.id;
  const stmts: D1PreparedStatement[] = [];
  for (const u of active) {
    const view = bingoView(week, u, stats.get(u)!, teams.get(u) ?? 'none');
    views.set(u, view);
    const earned = view.full ? [...view.lines, FULL_LINE] : view.lines;
    for (const line of earned) {
      if (had.has(`${u}|${line}`)) continue;
      const full = line === FULL_LINE;
      stmts.push(addLine.bind(week.id, u, line, mark, t));
      stmts.push(reward.bind(u, full ? FULL_JELLY : LINE_JELLY, full ? 0 : LINE_XP, t, week.id, line, mark));
      stmts.push(addJellypi.bind(u, seasonId, full ? 'full' : 'line', `${week.id}:${line}`, full ? JP_FULL : JP_LINE, t, week.id, line, mark));
    }
  }
  if (stmts.length) await db.batch(stmts);
  return views;
}

// 이번 주 내 빙고(보는 김에 채운 줄 보상도 줘요)
// 막 끝난 기간(끝나고 PRIOR_RECHECK_MS 안)의 줄 보상도 다시 확인해요. 동기화 뒤 보상 저장이 한 번 실패해도
// 빙고를 열면 받게요(이미 받은 줄은 다시 주지 않아요).
const PRIOR_RECHECK_MS = 7 * DAY_MS;
export async function myBingo(db: D1Database, userId: string, nowMs: number): Promise<BingoView | null> {
  const periods = await loadPeriods(db, nowMs);
  const now = periodFor(nowMs, periods);
  // 끝난 지 PRIOR_RECHECK_MS 안의 진짜 기간 전부 + 바로 앞 기간(임시 주일 수 있어요). 사이에 임시 주가 끼어도 빠지지 않게.
  const nowIso = new Date(nowMs).toISOString();
  const recent = (p: Week) => {
    const end = p.end < now.start ? p.end : now.start; // 임시 주는 다음 기간이 시작할 때 끝난 걸로 봐요
    return p.id !== now.id && p.start < now.start && end <= nowIso && nowMs - Date.parse(end) < PRIOR_RECHECK_MS;
  };
  const priors = new Map<string, Week>();
  for (const p of [...periods, periodFor(Date.parse(now.start) - 1, periods)]) if (recent(p)) priors.set(p.id, p);
  for (const prior of priors.values()) {
    await grantBingo(db, prior, [userId], nowMs).catch((e) => console.error('지난 빙고 보상 확인 실패', e));
  }
  return (await grantBingo(db, now, [userId], nowMs)).get(userId) ?? null;
}

// 동기화 뒤: 이번 묶음에서 기록이 바뀐 사람들. 늦게 온 기록은 끝난 지 하루 안 된 기간까지만 확인해요.
export async function grantTouched(db: D1Database, touched: Map<string, Set<string>>, periods: Map<string, Week>, nowMs: number): Promise<void> {
  const now = new Date(nowMs).toISOString();
  const cutoff = new Date(nowMs - DAY_MS).toISOString();
  for (const [id, users] of touched) {
    const p = periods.get(id);
    if (!p || p.start > now || p.end <= cutoff || !users.size) continue;
    await grantBingo(db, p, await withTeammates(db, p, users), nowMs);
  }
}

// 기록이 바뀐 사람 + 같은 팀원 전부. 팀원의 통화로 팀이 목표를 채우면 활동이 없던 팀원의
// 가운데 칸도 채워지니까, 그 사람들의 줄 보상도 같이 확인해요(팀이 10명 안팎이라 많지 않아요).
async function withTeammates(db: D1Database, p: Week, users: Set<string>): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT t.user_id FROM season_members t
       JOIN seasons x ON x.id = t.season_id AND x.starts_at <= ?1 AND x.ends_at > ?1
       JOIN season_members s ON s.season_id = t.season_id AND s.group_no = t.group_no
       WHERE t.left_at IS NULL AND s.user_id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(p.start, JSON.stringify([...users]))
    .all<{ user_id: string }>();
  return [...new Set([...users, ...results.map((r) => r.user_id)])];
}

// ── 칭찬하기: 오늘 같이 통화한 사람 ──

export const PAIR_DAY_KEEP_DAYS = 3;

// 오래된 하루치 짝을 지워요(동기화 때마다)
export function prunePairDays(db: D1Database, nowMs: number): D1PreparedStatement {
  const cutoff = kstParts(new Date(nowMs - PAIR_DAY_KEEP_DAYS * DAY_MS).toISOString()).day;
  return db.prepare('DELETE FROM pair_day WHERE day < ?').bind(cutoff);
}

// 그날(한국 날짜) userId와 같이 통화한 사람과 분. 오래 통화한 순.
export async function todayPartners(db: D1Database, userId: string, day: string): Promise<{ id: string; minutes: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT b AS id, minutes FROM pair_day WHERE day = ?1 AND a = ?2
       UNION ALL
       SELECT a AS id, minutes FROM pair_day WHERE day = ?1 AND b = ?2
       ORDER BY minutes DESC, id`,
    )
    .bind(day, userId)
    .all<{ id: string; minutes: number }>();
  return results;
}
