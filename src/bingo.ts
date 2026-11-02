// 주간 빙고: 한 주마다 멤버마다 3×3 빙고판. 활동하면 칸이 저절로 채워지고, 한 줄마다 젤리와 경험치를 받아요.
// 신청이나 인증, 관리자 확인은 없어요. 알림도 보내지 않아요(고정 패널과 웹 /bingo에서만 보여요).
import { kstParts, type RoomMinute, type Attendance } from './season';
import { seededRandom, shuffle } from './quests';

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
  { id: 'new', icon: '🆕', stat: 'newFriends', targets: [null, 1, 2], text: (t) => `처음 보는 ${t}명과 통화 30분` },
  { id: 'panel', icon: '🃏', stat: 'panel', targets: [1, null, null], text: () => '패널에서 내 카드 열기' },
  { id: 'web', icon: '🌐', stat: 'web', targets: [1, null, null], text: () => '웹 도감에서 내 카드 보기' },
];

const DIFFS: Diff[] = ['easy', 'normal', 'hard'];
// 9칸: 쉬움 3, 보통 4, 어려움 2
const BOARD_DIFFS: Diff[] = ['easy', 'easy', 'easy', 'normal', 'normal', 'normal', 'normal', 'hard', 'hard'];

export type BoardCell = { def: CellDef; diff: Diff; target: number };

// 주와 멤버로 정해지는 빙고판(같은 주에는 몇 번을 봐도 같아요). 칸마다 다른 종류.
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

export type BingoCellView = { id: string; icon: string; text: string; diff: Diff; value: number; target: number; done: boolean; unit?: 'min' };
export type BingoView = {
  week: Week;
  cells: BingoCellView[];
  lines: number[]; // 채운 줄 번호
  filled: number;
  full: boolean;
  jelly: number; // 이번 주 빙고로 받을(받은) 젤리
  xp: number;
};

export function bingoView(week: Week, userId: string, stats: BingoStats): BingoView {
  const cells = boardFor(week.id, userId).map((c) => {
    const value = stats[c.def.stat];
    return { id: c.def.id, icon: c.def.icon, text: c.def.text(c.target), diff: c.diff, value: Math.min(value, c.target), target: c.target, done: value >= c.target, ...(c.def.unit ? { unit: c.def.unit } : {}) };
  });
  const lines = LINES.flatMap((l, i) => (l.every((x) => cells[x]!.done) ? [i] : []));
  const filled = cells.filter((c) => c.done).length;
  const full = filled === cells.length;
  return { week, cells, lines, filled, full, jelly: lines.length * LINE_JELLY + (full ? FULL_JELLY : 0), xp: lines.length * LINE_XP };
}

// ── 봇 기록 모으기(동기화와 같은 트랜잭션) ──

// 통화방 1분 기록과 출석을 주·사람·날로 모아 더해요. 묶음이 한 번만 반영되니까 두 번 세지 않아요.
// 어느 주·사람이 바뀌었는지도 돌려줘요(동기화 뒤에 보상을 확인하려고).
export function bingoStatements(
  db: D1Database,
  rooms: RoomMinute[],
  attendance: Attendance[],
): { stmts: D1PreparedStatement[]; touched: Map<string, Set<string>> } {
  const day = new Map<string, { minutes: number; crowd: number; night: number; attended: number }>();
  const pairs = new Map<string, number>();
  const touched = new Map<string, Set<string>>();
  const touch = (week: string, u: string) => (touched.get(week) ?? touched.set(week, new Set()).get(week)!).add(u);
  const dayRow = (k: string) => day.get(k) ?? day.set(k, { minutes: 0, crowd: 0, night: 0, attended: 0 }).get(k)!;
  for (const r of rooms) {
    const ids = [...new Set(r.members)].sort();
    if (ids.length < 2) continue;
    const { day: d, hour } = kstParts(r.at);
    const week = weekOfDay(d).id;
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
      }
  }
  for (const a of attendance) {
    const week = weekOfDay(a.day).id;
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
  return { stmts, touched };
}

// 한 번만 하면 되는 칸(패널에서 내 카드 열기, 웹에서 내 카드 보기)
export async function markFlag(db: D1Database, userId: string, flag: 'panel' | 'web', nowMs: number): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO bingo_flag (week, user_id, flag) VALUES (?, ?, ?)')
    .bind(weekOf(nowMs).id, userId, flag)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

// ── 읽기 ──

// 한 주의 여러 사람 기록을 한 번에 읽어요(무료 요금제는 요청 하나에 D1 질의 50번까지라 사람마다 따로 읽지 않아요).
export async function loadStats(db: D1Database, week: Week, userIds: string[]): Promise<Map<string, BingoStats>> {
  const out = new Map(userIds.map((u) => [u, emptyStats()]));
  if (!userIds.length) return out;
  const ids = JSON.stringify(userIds);
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
           WHERE day >= ?1 AND day <= ?2 AND from_id IN (SELECT value FROM json_each(?3)) GROUP BY from_id
         UNION ALL
         SELECT to_id AS user_id, 'got' AS kind, COUNT(*) AS n FROM praises
           WHERE day >= ?1 AND day <= ?2 AND to_id IN (SELECT value FROM json_each(?3)) GROUP BY to_id`,
      )
      .bind(week.id, lastDay, ids)
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
  const [stats, given] = await Promise.all([
    loadStats(db, week, active),
    db
      .prepare('SELECT user_id, line FROM bingo_lines WHERE week = ?1 AND user_id IN (SELECT value FROM json_each(?2))')
      .bind(week.id, JSON.stringify(active))
      .all<{ user_id: string; line: number }>(),
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
  const stmts: D1PreparedStatement[] = [];
  for (const u of active) {
    const view = bingoView(week, u, stats.get(u)!);
    views.set(u, view);
    const earned = view.full ? [...view.lines, FULL_LINE] : view.lines;
    for (const line of earned) {
      if (had.has(`${u}|${line}`)) continue;
      const full = line === FULL_LINE;
      stmts.push(addLine.bind(week.id, u, line, mark, t));
      stmts.push(reward.bind(u, full ? FULL_JELLY : LINE_JELLY, full ? 0 : LINE_XP, t, week.id, line, mark));
    }
  }
  if (stmts.length) await db.batch(stmts);
  return views;
}

// 이번 주 내 빙고(보는 김에 채운 줄 보상도 줘요)
export async function myBingo(db: D1Database, userId: string, nowMs: number): Promise<BingoView | null> {
  return (await grantBingo(db, weekOf(nowMs), [userId], nowMs)).get(userId) ?? null;
}

// 동기화 뒤: 이번 묶음에서 기록이 바뀐 사람들. 지난 주 기록이 늦게 와도 그 주로 확인해요(한 주 전까지만).
export async function grantTouched(db: D1Database, touched: Map<string, Set<string>>, nowMs: number): Promise<void> {
  const current = weekOf(nowMs);
  const previous = weekOf(nowMs - 7 * DAY_MS);
  for (const w of [current, previous]) {
    const ids = touched.get(w.id);
    if (ids?.size) await grantBingo(db, w, [...ids], nowMs);
  }
}
