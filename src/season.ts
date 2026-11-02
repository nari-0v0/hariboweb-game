// 시즌 모둠 퀘스트: 모둠 나누기, 봇 기록 모으기, 퀘스트 확인과 보상.
// 시즌 = 커뮤니티 주기(2주). 봇이 동기화 때 시즌 시작·끝을 보내면 처음 한 번 모둠을 만들어요.
import { levelFromXp } from './levels';
import {
  type GroupCtx,
  type Quest,
  type QuestDiff,
  pickQuests,
  QUEST_REWARD,
  questById,
  seededRandom,
  shuffle,
} from './quests';

export const GROUP_SIZE = 10;
// 시즌 시작 전 이 기간 안에 활동한 사람만 모둠에 넣어요
export const ACTIVE_DAYS = 14;
const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;

export function kstParts(iso: string): { day: string; hour: number; minute: number } {
  const d = new Date(Date.parse(iso) + KST_MS);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: Math.floor(Date.parse(iso) / 60_000) };
}

export type Season = { id: string; start: string; end: string };
export function seasonFrom(start: string, end: string): Season {
  return { id: kstParts(start).day, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

// ── 모둠 나누기 ──

export type Person = { id: string; games: string[]; activity: number };

// 10명 안팎으로: 91명 → 9모둠(11·10×8), 95명 → 10모둠(10×5·9×5)
export function groupCount(n: number): number {
  return n < 2 ? 0 : Math.max(1, Math.round(n / GROUP_SIZE));
}

function spread(total: number, groups: number): number[] {
  const base = Math.floor(total / groups);
  const extra = total % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
}

// 게임 역할이 겹치는 사람끼리 랜덤으로 묶되, 많이 노는 사람과 적게 노는 사람을 골고루 섞어요.
// 1) 사람마다 가진 게임 중 제일 많은 사람이 하는 게임을 "대표 게임"으로 정하고,
// 2) 대표 게임 인원에 맞춰 모둠마다 게임을 하나씩 정한 뒤,
// 3) 많이 노는 사람부터 같은 게임 모둠 중 활동량 합이 제일 적은 곳에 넣어요(나눠 주기).
// 모둠 인원 차이는 많아야 1명. 게임 역할이 없는 사람은 모둠마다 고르게 나눠요.
export function planGroups(people: Person[], rand: () => number): Map<string, number> {
  const out = new Map<string, number>();
  const g = groupCount(people.length);
  if (!g) return out;
  const cap = spread(people.length, g);
  const byActivity = (list: Person[]) => shuffle(list, rand).sort((a, b) => b.activity - a.activity);
  const withGames = byActivity(people.filter((p) => p.games.length));
  const without = byActivity(people.filter((p) => !p.games.length));
  // 역할 없는 사람 몫을 먼저 떼어 둬요(모둠마다 고르게)
  const quota = spread(without.length, g);
  const roleCap = cap.map((c, i) => c - quota[i]!);

  // 대표 게임과 모둠별 게임
  const popularity = new Map<string, number>();
  for (const p of withGames) for (const x of new Set(p.games)) popularity.set(x, (popularity.get(x) ?? 0) + 1);
  const main = new Map<string, string>();
  const mainCount = new Map<string, number>();
  for (const p of withGames) {
    const best = [...new Set(p.games)].sort((a, b) => (popularity.get(b) ?? 0) - (popularity.get(a) ?? 0) || (a < b ? -1 : 1))[0]!;
    main.set(p.id, best);
    mainCount.set(best, (mainCount.get(best) ?? 0) + 1);
  }
  const label: (string | null)[] = Array(g).fill(null);
  const totalRole = roleCap.reduce((a, b) => a + b, 0);
  if (totalRole > 0) {
    // 큰 나머지 방식으로 게임마다 모둠 수를 정해요
    const share = [...mainCount].map(([game, n]) => ({ game, exact: (n / totalRole) * g }));
    const counts = new Map(share.map((s) => [s.game, Math.floor(s.exact)]));
    let left = g - [...counts.values()].reduce((a, b) => a + b, 0);
    for (const s of [...share].sort((a, b) => (b.exact % 1) - (a.exact % 1) || (a.game < b.game ? -1 : 1))) {
      if (left <= 0) break;
      counts.set(s.game, counts.get(s.game)! + 1);
      left--;
    }
    // 역할 몫이 큰 모둠부터 인원이 많은 게임에
    const order = [...Array(g).keys()].sort((a, b) => roleCap[b]! - roleCap[a]! || a - b);
    let k = 0;
    for (const [game, n] of [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
      for (let i = 0; i < n && k < g; i++) label[order[k++]!] = game;
  }

  const size = Array<number>(g).fill(0);
  const act = Array<number>(g).fill(0);
  const games = Array.from({ length: g }, () => new Set<string>());
  const place = (p: Person, i: number) => {
    out.set(p.id, i);
    size[i]!++;
    act[i]! += p.activity;
    for (const x of p.games) games[i]!.add(x);
  };
  const lowest = (candidates: number[]) =>
    shuffle(candidates, rand).sort((a, b) => act[a]! - act[b]! || size[a]! - size[b]!)[0]!;
  for (const p of withGames) {
    const open = [...Array(g).keys()].filter((i) => size[i]! < roleCap[i]!);
    if (!open.length) break;
    const mine = open.filter((i) => label[i] === main.get(p.id));
    const labelled = open.filter((i) => label[i] !== null && p.games.includes(label[i]!));
    const sharing = open.filter((i) => p.games.some((x) => games[i]!.has(x)));
    place(p, lowest(mine.length ? mine : labelled.length ? labelled : sharing.length ? sharing : open));
  }
  for (const p of [...withGames.filter((x) => !out.has(x.id)), ...without]) {
    const open = [...Array(g).keys()].filter((i) => size[i]! < cap[i]!);
    place(p, lowest(open));
  }
  return out;
}

// 시즌 중에 새로 활동한 사람: 게임 역할이 겹치는 모둠 중 제일 작은 곳(없으면 그냥 제일 작은 곳)
export function joinGroup(games: string[], groups: { no: number; size: number; games: Set<string> }[], rand: () => number): number | null {
  if (!groups.length) return null;
  const sharing = groups.filter((x) => games.some((g) => x.games.has(g)));
  const pool = sharing.length ? sharing : groups;
  return shuffle(pool, rand).sort((a, b) => a.size - b.size)[0]!.no;
}

const parseGames = (raw: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

// 시즌이 처음이면 모둠과 퀘스트를 만들어요. 만들었으면 true.
export async function ensureSeason(db: D1Database, season: Season, nowMs: number, opts: { scrim?: boolean } = {}): Promise<boolean> {
  const exists = await db.prepare('SELECT 1 FROM seasons WHERE id = ?').bind(season.id).first();
  if (exists) return false;
  const t = new Date(nowMs).toISOString();
  const cutoffIso = new Date(Date.parse(season.start) - ACTIVE_DAYS * DAY_MS).toISOString();
  const cutoffDay = kstParts(cutoffIso).day;
  const { results: rows } = await db
    .prepare(
      `SELECT m.user_id, m.games, m.last_login_at, p.updated_at AS profile_at,
         (SELECT COALESCE(SUM(minutes), 0) FROM member_voice_day v WHERE v.user_id = m.user_id AND v.day >= ?1) AS recent,
         (SELECT COALESCE(SUM(voice_seconds), 0) / 60 FROM cards c WHERE c.owner_id = m.user_id AND c.updated_at >= ?2) AS fallback
       FROM members m LEFT JOIN profiles p ON p.user_id = m.user_id WHERE m.active = 1`,
    )
    .bind(cutoffDay, cutoffIso)
    .all<{ user_id: string; games: string; last_login_at: string | null; profile_at: string | null; recent: number; fallback: number }>();
  // 처음 시즌에는 날마다 통화 기록이 아직 없어서 카드 통화 시간으로 대신 재요
  const useRecent = rows.some((r) => r.recent > 0);
  const people: Person[] = [];
  for (const r of rows) {
    const activity = useRecent ? r.recent : r.fallback;
    const active = activity > 0 || (r.profile_at ?? '') >= cutoffIso || (r.last_login_at ?? '') >= cutoffIso;
    if (active) people.push({ id: r.user_id, games: parseGames(r.games), activity });
  }
  const rand = seededRandom(`season:${season.id}`);
  const plan = planGroups(people, rand);
  // 모둠을 만들 사람이 없으면 시즌을 적지 않고 다음 묶음에서 다시 해 봐요
  if (!plan.size) return false;

  // 지난 시즌에 받았던 퀘스트는 되도록 피해요
  const prev = await db.prepare('SELECT id FROM seasons WHERE id < ? ORDER BY id DESC LIMIT 1').bind(season.id).first<{ id: string }>();
  const hadBefore = new Map<string, string[]>();
  if (prev) {
    const { results } = await db
      .prepare(
        `SELECT m.user_id, q.quest_id FROM season_members m
         JOIN season_quests q ON q.season_id = m.season_id AND q.group_no = m.group_no WHERE m.season_id = ?`,
      )
      .bind(prev.id)
      .all<{ user_id: string; quest_id: string }>();
    for (const r of results) (hadBefore.get(r.user_id) ?? hadBefore.set(r.user_id, []).get(r.user_id)!).push(r.quest_id);
  }

  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?)').bind(season.id, season.start, season.end, t),
  ];
  const addMember = db.prepare(
    'INSERT INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES (?, ?, ?, 1, ?)',
  );
  for (const [id, no] of plan) stmts.push(addMember.bind(season.id, id, no, t));
  const addQuest = db.prepare('INSERT INTO season_quests (season_id, group_no, slot, quest_id) VALUES (?, ?, ?, ?)');
  for (let no = 0; no < groupCount(plan.size); no++) {
    const seen = new Map<string, number>();
    for (const [id, g] of plan) if (g === no) for (const q of hadBefore.get(id) ?? []) seen.set(q, (seen.get(q) ?? 0) + 1);
    pickQuests(rand, { seen, scrim: opts.scrim }).forEach((q, slot) => stmts.push(addQuest.bind(season.id, no, slot, q)));
  }
  stmts.push(...snapshotStatements(db, season.id, null));
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes('UNIQUE') && String(e).includes('seasons')) return false;
    throw e;
  }
  return true;
}

// 시즌 시작(또는 늦게 들어온 때) 카드 경험치를 적어 둬요. userId가 없으면 모두.
function snapshotStatements(db: D1Database, seasonId: string, userId: string | null): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT OR IGNORE INTO season_snap (season_id, owner_id, target_id, xp)
         SELECT ?1, p.user_id, p.user_id, p.solo_xp FROM profiles p
         JOIN season_members s ON s.season_id = ?1 AND s.user_id = p.user_id
         WHERE ?2 IS NULL OR p.user_id = ?2`,
      )
      .bind(seasonId, userId),
    db
      .prepare(
        `INSERT OR IGNORE INTO season_snap (season_id, owner_id, target_id, xp)
         SELECT ?1, c.owner_id, c.target_id, c.xp FROM cards c
         JOIN season_members a ON a.season_id = ?1 AND a.user_id = c.owner_id
         JOIN season_members b ON b.season_id = ?1 AND b.user_id = c.target_id AND b.group_no = a.group_no
         WHERE c.owner_id < c.target_id AND (?2 IS NULL OR c.owner_id = ?2 OR c.target_id = ?2)`,
      )
      .bind(seasonId, userId),
  ];
}

// ── 봇 기록 모으기(동기화와 같은 트랜잭션) ──

export type RoomMinute = { at: string; room: string; members: string[] };
export type ScrimRecord = { id: string; game: string; at: string; members: string[] };
export type Attendance = { id: string; day: string };
export type SeasonPayload = {
  members: { id: string; is_newbie: boolean; games?: string[] }[];
  removed: string[];
  room_minutes: RoomMinute[];
  scrims: ScrimRecord[];
  attendance: Attendance[];
  season: Season | null;
};

type SeasonMemberRow = { user_id: string; group_no: number; left_at: string | null; games: string; is_newbie: number };

// 동기화 묶음에 덧붙일 문장들. 묶음이 한 번만 반영되니까 여기서 더한 분도 한 번만 더해져요.
export async function seasonStatements(db: D1Database, p: SeasonPayload, nowMs: number): Promise<D1PreparedStatement[]> {
  const t = new Date(nowMs).toISOString();
  const stmts: D1PreparedStatement[] = [];

  // 최근 활동량(모둠 섞기용): 2명 이상 있던 통화방의 1분마다
  const voiceDay = new Map<string, number>();
  for (const r of p.room_minutes)
    for (const u of new Set(r.members)) {
      const key = `${u}|${kstParts(r.at).day}`;
      voiceDay.set(key, (voiceDay.get(key) ?? 0) + 1);
    }
  const addVoiceDay = db.prepare(
    `INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id, day) DO UPDATE SET minutes = minutes + ?3`,
  );
  for (const [key, n] of voiceDay) {
    const [u, day] = key.split('|') as [string, string];
    stmts.push(addVoiceDay.bind(u, day, n));
  }

  // 나간 사람은 지금 진행 중인 모든 시즌 모둠에서 빼요(이미 쌓은 기록은 남아요).
  // 시즌 정보가 없는 묶음에도 나간 사람은 올 수 있어서, 시즌 정보와 상관없이 처리해요.
  const removed = new Set(p.removed);
  if (removed.size)
    stmts.push(
      db
        .prepare(
          `UPDATE season_members SET left_at = ?1 WHERE left_at IS NULL AND user_id IN (SELECT value FROM json_each(?2))
           AND season_id IN (SELECT id FROM seasons WHERE ends_at > ?1)`,
        )
        .bind(t, JSON.stringify([...removed])),
    );

  const season = p.season;
  if (!season) return stmts;
  const row = await db.prepare('SELECT 1 FROM seasons WHERE id = ?').bind(season.id).first();
  if (!row) return stmts;
  const startMs = Date.parse(season.start);
  const endMs = Date.parse(season.end);
  const inSeason = (at: string) => {
    const ms = Date.parse(at);
    return ms >= startMs && ms < endMs;
  };

  const { results: rows } = await db
    .prepare(
      `SELECT s.user_id, s.group_no, s.left_at, COALESCE(m.games, '[]') AS games, COALESCE(m.is_newbie, 0) AS is_newbie
       FROM season_members s LEFT JOIN members m ON m.user_id = s.user_id WHERE s.season_id = ?`,
    )
    .bind(season.id)
    .all<SeasonMemberRow>();
  const payloadMember = new Map(p.members.map((m) => [m.id, m]));
  const gamesOf = new Map<string, string[]>();
  const newbie = new Set<string>();
  const group = new Map<string, number>(); // 지금 모둠원 → 모둠
  const known = new Set<string>();
  const departed = new Map<string, number>(); // 시즌 중에 나갔던 사람 → 원래 모둠
  for (const r of rows) {
    known.add(r.user_id);
    gamesOf.set(r.user_id, payloadMember.get(r.user_id)?.games ?? parseGames(r.games));
    if (!r.left_at) group.set(r.user_id, r.group_no);
    else departed.set(r.user_id, r.group_no);
  }
  for (const id of removed) group.delete(id);

  // 기록에 나오는 사람의 신입 여부·게임 역할(이번 묶음 정보가 먼저)
  const seen = new Set<string>();
  for (const r of p.room_minutes) if (inSeason(r.at)) for (const u of r.members) seen.add(u);
  for (const s of p.scrims) if (inSeason(s.at)) for (const u of s.members) seen.add(u);
  for (const a of p.attendance) seen.add(a.id);
  const { results: info } = await db
    .prepare('SELECT user_id, games, is_newbie, active FROM members WHERE user_id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify([...seen]))
    .all<{ user_id: string; games: string; is_newbie: number; active: number }>();
  const activeNow = new Set<string>();
  for (const r of info) {
    if (r.is_newbie) newbie.add(r.user_id);
    if (r.active) activeNow.add(r.user_id);
    if (!gamesOf.has(r.user_id)) gamesOf.set(r.user_id, parseGames(r.games));
  }
  for (const m of p.members) {
    activeNow.add(m.id);
    if (m.is_newbie) newbie.add(m.id);
    else newbie.delete(m.id);
    if (m.games) gamesOf.set(m.id, m.games);
  }

  // 시즌 중에 새로 활동한 사람 → 역할 겹치는 제일 작은 모둠
  const groupNos = new Set(rows.map((r) => r.group_no));
  const rand = seededRandom(`join:${season.id}:${t}`);
  const addLate = db.prepare(
    'INSERT OR IGNORE INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES (?, ?, ?, 0, ?)',
  );
  const rejoin = db.prepare('UPDATE season_members SET left_at = NULL WHERE season_id = ? AND user_id = ?');
  for (const u of [...seen].sort()) {
    if (removed.has(u) || !activeNow.has(u)) continue;
    // 나갔다가 다시 들어온 사람은 원래 모둠으로 돌아가요
    const back = departed.get(u);
    if (back !== undefined) {
      departed.delete(u);
      group.set(u, back);
      stmts.push(rejoin.bind(season.id, u));
      continue;
    }
    if (known.has(u) || !groupNos.size) continue;
    const groups = [...groupNos].map((no) => {
      const ids = [...group].filter(([, g]) => g === no).map(([id]) => id);
      return { no, size: ids.length, games: new Set(ids.flatMap((id) => gamesOf.get(id) ?? [])) };
    });
    const no = joinGroup(gamesOf.get(u) ?? [], groups, rand);
    if (no === null) continue;
    group.set(u, no);
    known.add(u);
    stmts.push(addLate.bind(season.id, u, no, t));
    stmts.push(...snapshotStatements(db, season.id, u));
  }

  // 1분 통화방 기록 → 모둠별로
  const voice = new Map<string, number>();
  const memberDay = new Map<string, number>();
  const pairs = new Map<string, number>();
  const rooms = new Set<string>();
  const newbieMin = new Map<string, number>();
  const runMinutes = new Map<number, Set<number>>();
  const keyOf = (...xs: (string | number)[]) => xs.join('|');
  for (const r of p.room_minutes) {
    if (!inSeason(r.at)) continue;
    const { day, hour, minute } = kstParts(r.at);
    const inRoom = [...new Set(r.members)];
    const byGroup = new Map<number, string[]>();
    for (const u of inRoom) {
      const g = group.get(u);
      if (g !== undefined) (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(u);
    }
    const newbies = inRoom.filter((u) => newbie.has(u));
    for (const [g, gm] of byGroup) {
      if (gm.length < 2) continue;
      const counts = new Map<string, number>();
      for (const u of gm) for (const x of new Set(gamesOf.get(u) ?? [])) counts.set(x, (counts.get(x) ?? 0) + 1);
      const same = Math.max(0, ...counts.values());
      const vk = keyOf(g, day, hour, gm.length, same);
      voice.set(vk, (voice.get(vk) ?? 0) + 1);
      for (const u of gm) memberDay.set(keyOf(g, u, day), (memberDay.get(keyOf(g, u, day)) ?? 0) + 1);
      const sorted = [...gm].sort();
      for (let i = 0; i < sorted.length; i++)
        for (let j = i + 1; j < sorted.length; j++) {
          const pk = keyOf(g, sorted[i]!, sorted[j]!);
          pairs.set(pk, (pairs.get(pk) ?? 0) + 1);
        }
      rooms.add(keyOf(g, r.room));
      (runMinutes.get(g) ?? runMinutes.set(g, new Set()).get(g)!).add(minute);
      for (const nb of newbies)
        for (const u of gm) if (u !== nb) newbieMin.set(keyOf(g, nb, u), (newbieMin.get(keyOf(g, nb, u)) ?? 0) + 1);
    }
    // 모둠원 한 명이라도 신입과 같은 방이면 신입 챙기기로 쳐요
    for (const [g, gm] of byGroup) {
      if (gm.length >= 2) continue;
      for (const nb of newbies) for (const u of gm) if (u !== nb) newbieMin.set(keyOf(g, nb, u), (newbieMin.get(keyOf(g, nb, u)) ?? 0) + 1);
    }
  }
  const sid = season.id;
  const addVoice = db.prepare(
    `INSERT INTO gq_voice (season_id, group_no, day, hour, together, same, minutes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (season_id, group_no, day, hour, together, same) DO UPDATE SET minutes = minutes + ?7`,
  );
  for (const [k, n] of voice) {
    const [g, day, hour, together, same] = k.split('|');
    stmts.push(addVoice.bind(sid, Number(g), day, Number(hour), Number(together), Number(same), n));
  }
  const addMemberDay = db.prepare(
    `INSERT INTO gq_member_day (season_id, group_no, user_id, day, minutes) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (season_id, group_no, user_id, day) DO UPDATE SET minutes = minutes + ?5`,
  );
  for (const [k, n] of memberDay) {
    const [g, u, day] = k.split('|');
    stmts.push(addMemberDay.bind(sid, Number(g), u, day, n));
  }
  const addPair = db.prepare(
    `INSERT INTO gq_pair (season_id, group_no, a, b, minutes) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (season_id, group_no, a, b) DO UPDATE SET minutes = minutes + ?5`,
  );
  for (const [k, n] of pairs) {
    const [g, a, b] = k.split('|');
    stmts.push(addPair.bind(sid, Number(g), a, b, n));
  }
  const addRoom = db.prepare('INSERT OR IGNORE INTO gq_room (season_id, group_no, room_id) VALUES (?, ?, ?)');
  for (const k of rooms) {
    const [g, room] = k.split('|');
    stmts.push(addRoom.bind(sid, Number(g), room));
  }
  const addNewbie = db.prepare(
    `INSERT INTO gq_newbie (season_id, group_no, newbie_id, user_id, minutes) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (season_id, group_no, newbie_id, user_id) DO UPDATE SET minutes = minutes + ?5`,
  );
  for (const [k, n] of newbieMin) {
    const [g, nb, u] = k.split('|');
    stmts.push(addNewbie.bind(sid, Number(g), nb, u, n));
  }

  // 이어서 통화한 시간: 1분씩 이어지면 늘고, 끊기면 다시 1부터
  if (runMinutes.size) {
    const { results: runs } = await db
      .prepare('SELECT group_no, last_minute, current, best FROM gq_run WHERE season_id = ?')
      .bind(sid)
      .all<{ group_no: number; last_minute: string; current: number; best: number }>();
    const prevRun = new Map(runs.map((r) => [r.group_no, r]));
    const setRun = db.prepare(
      `INSERT INTO gq_run (season_id, group_no, last_minute, current, best) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (season_id, group_no) DO UPDATE SET last_minute = ?3, current = ?4, best = MAX(best, ?5)`,
    );
    for (const [g, set] of runMinutes) {
      const before = prevRun.get(g);
      let last = before ? Number(before.last_minute) : -2;
      let current = before?.current ?? 0;
      let best = before?.best ?? 0;
      for (const m of [...set].sort((a, b) => a - b)) {
        if (m <= last) continue; // 이미 센 분(늦게 온 묶음)
        current = m === last + 1 ? current + 1 : 1;
        last = m;
        best = Math.max(best, current);
      }
      stmts.push(setRun.bind(sid, g, String(last), current, best));
    }
  }

  // 내전(참가만 하면 세요)
  const addScrim = db.prepare(
    'INSERT OR IGNORE INTO gq_scrim (season_id, group_no, scrim_id, game, day, members, newbies) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const s of p.scrims) {
    if (!inSeason(s.at)) continue;
    const ids = [...new Set(s.members)];
    const newbies = ids.filter((u) => newbie.has(u)).length;
    const byGroup = new Map<number, string[]>();
    for (const u of ids) {
      const g = group.get(u);
      if (g !== undefined) (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(u);
    }
    for (const [g, gm] of byGroup) stmts.push(addScrim.bind(sid, g, s.id, s.game, kstParts(s.at).day, JSON.stringify(gm), newbies));
  }

  // 출석
  const startDay = season.id;
  const endDay = kstParts(new Date(endMs - 1).toISOString()).day;
  const addAttend = db.prepare('INSERT OR IGNORE INTO gq_attend (season_id, user_id, day) VALUES (?, ?, ?)');
  for (const a of p.attendance)
    if (group.has(a.id) && a.day >= startDay && a.day <= endDay) stmts.push(addAttend.bind(sid, a.id, a.day));

  return stmts;
}

// ── 진행도 계산 ──

export type GroupState = {
  no: number;
  members: { id: string; name: string; start: boolean; left: boolean }[];
  quests: { slot: number; quest: Quest; done_at: string | null }[];
  ctx: GroupCtx;
};

type Rows<T> = Promise<{ results: T[] }>;

// 시즌의 모둠(groupNo가 있으면 그 모둠만) 기록을 읽어 퀘스트 계산용으로 묶어요.
export async function loadGroups(db: D1Database, seasonId: string, groupNo: number | null = null): Promise<{ season: Season; groups: GroupState[] } | null> {
  const s = await db.prepare('SELECT id, starts_at, ends_at FROM seasons WHERE id = ?').bind(seasonId).first<{ id: string; starts_at: string; ends_at: string }>();
  if (!s) return null;
  const season: Season = { id: s.id, start: s.starts_at, end: s.ends_at };
  const q = <T>(sql: string, ...args: unknown[]): Rows<T> => db.prepare(sql).bind(seasonId, groupNo, ...args).all<T>();
  const G = '(?2 IS NULL OR group_no = ?2)';
  const endDay = kstParts(new Date(Date.parse(season.end) - 1).toISOString()).day;
  const [members, quests, voice, memberDay, pairs, rooms, runs, scrims, newbie, attend, praises, cards, newOwners, snaps] = await Promise.all([
    q<{ user_id: string; group_no: number; start_member: number; left_at: string | null; display_name: string | null; last_login_at: string | null; solo_xp: number | null; is_newbie: number | null }>(
      `SELECT s.user_id, s.group_no, s.start_member, s.left_at, m.display_name, m.last_login_at, p.solo_xp, m.is_newbie
       FROM season_members s LEFT JOIN members m ON m.user_id = s.user_id LEFT JOIN profiles p ON p.user_id = s.user_id
       WHERE s.season_id = ?1 AND (?2 IS NULL OR s.group_no = ?2) ORDER BY s.joined_at, s.user_id`,
    ),
    q<{ group_no: number; slot: number; quest_id: string; done_at: string | null }>(`SELECT group_no, slot, quest_id, done_at FROM season_quests WHERE season_id = ?1 AND ${G} ORDER BY slot`),
    q<{ group_no: number; day: string; hour: number; together: number; same: number; minutes: number }>(`SELECT group_no, day, hour, together, same, minutes FROM gq_voice WHERE season_id = ?1 AND ${G}`),
    q<{ group_no: number; user_id: string; day: string; minutes: number }>(`SELECT group_no, user_id, day, minutes FROM gq_member_day WHERE season_id = ?1 AND ${G}`),
    q<{ group_no: number; a: string; b: string; minutes: number }>(`SELECT group_no, a, b, minutes FROM gq_pair WHERE season_id = ?1 AND ${G}`),
    q<{ group_no: number; n: number }>(`SELECT group_no, COUNT(*) AS n FROM gq_room WHERE season_id = ?1 AND ${G} GROUP BY group_no`),
    q<{ group_no: number; best: number }>(`SELECT group_no, best FROM gq_run WHERE season_id = ?1 AND ${G}`),
    q<{ group_no: number; game: string; day: string; members: string; newbies: number }>(`SELECT group_no, game, day, members, newbies FROM gq_scrim WHERE season_id = ?1 AND ${G}`),
    q<{ group_no: number; newbie_id: string; user_id: string; minutes: number }>(`SELECT group_no, newbie_id, user_id, minutes FROM gq_newbie WHERE season_id = ?1 AND ${G}`),
    q<{ user_id: string; day: string }>(
      `SELECT a.user_id, a.day FROM gq_attend a JOIN season_members s ON s.season_id = a.season_id AND s.user_id = a.user_id
       WHERE a.season_id = ?1 AND (?2 IS NULL OR s.group_no = ?2)`,
    ),
    q<{ day: string; from_id: string; to_id: string; to_newbie: number }>(
      `SELECT r.day, r.from_id, r.to_id, COALESCE(m.is_newbie, 0) AS to_newbie FROM praises r
       JOIN season_members a ON a.season_id = ?1 AND a.user_id = r.from_id AND a.left_at IS NULL
       JOIN season_members b ON b.season_id = ?1 AND b.user_id = r.to_id AND b.group_no = a.group_no AND b.left_at IS NULL
       LEFT JOIN members m ON m.user_id = r.to_id
       WHERE r.day >= ?1 AND r.day <= ?3 AND (?2 IS NULL OR a.group_no = ?2)`,
      endDay,
    ),
    q<{ owner_id: string; target_id: string; xp: number; first_met: string }>(
      `SELECT c.owner_id, c.target_id, c.xp, c.first_met FROM cards c
       JOIN season_members a ON a.season_id = ?1 AND a.user_id = c.owner_id AND a.left_at IS NULL
       JOIN season_members b ON b.season_id = ?1 AND b.user_id = c.target_id AND b.group_no = a.group_no AND b.left_at IS NULL
       WHERE c.owner_id < c.target_id AND (?2 IS NULL OR a.group_no = ?2)`,
    ),
    q<{ owner_id: string }>(
      `SELECT DISTINCT c.owner_id FROM cards c JOIN season_members s ON s.season_id = ?1 AND s.user_id = c.owner_id
       WHERE c.first_met >= ?3 AND (?2 IS NULL OR s.group_no = ?2)`,
      season.start,
    ),
    q<{ owner_id: string; target_id: string; xp: number }>(
      `SELECT n.owner_id, n.target_id, n.xp FROM season_snap n JOIN season_members s ON s.season_id = n.season_id AND s.user_id = n.owner_id
       WHERE n.season_id = ?1 AND (?2 IS NULL OR s.group_no = ?2)`,
    ),
  ]);

  const groupOf = new Map(members.results.map((m) => [m.user_id, m.group_no]));
  const snap = new Map(snaps.results.map((r) => [`${r.owner_id}|${r.target_id}`, r.xp]));
  const nos = [...new Set([...members.results.map((m) => m.group_no), ...quests.results.map((x) => x.group_no)])].sort((a, b) => a - b);
  const groups: GroupState[] = nos.map((no) => {
    const ms = members.results.filter((m) => m.group_no === no);
    const current = ms.filter((m) => !m.left_at).map((m) => m.user_id);
    const currentSet = new Set(current);
    const inGroup = <T extends { group_no: number }>(rows: T[]) => rows.filter((r) => r.group_no === no);
    const groupCards = cards.results.filter((c) => groupOf.get(c.owner_id) === no);
    const ctx: GroupCtx = {
      seasonStart: season.id,
      startSize: ms.filter((m) => m.start_member).length,
      current,
      startCurrent: ms.filter((m) => m.start_member && !m.left_at).map((m) => m.user_id),
      voice: inGroup(voice.results),
      memberDay: inGroup(memberDay.results).map((r) => ({ user: r.user_id, day: r.day, minutes: r.minutes })),
      pairs: inGroup(pairs.results),
      rooms: inGroup(rooms.results)[0]?.n ?? 0,
      bestRun: inGroup(runs.results)[0]?.best ?? 0,
      scrims: inGroup(scrims.results).map((r) => ({ game: r.game, day: r.day, members: JSON.parse(r.members) as string[], newbies: r.newbies })),
      newbie: inGroup(newbie.results).map((r) => ({ newbie: r.newbie_id, user: r.user_id, minutes: r.minutes })),
      praises: praises.results
        .filter((r) => groupOf.get(r.from_id) === no)
        .map((r) => ({ from: r.from_id, to: r.to_id, day: r.day, toNewbie: r.to_newbie === 1 })),
      attend: attend.results.filter((r) => groupOf.get(r.user_id) === no).map((r) => ({ user: r.user_id, day: r.day })),
      newCardPairs: groupCards.filter((c) => c.first_met >= season.start).map((c) => `${c.owner_id}|${c.target_id}`),
      newCardOwners: newOwners.results.map((r) => r.owner_id).filter((u) => currentSet.has(u)),
      pairLevels: groupCards.map((c) => ({ from: levelFromXp(snap.get(`${c.owner_id}|${c.target_id}`) ?? 0), now: levelFromXp(c.xp) })),
      ownLevelUp: ms
        .filter((m) => !m.left_at && levelFromXp(m.solo_xp ?? 0) > levelFromXp(snap.get(`${m.user_id}|${m.user_id}`) ?? 0))
        .map((m) => m.user_id),
      loggedIn: ms.filter((m) => !m.left_at && (m.last_login_at ?? '') >= season.start).map((m) => m.user_id),
    };
    return {
      no,
      members: ms.map((m) => ({ id: m.user_id, name: m.display_name ?? '알 수 없음', start: m.start_member === 1, left: !!m.left_at })),
      quests: inGroup(quests.results).flatMap((r) => {
        const quest = questById(r.quest_id);
        return quest ? [{ slot: r.slot, quest, done_at: r.done_at }] : [];
      }),
      ctx,
    };
  });
  return { season, groups };
}

export function questProgress(quest: Quest, ctx: GroupCtx) {
  const target = quest.target(ctx);
  const value = quest.value(ctx);
  return { target, value: Math.min(value, target), done: value >= target };
}

export function seasonTitle(season: Season): string {
  const [, m, d] = season.id.split('-');
  return `${Number(m)}월 ${Number(d)}일 시즌 모둠 완주`;
}

// 다 채운 퀘스트를 깬 것으로 적고, 지금 모둠원에게 젤리를 줘요. 8개를 다 깨면 시즌 칭호.
// 같은 퀘스트를 두 번 깨지 않게: done_at이 비어 있을 때만 이번 표시(mark)를 적고, 그 표시가 있을 때만 젤리를 줘요.
export async function evaluateSeason(db: D1Database, seasonId: string, nowMs: number): Promise<number> {
  const loaded = await loadGroups(db, seasonId);
  if (!loaded) return 0;
  const t = new Date(nowMs).toISOString();
  const mark = `${t}#${crypto.randomUUID()}`;
  const stmts: D1PreparedStatement[] = [];
  let done = 0;
  for (const g of loaded.groups) {
    const finished = g.quests.filter((q) => !q.done_at && questProgress(q.quest, g.ctx).done);
    if (!finished.length) continue;
    for (const q of finished) {
      done++;
      stmts.push(
        db.prepare('UPDATE season_quests SET done_at = ? WHERE season_id = ? AND group_no = ? AND slot = ? AND done_at IS NULL').bind(mark, seasonId, g.no, q.slot),
      );
      stmts.push(
        db
          .prepare(
            `INSERT INTO profiles (user_id, dogam_jelly, updated_at)
             SELECT s.user_id, ?5, ?6 FROM season_members s JOIN members m ON m.user_id = s.user_id AND m.active = 1
             WHERE s.season_id = ?1 AND s.group_no = ?2 AND s.left_at IS NULL
               AND EXISTS (SELECT 1 FROM season_quests WHERE season_id = ?1 AND group_no = ?2 AND slot = ?3 AND done_at = ?4)
             ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + excluded.dogam_jelly, updated_at = excluded.updated_at`,
          )
          .bind(seasonId, g.no, q.slot, mark, QUEST_REWARD[q.quest.diff as QuestDiff], t),
      );
    }
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO season_titles (season_id, user_id, title, created_at)
           SELECT ?1, s.user_id, ?3, ?4 FROM season_members s JOIN members m ON m.user_id = s.user_id AND m.active = 1
           WHERE s.season_id = ?1 AND s.group_no = ?2 AND s.left_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM season_quests WHERE season_id = ?1 AND group_no = ?2 AND done_at IS NULL)
             AND EXISTS (SELECT 1 FROM season_quests WHERE season_id = ?1 AND group_no = ?2 AND done_at = ?5)`,
        )
        .bind(seasonId, g.no, seasonTitle(loaded.season), t, mark),
    );
  }
  if (stmts.length) await db.batch(stmts);
  return done;
}

// ── 화면용 ──

export type GroupView = {
  season: Season;
  groupNo: number;
  members: GroupState['members'];
  quests: { slot: number; name: string; text: string; cat: string; diff: QuestDiff; reward: number; value: number; target: number; done: boolean }[];
  titles: string[];
  // 모둠별 순위: 깬 퀘스트가 많은 순, 같으면 모둠 통화 시간이 긴 순
  ranking: GroupRank[];
  // 내가 모둠원과 같이 통화한 분(오늘·이번 시즌)과 우리 모둠 오늘의 활약(오늘 모둠 통화가 긴 순 3명)
  me: { today: number; season: number };
  todayTop: { id: string; name: string; minutes: number }[];
};

export type GroupRank = { no: number; rank: number; done: number; total: number; minutes: number; size: number; mine: boolean };

export function rankGroups(groups: GroupState[], mine: number | null): GroupRank[] {
  const rows = groups.map((g) => {
    const done = g.quests.filter((q) => !!q.done_at || questProgress(q.quest, g.ctx).done).length;
    const minutes = g.ctx.voice.reduce((sum, v) => sum + v.minutes, 0);
    return { no: g.no, done, total: g.quests.length, minutes, size: g.members.filter((m) => !m.left).length, mine: g.no === mine };
  });
  rows.sort((a, b) => b.done - a.done || b.minutes - a.minutes || a.no - b.no);
  let rank = 0;
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.done !== r.done || prev.minutes !== r.minutes) rank = i + 1;
    return { ...r, rank };
  });
}

function activity(g: GroupState, userId: string, today: string): Pick<GroupView, 'me' | 'todayTop'> {
  const me = { today: 0, season: 0 };
  const todayBy = new Map<string, number>();
  for (const r of g.ctx.memberDay) {
    if (r.user === userId) {
      me.season += r.minutes;
      if (r.day === today) me.today += r.minutes;
    }
    if (r.day === today) todayBy.set(r.user, (todayBy.get(r.user) ?? 0) + r.minutes);
  }
  const names = new Map(g.members.filter((m) => !m.left).map((m) => [m.id, m.name]));
  const todayTop = [...todayBy]
    .filter(([id, n]) => names.has(id) && n > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([id, minutes]) => ({ id, name: names.get(id)!, minutes }));
  return { me, todayTop };
}

// 지금 시즌에서 이 사람의 모둠(없으면 null)
export async function groupViewFor(db: D1Database, userId: string, nowMs: number): Promise<GroupView | null> {
  const now = new Date(nowMs).toISOString();
  const row = await db
    .prepare(
      `SELECT s.season_id, s.group_no FROM season_members s JOIN seasons x ON x.id = s.season_id
       WHERE s.user_id = ? AND s.left_at IS NULL AND x.starts_at <= ? ORDER BY x.id DESC LIMIT 1`,
    )
    .bind(userId, now)
    .first<{ season_id: string; group_no: number }>();
  if (!row) return null;
  const loaded = await loadGroups(db, row.season_id);
  const g = loaded?.groups.find((x) => x.no === row.group_no);
  if (!loaded || !g) return null;
  const { results: titles } = await db
    .prepare('SELECT title FROM season_titles WHERE user_id = ? ORDER BY season_id DESC LIMIT 20')
    .bind(userId)
    .all<{ title: string }>();
  return {
    season: loaded.season,
    groupNo: g.no,
    members: g.members.filter((m) => !m.left),
    quests: g.quests.map(({ slot, quest, done_at }) => {
      const p = questProgress(quest, g.ctx);
      const done = !!done_at || p.done;
      return { slot, name: quest.name, text: quest.text(p.target), cat: quest.cat, diff: quest.diff, reward: QUEST_REWARD[quest.diff], value: done ? p.target : p.value, target: p.target, done };
    }),
    titles: titles.map((r) => r.title),
    ranking: rankGroups(loaded.groups, g.no),
    ...activity(g, userId, kstParts(now).day),
  };
}
