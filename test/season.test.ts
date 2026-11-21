// 시즌 모둠 퀘스트: 모둠 나누기, 퀘스트 뽑기, 동기화로 진행도 세기와 보상
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MAX_PER_CAT, QUESTS, pickQuests, questById, seededRandom } from '../src/quests';
import { type Person, evaluateSeason, groupCount, groupViewFor, joinGroup, planGroups, rankGroups, seasonRanking, tierKeeper } from '../src/season';
import { blockKey, separateBlocked } from '../src/assign-block';
import { applySync, parseSync } from '../src/sync';

const NOW = Date.parse('2026-11-03T03:00:00Z'); // 한국 11월 3일 12시
const START = '2026-11-02T15:00:00Z'; // 한국 11월 3일 0시
const END = '2026-11-16T15:00:00Z';
// 예전 모둠 퀘스트 8개 테스트: 새 시즌부터는 안 만들어서 켜고 시험해요
const OLD = { groupQuests: true };
const id = (n: number) => `1${String(n).padStart(17, '0')}`;

function fakeD1(memberCount: number) {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  sql.exec('DELETE FROM member_voice_day; DELETE FROM member_voice_slot;'); // 0066 실제 기록 채우기는 빼고 빈 DB로 시험해요
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

  it('나온 날 기록이 있으면 30일 중 3일 이하 나온 사람이 활동 적은 사람(한 번 오래 있어도)', () => {
    // 18명은 한 달에 1~3일만 왔지만 그날 오래 있었어요(활동 시간은 많아요) → 9팀에 2명씩
    const list = Array.from({ length: 91 }, (_, i): Person => ({
      id: id(i + 1),
      games: ['롤'],
      activity: i < 18 ? 2000 : 300 + i * 10,
      days: i < 18 ? 1 + (i % 3) : 4 + (i % 20),
      days14: i < 18 ? 1 : 4 + (i % 10),
    }));
    const plan = planGroups(list, seededRandom('days'));
    const low = new Map<number, number>();
    for (const p of list.slice(0, 18)) low.set(plan.get(p.id)!, (low.get(plan.get(p.id)!) ?? 0) + 1);
    expect([...low.values()].sort()).toEqual(Array(9).fill(2));
  });

  it('한 달엔 자주 왔어도 최근 2주에 하루만 왔으면 가끔 오는 사람, 2주에 2~3일은 보통 — 단계마다 팀에 고르게', () => {
    const list = Array.from({ length: 90 }, (_, i): Person => ({
      id: id(i + 1),
      games: ['롤'],
      activity: 3000 - i,
      days: 20,
      days14: i < 9 ? 1 : i < 27 ? 2 + (i % 2) : 8,
    }));
    const plan = planGroups(list, seededRandom('tier'));
    const per = (from: number, to: number) => {
      const m = new Map<number, number>();
      for (const p of list.slice(from, to)) m.set(plan.get(p.id)!, (m.get(plan.get(p.id)!) ?? 0) + 1);
      return [...m.values()].sort();
    };
    expect(per(0, 9)).toEqual(Array(9).fill(1));
    expect(per(9, 27)).toEqual(Array(9).fill(2));
    expect(sizes(plan)).toEqual(Array(9).fill(10));
  });

  it('모두 가끔/보통이라 나머지가 없어도 단계마다 팀에 고르게', () => {
    const list = Array.from({ length: 30 }, (_, i): Person => ({
      id: id(i + 1),
      games: [i < 25 ? '롤' : '발로란트'],
      activity: 500 - i,
      days: 10,
      days14: i < 6 ? 1 : 2,
    }));
    const plan = planGroups(list, seededRandom('no-rest'));
    const low = new Map<number, number>();
    for (const p of list.slice(0, 6)) low.set(plan.get(p.id)!, (low.get(plan.get(p.id)!) ?? 0) + 1);
    expect([...low.values()].sort()).toEqual([2, 2, 2]);
    expect(sizes(plan)).toEqual([10, 10, 10]);
  });

  it('막힌 짝을 떼어 놓을 때 가끔/보통 인원이 팀마다 고르게 남아요', () => {
    const list = Array.from({ length: 30 }, (_, i): Person => ({
      id: id(i + 1),
      games: ['롤'],
      activity: 3000 - i,
      days: 20,
      days14: i < 3 ? 1 : i < 9 ? 2 : 8,
    }));
    const planned = planGroups(list, seededRandom('block'));
    // 같은 팀이 된 가끔 오는 사람과 많이 오는 사람을 막힌 짝으로
    const low = list[0]!.id;
    const mate = list.find((p, i) => i >= 9 && planned.get(p.id) === planned.get(low))!.id;
    const plan = separateBlocked(new Map(planned), new Set([blockKey(low, mate)]), tierKeeper(list, planned));
    expect(plan.get(low)).not.toBe(plan.get(mate));
    const per = (from: number, to: number) => {
      const m = new Map<number, number>();
      for (const p of list.slice(from, to)) m.set(plan.get(p.id)!, (m.get(plan.get(p.id)!) ?? 0) + 1);
      return [...m.values()].sort();
    };
    expect(per(0, 3)).toEqual([1, 1, 1]);
    expect(per(3, 9)).toEqual([2, 2, 2]);
  });

  it('게임보다 활동량이 먼저: 한 게임만 하는 사람이 활동이 적어도 팀끼리 활동량 합이 비슷해요', () => {
    // 롤만 하는 30명은 활동이 적고, 발로 60명은 많아요. 예전엔 롤 팀에 몰려서 팀 합이 크게 벌어졌어요.
    const list = Array.from({ length: 90 }, (_, i): Person => ({
      id: id(i + 1),
      games: [i < 30 ? '롤' : '발로란트'],
      activity: i < 30 ? 80 + i : 1000 + i * 20,
    }));
    const plan = planGroups(list, seededRandom('c'));
    const sum = new Map<number, number>();
    for (const p of list) sum.set(plan.get(p.id)!, (sum.get(plan.get(p.id)!) ?? 0) + p.activity);
    expect(Math.max(...sum.values()) / Math.min(...sum.values())).toBeLessThan(1.2);
  });

  it('활동량이 같으면 게임 역할이 겹치는 팀으로 가요', () => {
    const list = Array.from({ length: 40 }, (_, i): Person => ({ id: id(i + 1), games: [i % 2 ? '롤' : '발로란트'], activity: 100 }));
    const plan = planGroups(list, seededRandom('g'));
    let same = 0;
    let pairs = 0;
    for (const a of list)
      for (const b of list)
        if (a.id < b.id && plan.get(a.id) === plan.get(b.id)) {
          pairs++;
          if (a.games[0] === b.games[0]) same++;
        }
    expect(same / pairs).toBeGreaterThan(0.6); // 무작위면 절반쯤
  });

  it('많이 노는 사람이 한 모둠에 몰리지 않아요', () => {
    const list = Array.from({ length: 100 }, (_, i): Person => ({ id: id(i + 1), games: ['롤'], activity: i < 10 ? 1000 : 10 }));
    const plan = planGroups(list, seededRandom('d'));
    const heavy = new Set(list.slice(0, 10).map((p) => plan.get(p.id)));
    expect(heavy.size).toBe(10);
  });

  it('활동이 적은 사람(지난 2주 60분 미만)은 게임 역할과 상관없이 팀마다 같은 수로', () => {
    // 롤 60명·발로 31명(게임별로 팀이 나뉘어도), 그중 29명은 통화 0분 → 9팀에 3~4명씩
    const list = Array.from({ length: 91 }, (_, i): Person => ({
      id: id(i + 1),
      games: [i % 3 ? '롤' : '발로란트'],
      activity: i < 29 ? 0 : 100 + i * 13,
    }));
    const plan = planGroups(list, seededRandom('low'));
    expect(sizes(plan)).toEqual([11, 10, 10, 10, 10, 10, 10, 10, 10]);
    const low = new Map<number, number>();
    for (const p of list.slice(0, 29)) low.set(plan.get(p.id)!, (low.get(plan.get(p.id)!) ?? 0) + 1);
    expect(low.size).toBe(9);
    expect(Math.max(...low.values()) - Math.min(...low.values())).toBeLessThanOrEqual(1);
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
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
    expect(sql.prepare('SELECT id FROM seasons').all()).toEqual([{ id: '2026-11-03' }]);
    expect(sql.prepare('SELECT group_no, COUNT(*) AS n FROM season_members GROUP BY group_no').all()).toEqual([
      { group_no: 0, n: 10 },
      { group_no: 1, n: 10 },
    ]);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM season_quests').get()).toEqual({ n: 16 });
  });

  it('통화방 1분 기록을 모둠별로 세고, 같은 묶음은 한 번만', async () => {
    const { sql, db } = fakeD1(20);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
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
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
    const g0 = (sql.prepare('SELECT user_id FROM season_members WHERE group_no = 0 ORDER BY user_id').all() as { user_id: string }[]).map((r) => r.user_id);
    const endMs = Date.parse(END);
    const nextEnd = new Date(endMs + 14 * 86_400_000).toISOString();
    // (시즌 끝나고 30분 여유가 지난 뒤에 온 묶음이에요)
    // 앞 시즌의 "5인 도감 방문" 퀘스트는, 시즌이 끝난 뒤의 로그인으로 깨지면 안 돼요
    sql.exec("UPDATE season_quests SET quest_id = 'login:5', done_at = NULL WHERE season_id = '2026-11-03' AND group_no = 0 AND slot = 0");
    sql.prepare('UPDATE members SET last_login_at = ?').run(new Date(endMs + 30_000).toISOString());
    const parsed = parseSync({
      batch_id: `${new Date(endMs + 31 * 60_000).toISOString()}-x`,
      season: { start: END, end: nextEnd },
      room_minutes: [
        { at: new Date(endMs - 60_000).toISOString(), room: id(999), members: g0.slice(0, 2) },
        { at: new Date(endMs).toISOString(), room: id(999), members: g0.slice(0, 2) },
      ],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await applySync(db, parsed.value, endMs + 31 * 60_000)).toBe('applied');
    // 앞 시즌(11월 3일)에는 끝나기 전 1분만 들어가요
    expect(sql.prepare("SELECT SUM(minutes) AS n FROM gq_voice WHERE season_id = '2026-11-03'").get()).toEqual({ n: 1 });
    expect(sql.prepare("SELECT done_at FROM season_quests WHERE season_id = '2026-11-03' AND group_no = 0 AND slot = 0").get()).toEqual({ done_at: null });
  });

  it('끝나기 직전 로그인으로 채운 퀘스트는 다음 묶음에 앞 시즌 기록이 없어도 확인해요', async () => {
    const { sql, db } = fakeD1(10);
    await applySync(db, payload({ members: members(10), full_members: true }), NOW, OLD);
    sql.exec("UPDATE season_quests SET quest_id = 'login:all' WHERE slot = 0");
    sql.exec("UPDATE season_quests SET done_at = 'x' WHERE slot > 0");
    const endMs = Date.parse(END);
    sql.prepare('UPDATE members SET last_login_at = ?').run(new Date(endMs - 60_000).toISOString());
    const nextEnd = new Date(endMs + 14 * 86_400_000).toISOString();
    // 시즌이 끝난 뒤 첫 묶음: 새 시즌 기록만 있어요
    const parsed = parseSync({
      batch_id: `${new Date(endMs + 60_000).toISOString()}-login`,
      season: { start: END, end: nextEnd },
      room_minutes: [{ at: new Date(endMs + 30_000).toISOString(), room: id(999), members: [id(1), id(2)] }],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await applySync(db, parsed.value, endMs + 60_000)).toBe('applied');
    expect(sql.prepare("SELECT done_at IS NOT NULL AS done FROM season_quests WHERE season_id = '2026-11-03' AND slot = 0").get()).toEqual({ done: 1 });
  });

  it('새 카드 퀘스트는 모둠에서 만들 수 있는 짝 수보다 많이 요구하지 않아요', () => {
    const q = questById('newcards:30')!;
    expect(q.target({ startSize: 2, current: [id(1), id(2)] } as never)).toBe(1);
    expect(q.target({ startSize: 10, current: Array.from({ length: 10 }, (_, i) => id(i + 1)) } as never)).toBe(30);
  });

  it('시즌이 바뀐 뒤 온 출석만 있는 묶음도 앞 시즌 출석으로 넣어요', async () => {
    const { sql, db } = fakeD1(20);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
    const endMs = Date.parse(END);
    const nextEnd = new Date(endMs + 14 * 86_400_000).toISOString();
    const parsed = parseSync({
      batch_id: `${new Date(endMs + 60_000).toISOString()}-a`,
      season: { start: END, end: nextEnd },
      attendance: [{ id: id(1), day: '2026-11-16' }],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await applySync(db, parsed.value, endMs + 60_000)).toBe('applied');
    expect(sql.prepare("SELECT season_id, day FROM gq_attend WHERE user_id = ?").all(id(1))).toEqual([{ season_id: '2026-11-03', day: '2026-11-16' }]);
  });

  it('퀘스트를 채우면 모둠원 모두 젤리를 한 번만 받고, 8개 다 깨면 칭호', async () => {
    const { sql, db } = fakeD1(10);
    await applySync(db, payload({ members: members(10), full_members: true }), NOW, OLD);
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
    // 나갔다 다시 들어온 멤버(reset_at이 칭호보다 뒤)는 예전 칭호를 보지 않아요
    sql.prepare("UPDATE members SET reset_at = '9999-01-01T00:00:00.000Z' WHERE user_id = ?").run(id(5));
    expect((await groupViewFor(db, id(5), NOW))?.titles).toEqual([]);
    sql.prepare('UPDATE members SET reset_at = NULL WHERE user_id = ?').run(id(5));
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
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
    const g1 = (sql.prepare('SELECT user_id FROM season_members WHERE group_no = 1 ORDER BY user_id').all() as { user_id: string }[]).map((r) => r.user_id);
    const minutes = Array.from({ length: 20 }, (_, i) => ({ at: new Date(NOW + i * 60_000).toISOString(), room: id(999), members: g1.slice(0, 2) }));
    await applySync(db, payload({ room_minutes: minutes }), NOW);
    const r = await seasonRanking(db, NOW + 30 * 60_000);
    expect(r?.ranking.map((x) => [x.no, x.rank, x.minutes, x.mine])).toEqual([[1, 1, 20, false], [0, 2, 0, false]]);
    expect(r?.todayTop.map((t) => [t.id, t.minutes, t.group])).toEqual([[g1[0], 20, 1], [g1[1], 20, 1]]);
    // 시즌이 끝나면 없어요
    expect(await seasonRanking(db, Date.parse(r!.season.end))).toBeNull();
  });

  it('오늘의 활약은 아침 6시에 하루가 바뀌어요', async () => {
    const { sql, db } = fakeD1(20);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
    const g1 = (sql.prepare('SELECT user_id FROM season_members WHERE group_no = 1 ORDER BY user_id').all() as { user_id: string }[]).map((r) => r.user_id);
    // 한국 11월 4일 05:50~05:59 10분(전날 게임일), 06:00~06:04 5분(새 게임일)
    const start = Date.parse('2026-11-03T20:50:00Z');
    const minutes = Array.from({ length: 15 }, (_, i) => ({ at: new Date(start + i * 60_000).toISOString(), room: id(999), members: g1.slice(0, 2) }));
    await applySync(db, payload({ room_minutes: minutes }), start);
    const before = await seasonRanking(db, Date.parse('2026-11-03T20:59:30Z'));
    expect(before?.todayTop.map((t) => t.minutes)).toEqual([10, 10]);
    const after = await seasonRanking(db, Date.parse('2026-11-03T22:00:00Z'));
    expect(after?.todayTop.map((t) => t.minutes)).toEqual([5, 5]);
    expect(sql.prepare('SELECT day, minutes FROM gq_member_gameday WHERE user_id = ? ORDER BY day').all(g1[0])).toEqual([
      { day: '2026-11-03', minutes: 10 },
      { day: '2026-11-04', minutes: 5 },
    ]);
  });

  it('시즌이 0시에 바뀌어도 같은 게임일의 오늘의 활약은 이어서 세요', async () => {
    const { sql, db } = fakeD1(20);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
    const sid = (sql.prepare('SELECT id FROM seasons').get() as { id: string }).id;
    const g = sql.prepare('SELECT user_id, group_no FROM season_members WHERE season_id = ? ORDER BY user_id LIMIT 1').get(sid) as { user_id: string; group_no: number };
    // 앞 시즌에 같은 게임일 60분이 있었다고 쳐요.
    sql.prepare("INSERT INTO gq_member_gameday (season_id, group_no, user_id, day, minutes) VALUES ('old-season', 9, ?, '2026-11-03', 60)").run(g.user_id);
    sql.prepare("INSERT INTO gq_member_gameday (season_id, group_no, user_id, day, minutes) VALUES (?, ?, ?, '2026-11-03', 10)").run(sid, g.group_no, g.user_id);
    const r = await seasonRanking(db, NOW);
    expect(r?.todayTop.find((t) => t.id === g.user_id)?.minutes).toBe(70);
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
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
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

  it('늦게 들어온 사람의 시작 기준에는 같은 묶음 경험치가 들어가지 않아요', async () => {
    const { sql, db } = fakeD1(21);
    sql.exec(`UPDATE profiles SET updated_at = '2026-01-01T00:00:00.000Z' WHERE user_id = '${id(21)}'`);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
    await applySync(db, payload({ solo_xp: [{ id: id(21), xp: 3 }], room_minutes: [{ at: new Date(NOW).toISOString(), room: id(999), members: [id(21), id(1)] }] }), NOW);
    expect(sql.prepare(`SELECT start_member FROM season_members WHERE user_id = '${id(21)}'`).get()).toEqual({ start_member: 0 });
    expect(sql.prepare(`SELECT xp FROM season_snap WHERE owner_id = '${id(21)}' AND target_id = '${id(21)}'`).get()).toEqual({ xp: 0 });
    expect(sql.prepare(`SELECT solo_xp FROM profiles WHERE user_id = '${id(21)}'`).get()).toEqual({ solo_xp: 3 });
  });

  it('시즌이 끝난 직후 온 마지막 묶음의 레벨업은 앞 시즌 퀘스트에 들어가요', async () => {
    const { sql, db } = fakeD1(10);
    await applySync(db, payload({ members: members(10), full_members: true }), NOW, OLD);
    sql.exec("UPDATE season_quests SET quest_id = 'ownlevel:all', done_at = NULL WHERE slot = 0");
    sql.exec("UPDATE season_quests SET done_at = 'x' WHERE slot > 0");
    const endMs = Date.parse(END);
    const parsed = parseSync({
      batch_id: `${new Date(endMs + 60_000).toISOString()}-lv`,
      season: { start: END, end: new Date(endMs + 14 * 86_400_000).toISOString() },
      solo_xp: members(10).map((m) => ({ id: m.id, xp: 100 })),
      room_minutes: [{ at: new Date(endMs - 60_000).toISOString(), room: id(999), members: [id(1), id(2)] }],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await applySync(db, parsed.value, endMs + 60_000)).toBe('applied');
    expect((sql.prepare("SELECT done_at FROM season_quests WHERE season_id = '2026-11-03' AND slot = 0").get() as { done_at: string | null }).done_at).not.toBeNull();
  });

  it('시즌이 끝난 뒤 30분 여유 안에 로그인한 건 앞 시즌 접속 퀘스트에 안 들어가요', async () => {
    const { sql, db } = fakeD1(10);
    await applySync(db, payload({ members: members(10), full_members: true }), NOW, OLD);
    sql.exec("UPDATE season_quests SET quest_id = 'login:5', done_at = NULL WHERE slot = 0");
    sql.exec("UPDATE season_quests SET done_at = 'x' WHERE slot > 0");
    const endMs = Date.parse(END);
    sql.exec(`UPDATE members SET last_login_at = '${new Date(endMs + 30_000).toISOString()}'`);
    const parsed = parseSync({
      batch_id: `${new Date(endMs + 60_000).toISOString()}-login`,
      season: { start: END, end: new Date(endMs + 14 * 86_400_000).toISOString() },
      room_minutes: [{ at: new Date(endMs - 60_000).toISOString(), room: id(999), members: [id(1), id(2)] }],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await applySync(db, parsed.value, endMs + 60_000)).toBe('applied');
    expect((sql.prepare("SELECT done_at FROM season_quests WHERE season_id = '2026-11-03' AND slot = 0").get() as { done_at: string | null }).done_at).toBeNull();
  });

  it('시즌 정보 없는 묶음으로 나가도 모둠에서 빠지고, 다시 들어오면 원래 모둠으로', async () => {
    const { sql, db } = fakeD1(20);
    await applySync(db, payload({ members: members(20), full_members: true }), NOW, OLD);
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
    await applySync(db, payload({ members: members(10), full_members: true }), NOW, OLD);
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
