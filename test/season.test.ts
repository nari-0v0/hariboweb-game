// 시즌 모둠 퀘스트: 모둠 나누기, 퀘스트 뽑기, 동기화로 진행도 세기와 보상
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MAX_PER_CAT, QUESTS, pickQuests, questById, seededRandom } from '../src/quests';
import { type Person, evaluateSeason, groupCount, groupViewFor, joinGroup, planGroups, rankGroups, seasonRanking } from '../src/season';
import { applySync, parseSync } from '../src/sync';

const NOW = Date.parse('2026-11-03T03:00:00Z'); // 한국 11월 3일 12시
const START = '2026-11-02T15:00:00Z'; // 한국 11월 3일 0시
const END = '2026-11-16T15:00:00Z';
const id = (n: number) => `1${String(n).padStart(17, '0')}`;

function fakeD1(memberCount: number) {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (query: string, args: unknown[] = []) => ({
    query,
    args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => ({ results: sql.prepare(query).all(...(args as never[])) }),
    first: async () => sql.prepare(query).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }),
  });
  const db = {
    prepare: (q: string) => stmt(q),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      sql.exec('BEGIN');
      try {
        for (const s of list) sql.prepare(s.query).run(...(s.args as never[]));
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
      return [];
    },
  };
  for (let n = 1; n <= memberCount; n++) {
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id(n), `멤버${n}`);
    sql.prepare('INSERT INTO profiles (user_id, solo_xp, updated_at) VALUES (?, 0, ?)').run(id(n), '2026-11-01T00:00:00.000Z');
  }
  return { sql, db: db as unknown as D1Database };
}

let seq = 0;
function payload(extra: Record<string, unknown>) {
  const parsed = parseSync({ batch_id: `${new Date(NOW).toISOString()}-${seq++}`, season: { start: START, end: END }, ...extra });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

const people = (n: number, games: (i: number) => string[] = () => ['롤']) =>
  Array.from({ length: n }, (_, i): Person => ({ id: id(i + 1), games: games(i), activity: (i * 37) % 300 }));

function sizes(plan: Map<string, number>) {
  const out = new Map<number, number>();
  for (const g of plan.values()) out.set(g, (out.get(g) ?? 0) + 1);
  return [...out.values()].sort((a, b) => b - a);
}

describe('모둠 나누기', () => {
  it('10명 안팎으로 나누고 인원 차이는 1명까지', () => {
    expect(groupCount(1)).toBe(0);
    expect(groupCount(7)).toBe(1);
    expect(sizes(planGroups(people(91), seededRandom('a')))).toEqual([11, 10, 10, 10, 10, 10, 10, 10, 10]);
    expect(sizes(planGroups(people(95), seededRandom('a')))).toEqual([10, 10, 10, 10, 10, 9, 9, 9, 9, 9]);
    expect(sizes(planGroups(people(100), seededRandom('b')))).toEqual(Array(10).fill(10));
  });

  it('게임 역할이 겹치는 사람끼리 묶어요', () => {
    // 롤 50명, 발로 50명: 모둠마다 한 게임만 있어야 해요
    const list = people(100, (i) => [i % 2 ? '롤' : '발로란트']);
    const plan = planGroups(list, seededRandom('c'));
    const gamesBy = new Map<number, Set<string>>();
    for (const p of list) (gamesBy.get(plan.get(p.id)!) ?? gamesBy.set(plan.get(p.id)!, new Set()).get(plan.get(p.id)!)!).add(p.games[0]!);
    const mixed = [...gamesBy.values()].filter((s) => s.size > 1).length;
    expect(mixed).toBeLessThanOrEqual(1);
  });

  it('많이 노는 사람이 한 모둠에 몰리지 않아요', () => {
    const list = Array.from({ length: 100 }, (_, i): Person => ({ id: id(i + 1), games: ['롤'], activity: i < 10 ? 1000 : 10 }));
    const plan = planGroups(list, seededRandom('d'));
    const heavy = new Set(list.slice(0, 10).map((p) => plan.get(p.id)));
    expect(heavy.size).toBe(10);
  });

  it('게임 역할이 없는 사람은 모둠마다 고르게', () => {
    const list = people(100, (i) => (i < 30 ? [] : ['롤']));
    const plan = planGroups(list, seededRandom('e'));
    const none = new Map<number, number>();
    for (const p of list.slice(0, 30)) none.set(plan.get(p.id)!, (none.get(plan.get(p.id)!) ?? 0) + 1);
    expect([...none.values()].every((n) => n === 3)).toBe(true);
  });

  it('늦게 온 사람은 역할이 겹치는 제일 작은 모둠으로', () => {
    const groups = [
      { no: 0, size: 9, games: new Set(['롤']) },
      { no: 1, size: 8, games: new Set(['발로란트']) },
      { no: 2, size: 10, games: new Set(['롤']) },
    ];
    expect(joinGroup(['롤'], groups, seededRandom('f'))).toBe(0);
    expect(joinGroup(['배그'], groups, seededRandom('f'))).toBe(1);
  });
});

describe('퀘스트', () => {
  it('내전 말고도 500개 넘게, 이름과 id가 겹치지 않아요', () => {
    expect(QUESTS.filter((q) => !q.scrim).length).toBeGreaterThanOrEqual(500);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    expect(new Set(QUESTS.map((q) => q.name)).size).toBe(QUESTS.length);
  });

  it('모둠마다 쉬움 3, 보통 3, 어려움 2. 내전은 켜야 나와요', () => {
    for (let i = 0; i < 50; i++) {
      const ids = pickQuests(seededRandom(`q${i}`));
      const qs = ids.map((x) => questById(x)!);
      expect(qs.map((q) => q.diff)).toEqual(['easy', 'easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard']);
      expect(qs.some((q) => q.scrim)).toBe(false);
      const cats = new Map<string, number>();
      for (const q of qs) cats.set(q.cat, (cats.get(q.cat) ?? 0) + 1);
      expect(Math.max(...cats.values())).toBeLessThanOrEqual(MAX_PER_CAT);
    }
  });

  it('지난 시즌에 받은 퀘스트는 피해요', () => {
    const first = pickQuests(seededRandom('x'));
    const again = pickQuests(seededRandom('x'), { seen: new Map(first.map((q) => [q, 10])) });
    expect(again.filter((q) => first.includes(q))).toEqual([]);
  });

  it('모든 퀘스트가 빈 기록에서 계산돼요', () => {
    const ctx = {
      seasonStart: '2026-11-03', startSize: 10, current: [id(1), id(2)], startCurrent: [id(1), id(2)],
      voice: [], memberDay: [], pairs: [], rooms: 0, bestRun: 0, scrims: [], newbie: [], praises: [], attend: [],
      newCardPairs: [], newCardOwners: [], pairLevels: [], ownLevelUp: [], loggedIn: [],
    };
    for (const q of QUESTS) {
      const t = q.target(ctx);
      expect(Number.isFinite(t) && t >= 1, q.id).toBe(true);
      expect(Number.isFinite(q.value(ctx)), q.id).toBe(true);
      expect(q.text(t).length).toBeGreaterThan(0);
    }
  });
});

describe('동기화로 시즌 모둠', () => {
  const members = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: id(i + 1), name: `멤버${i + 1}`, avatar_url: null, joined_at: null, is_newbie: false, games: ['롤'] }));

  it('멤버 전부가 담긴 묶음이 오면 모둠과 퀘스트를 만들어요(한 번만)', async () => {
    const { sql, db } = fakeD1(20);
    // 멤버 전부가 아니면 아직 안 만들어요
    await applySync(db, payload({ members: members(3) }), NOW);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM seasons').get()).toEqual({ n: 0 });
    await applySync(db, payload({ members: members(20), full_members: true }), NOW);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW);
    expect(sql.prepare('SELECT id FROM seasons').all()).toEqual([{ id: '2026-11-03' }]);
    expect(sql.prepare('SELECT group_no, COUNT(*) AS n FROM season_members GROUP BY group_no').all()).toEqual([
      { group_no: 0, n: 10 },
      { group_no: 1, n: 10 },
    ]);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM season_quests').get()).toEqual({ n: 16 });
  });

  it('통화방 1분 기록을 모둠별로 세고, 같은 묶음은 한 번만', async () => {
    const { sql, db } = fakeD1(20);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW);
    const g0 = (sql.prepare('SELECT user_id FROM season_members WHERE group_no = 0 ORDER BY user_id').all() as { user_id: string }[]).map((r) => r.user_id);
    const room = id(999);
    const minutes = Array.from({ length: 30 }, (_, i) => ({
      at: new Date(NOW + i * 60_000).toISOString(),
      room,
      members: g0.slice(0, 4),
    }));
    const p = payload({ room_minutes: minutes });
    expect(await applySync(db, p, NOW)).toBe('applied');
    expect(await applySync(db, p, NOW)).toBe('duplicate');
    expect(sql.prepare('SELECT SUM(minutes) AS n FROM gq_voice WHERE group_no = 0').get()).toEqual({ n: 30 });
    expect(sql.prepare('SELECT together FROM gq_voice WHERE group_no = 0 LIMIT 1').get()).toEqual({ together: 4 });
    expect(sql.prepare('SELECT COUNT(*) AS n FROM gq_pair WHERE group_no = 0').get()).toEqual({ n: 6 });
    expect(sql.prepare('SELECT best FROM gq_run WHERE group_no = 0').get()).toEqual({ best: 30 });
    // 이어지는 다음 묶음은 이어서 세요
    await applySync(db, payload({ room_minutes: [{ at: new Date(NOW + 30 * 60_000).toISOString(), room, members: g0.slice(0, 2) }] }), NOW);
    expect(sql.prepare('SELECT current, best FROM gq_run WHERE group_no = 0').get()).toEqual({ current: 31, best: 31 });
    expect(sql.prepare('SELECT SUM(minutes) AS n FROM member_voice_day').get()).toEqual({ n: 30 * 4 + 2 });
  });

  it('시즌이 바뀌는 순간에 걸친 묶음은 앞 시즌 기록도 앞 시즌에 넣어요', async () => {
    const { sql, db } = fakeD1(20);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW);
    const g0 = (sql.prepare('SELECT user_id FROM season_members WHERE group_no = 0 ORDER BY user_id').all() as { user_id: string }[]).map((r) => r.user_id);
    const endMs = Date.parse(END);
    const nextEnd = new Date(endMs + 14 * 86_400_000).toISOString();
    const parsed = parseSync({
      batch_id: `${new Date(endMs + 60_000).toISOString()}-x`,
      season: { start: END, end: nextEnd },
      room_minutes: [
        { at: new Date(endMs - 60_000).toISOString(), room: id(999), members: g0.slice(0, 2) },
        { at: new Date(endMs).toISOString(), room: id(999), members: g0.slice(0, 2) },
      ],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await applySync(db, parsed.value, endMs + 60_000)).toBe('applied');
    // 앞 시즌(11월 3일)에는 끝나기 전 1분만 들어가요
    expect(sql.prepare("SELECT SUM(minutes) AS n FROM gq_voice WHERE season_id = '2026-11-03'").get()).toEqual({ n: 1 });
  });

  it('퀘스트를 채우면 모둠원 모두 젤리를 한 번만 받고, 8개 다 깨면 칭호', async () => {
    const { sql, db } = fakeD1(10);
    await applySync(db, payload({ members: members(10), full_members: true }), NOW);
    // 퀘스트를 "통화 마라톤 1시간"(이어서 60분)으로 바꿔서 확인해요
    sql.exec("UPDATE season_quests SET quest_id = 'run:60' WHERE slot = 0");
    sql.exec("UPDATE season_quests SET done_at = 'x' WHERE slot > 0");
    const minutes = Array.from({ length: 60 }, (_, i) => ({ at: new Date(NOW + i * 60_000).toISOString(), room: id(999), members: [id(1), id(2)] }));
    await applySync(db, payload({ room_minutes: minutes }), NOW);
    const jelly = (u: string) => (sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get(u) as { dogam_jelly: number }).dogam_jelly;
    expect(jelly(id(5))).toBe(1);
    // 다시 확인해도 또 주지 않아요
    await evaluateSeason(db, '2026-11-03', NOW);
    expect(jelly(id(5))).toBe(1);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM season_titles').get()).toEqual({ n: 10 });
    const view = await groupViewFor(db, id(5), NOW);
    expect(view?.titles).toEqual(['11월 3일 시즌 모둠 완주']);
    expect(view?.quests.every((q) => q.done)).toBe(true);
    expect(view?.ranking).toEqual([{ no: 0, rank: 1, done: 8, total: 8, minutes: 60, size: 10, mine: true }]);
    expect(view?.me).toEqual({ today: 0, season: 0 });
    const mine = await groupViewFor(db, id(1), NOW + 61 * 60_000);
    expect(mine?.me.season).toBe(60);
    expect(mine?.todayTop.map((x) => [x.id, x.minutes])).toEqual([[id(1), 60], [id(2), 60]]);    // 시즌이 끝나면 지난 모둠을 지금 모둠처럼 보여 주지 않아요
    const ends = (sql.prepare('SELECT ends_at FROM seasons').get() as { ends_at: string }).ends_at;
    expect(await groupViewFor(db, id(1), Date.parse(ends))).toBeNull();
  });

  it('고정 패널용 전체 모둠 순위와 서버 전체 오늘의 활약', async () => {
    const { sql, db } = fakeD1(20);
    expect(await seasonRanking(db, NOW)).toBeNull();
    await applySync(db, payload({ members: members(20), full_members: true }), NOW);
    const g1 = (sql.prepare('SELECT user_id FROM season_members WHERE group_no = 1 ORDER BY user_id').all() as { user_id: string }[]).map((r) => r.user_id);
    const minutes = Array.from({ length: 20 }, (_, i) => ({ at: new Date(NOW + i * 60_000).toISOString(), room: id(999), members: g1.slice(0, 2) }));
    await applySync(db, payload({ room_minutes: minutes }), NOW);
    const r = await seasonRanking(db, NOW + 30 * 60_000);
    expect(r?.ranking.map((x) => [x.no, x.rank, x.minutes, x.mine])).toEqual([[1, 1, 20, false], [0, 2, 0, false]]);
    expect(r?.todayTop.map((t) => [t.id, t.minutes, t.group])).toEqual([[g1[0], 20, 1], [g1[1], 20, 1]]);
    // 시즌이 끝나면 없어요
    expect(await seasonRanking(db, Date.parse(r!.season.end))).toBeNull();
  });

  it('모둠 순위: 깬 퀘스트, 같으면 모둠 통화 시간, 둘 다 같으면 같은 등수', () => {
    const g = (no: number, done: number, minutes: number) =>
      ({
        no,
        members: [],
        quests: Array.from({ length: 8 }, (_, i) => ({ slot: i, quest: { target: () => 1, value: () => 0 } as never, done_at: i < done ? 'x' : null })),
        ctx: { voice: [{ minutes }] },
      }) as never;
    const r = rankGroups([g(0, 2, 10), g(1, 3, 0), g(2, 2, 50), g(3, 2, 10)], 3);
    expect(r.map((x) => [x.no, x.rank, x.mine])).toEqual([[1, 1, false], [2, 2, false], [0, 3, false], [3, 3, true]]);
  });

  it('나간 사람은 빠지고, 시즌 중에 처음 활동한 사람은 제일 작은 모둠으로', async () => {
    const { sql, db } = fakeD1(22);
    // 21, 22번은 최근 2주 동안 활동이 없어요
    sql.exec(`UPDATE profiles SET updated_at = '2026-01-01T00:00:00.000Z' WHERE user_id IN ('${id(21)}', '${id(22)}')`);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM season_members').get()).toEqual({ n: 20 });
    sql.exec(`UPDATE season_members SET left_at = 'x' WHERE user_id = '${id(1)}'`);
    const g1 = (sql.prepare(`SELECT group_no FROM season_members WHERE user_id = '${id(1)}'`).get() as { group_no: number }).group_no;
    // 1번과 같은 모둠의 한 명이 서버를 나가요
    const other = (sql.prepare(`SELECT user_id FROM season_members WHERE group_no = ${g1} AND user_id != '${id(1)}' LIMIT 1`).get() as { user_id: string }).user_id;
    await applySync(db, payload({ removed: [other], room_minutes: [{ at: new Date(NOW).toISOString(), room: id(999), members: [id(21), other] }] }), NOW);
    const row = sql.prepare(`SELECT group_no, start_member FROM season_members WHERE user_id = '${id(21)}'`).get() as { group_no: number; start_member: number };
    expect(row.start_member).toBe(0);
    expect(row.group_no).toBe(g1);
    expect(sql.prepare(`SELECT left_at IS NOT NULL AS gone FROM season_members WHERE user_id = '${other}'`).get()).toEqual({ gone: 1 });
  });

  it('시즌 정보 없는 묶음으로 나가도 모둠에서 빠지고, 다시 들어오면 원래 모둠으로', async () => {
    const { sql, db } = fakeD1(20);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW);
    const before = sql.prepare(`SELECT group_no FROM season_members WHERE user_id = '${id(3)}'`).get() as { group_no: number };
    // 시즌 정보가 빠진 묶음(DOGAM_SEASON을 끈 봇 등)
    const plain = parseSync({ batch_id: `${new Date(NOW).toISOString()}-plain${seq++}`, removed: [id(3)] });
    if (!plain.ok) throw new Error(plain.error);
    await applySync(db, plain.value, NOW);
    expect(sql.prepare(`SELECT left_at IS NOT NULL AS gone FROM season_members WHERE user_id = '${id(3)}'`).get()).toEqual({ gone: 1 });
    expect(await groupViewFor(db, id(3), NOW)).toBeNull();
    // 같은 시즌에 다시 들어와서 통화해요
    await applySync(
      db,
      payload({ members: [members(20)[2]!], room_minutes: [{ at: new Date(NOW + 60_000).toISOString(), room: id(999), members: [id(3), id(4)] }] }),
      NOW,
    );
    const after = sql.prepare(`SELECT group_no, left_at FROM season_members WHERE user_id = '${id(3)}'`).get() as { group_no: number; left_at: string | null };
    expect(after).toEqual({ group_no: before.group_no, left_at: null });
    expect((await groupViewFor(db, id(3), NOW + 120_000))?.groupNo).toBe(before.group_no);
  });

  it('내전·출석 기록을 받아요(내전 퀘스트는 기본으로 안 뽑아요)', async () => {
    const { sql, db } = fakeD1(10);
    await applySync(db, payload({ members: members(10), full_members: true }), NOW);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM season_quests WHERE quest_id LIKE 'scrim:%'").get()).toEqual({ n: 0 });
    await applySync(
      db,
      payload({
        scrims: [{ id: 's1', game: 'lol', at: new Date(NOW).toISOString(), members: [id(1), id(2), id(3)] }],
        attendance: [{ id: id(1), day: '2026-11-03' }, { id: id(1), day: '2026-10-01' }],
      }),
      NOW,
    );
    expect(sql.prepare('SELECT members FROM gq_scrim').get()).toEqual({ members: JSON.stringify([id(1), id(2), id(3)]) });
    expect(sql.prepare('SELECT day FROM gq_attend').all()).toEqual([{ day: '2026-11-03' }]);
  });

  it('잘못된 시즌 기록은 거절해요', () => {
    expect(parseSync({ batch_id: 'x', season: { start: END, end: START } }).ok).toBe(false);
    expect(parseSync({ batch_id: 'x', room_minutes: [{ at: START, room: id(1), members: [id(2)] }] }).ok).toBe(false);
    expect(parseSync({ batch_id: 'x', attendance: [{ id: id(1), day: '11월' }] }).ok).toBe(false);
    expect(parseSync({ batch_id: 'x', members: [{ id: id(1), name: 'a', games: [1] }] }).ok).toBe(false);
  });
});
