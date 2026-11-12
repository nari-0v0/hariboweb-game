// 하리보 빙고: 팀 퀘스트(가운데 칸), 서버 퀘스트(초록하리보 납치 대소동!), 젤리피, 팀 짜기
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../src/quests';
import { type Person, ensurePairs, planGroups } from '../src/season';
import { applySync, parseSync } from '../src/sync';
import {
  type Prior,
  bingoExtras,
  canPair,
  jellypiRanking,
  kidnapTarget,
  serverProgress,
  settleEnded,
  slotOf,
  teamProgress,
  teamStatesFor,
} from '../src/team';

const START = '2026-11-02T15:00:00Z'; // 한국 11월 3일 0시
const END = '2026-11-16T15:00:00Z';
const NOW = Date.parse('2026-11-03T03:00:00Z');
const A = '111111111111111111';
const B = '222222222222222222';
const C = '333333333333333333';
const D = '444444444444444444';
const ROOM = '900000000000000001';

function fakeD1(ids: string[]) {
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
  for (const id of ids) {
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `m${id[0]}`);
    sql.prepare('INSERT INTO profiles (user_id, solo_xp, updated_at) VALUES (?, 0, ?)').run(id, '2026-11-01T00:00:00.000Z');
    // 시즌 시작 전 2주 안에 통화방에 나왔어요
    sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-10-25', 60)").run(id);
  }
  return { sql, db: db as unknown as D1Database };
}

let seq = 0;
function payload(extra: Record<string, unknown>) {
  const parsed = parseSync({ batch_id: `${new Date(NOW).toISOString()}-t${seq++}`, season: { start: START, end: END }, ...extra });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}
const member = (id: string, newbie = false) => ({ id, name: `m${id[0]}`, avatar_url: null, joined_at: null, is_newbie: newbie, games: ['롤'] });
const minutes = (n: number, who: string[], from = NOW) =>
  Array.from({ length: n }, (_, i) => ({ at: new Date(from + i * 60_000).toISOString(), room: ROOM, members: who }));
const jelly = (sql: DatabaseSync, id: string) => (sql.prepare('SELECT dogam_jelly AS n FROM profiles WHERE user_id = ?').get(id) as { n: number }).n;
const jp = (sql: DatabaseSync, id: string) =>
  (sql.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM jellypi WHERE user_id = ?').get(id) as { n: number }).n;

describe('팀 퀘스트 계산', () => {
  const pairs = (list: [string, string][]) => list.map(([a, b]) => ({ a, b }));
  it('목표 = 후보 절반(반올림), 최소 2, 후보 수 이하', () => {
    const none = new Set<string>();
    expect(teamProgress(pairs([[A, B]]), new Map(), none)).toMatchObject({ bonus: false, target: 2, candidates: [A, B] });
    expect(teamProgress(pairs([[A, B], [B, C]]), new Map(), none).target).toBe(2);
    const five = pairs([[A, B], [C, D], [A, '5'.repeat(18)]]);
    expect(teamProgress(five, new Map(), none).target).toBe(3); // 5명 → 2.5 → 3
  });

  it('30분 넘게 함께한 짝 둘 다 달성, 목표를 채우면 팀 완료', () => {
    const m = new Map([[`${A}|${B}`, 30]]);
    const p = teamProgress(pairs([[A, B], [C, D]]), m, new Set());
    expect(p.achievers).toEqual([A, B]);
    expect(p.complete).toBe(true);
    expect(teamProgress(pairs([[A, B], [C, D]]), new Map([[`${A}|${B}`, 29]]), new Set()).achievers).toEqual([]);
  });

  it('후보가 나가서 목표가 남은 후보보다 크면 낮춰요', () => {
    const p = teamProgress(pairs([[A, B]]), new Map([[`${A}|${B}`, 40]]), new Set([B]));
    expect(p).toMatchObject({ candidates: [A], target: 1, achievers: [A], complete: true });
  });

  it('후보가 2명 미만이면 보너스 칸(보상 없음)', () => {
    expect(teamProgress([], new Map(), new Set())).toMatchObject({ bonus: true, complete: false, target: 0 });
  });

  it('짝: 둘 다 지난 2주 통화, 게임 역할 겹침(없으면 누구나), 지난 2주 10분 미만', () => {
    const prior: Prior = { voiced: new Set([A, B, C]), minutes: new Map([[`${A}|${C}`, 10]]), slot: new Map() };
    expect(canPair({ id: A, games: ['롤'] }, { id: B, games: ['롤', '배그'] }, prior)).toBe(true);
    expect(canPair({ id: A, games: ['롤'] }, { id: B, games: ['배그'] }, prior)).toBe(false);
    expect(canPair({ id: A, games: [] }, { id: B, games: ['배그'] }, prior)).toBe(true);
    expect(canPair({ id: A, games: ['롤'] }, { id: C, games: ['롤'] }, prior)).toBe(false); // 이미 10분
    expect(canPair({ id: A, games: ['롤'] }, { id: D, games: ['롤'] }, prior)).toBe(false); // D는 지난 2주 통화 없음
  });
});

describe('서버 퀘스트 계산', () => {
  it('목표 = 초록하리보 절반(최소 1), 납치된 초록하리보와 참여자', () => {
    expect([kidnapTarget(0), kidnapTarget(1), kidnapTarget(5), kidnapTarget(20)]).toEqual([1, 1, 3, 10]);
    const q = serverProgress(4, 2, [
      { newbie_id: D, user_id: A },
      { newbie_id: D, user_id: B },
    ]);
    expect(q).toMatchObject({ kidnapped: [D], participants: [A, B, D], met: false });
  });
});

describe('팀 짜기', () => {
  it('시간대: 저녁 18~22, 밤 22~2, 새벽 2~6, 낮', () => {
    expect([18, 21, 22, 1, 2, 5, 6, 17].map(slotOf)).toEqual(['eve', 'eve', 'night', 'night', 'dawn', 'dawn', 'day', 'day']);
  });

  it('짝이 없는 팀은 다른 팀과 한 명 바꿔서 맞춰요', () => {
    const people: Person[] = ['1', '2', '3', '4'].map((n) => ({ id: n.repeat(18), games: ['롤'], activity: 1 }));
    const [p1, p2, p3, p4] = people.map((p) => p.id) as [string, string, string, string];
    // 1-2, 3-4는 이미 많이 놀았고, 1-3, 2-4만 짝이 될 수 있어요
    const ok = new Set([`${p1}|${p3}`, `${p2}|${p4}`]);
    const can = (a: Person, b: Person) => ok.has(a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
    const plan = new Map([
      [p1, 0],
      [p2, 0],
      [p3, 1],
      [p4, 1],
    ]);
    ensurePairs(plan, people, can);
    expect(plan.get(p1)).toBe(plan.get(p3));
    expect(plan.get(p2)).toBe(plan.get(p4));
    expect(plan.get(p1)).not.toBe(plan.get(p2));
  });

  it('시간대가 없으면 예전과 같은 팀', () => {
    const people = Array.from({ length: 30 }, (_, i): Person => ({ id: String(i).padStart(18, '1'), games: ['롤'], activity: (i * 37) % 100 }));
    const a = planGroups(people, seededRandom('x'));
    const b = planGroups(
      people.map((p) => ({ ...p, slot: undefined })),
      seededRandom('x'),
    );
    expect([...a]).toEqual([...b]);
  });
});

describe('동기화로 팀·서버 퀘스트', () => {
  async function setup() {
    const env = fakeD1([A, B, C, D]);
    await applySync(env.db, payload({ members: [member(A), member(B), member(C), member(D, true)], full_members: true }), NOW);
    return env;
  }

  it('시즌을 만들면 팀 짝과 납치 목표를 정해요(한 번만)', async () => {
    const { sql, db } = await setup();
    expect((sql.prepare('SELECT COUNT(*) AS n FROM team_pairs').get() as { n: number }).n).toBe(6);
    expect(sql.prepare('SELECT newbies, target FROM server_quest').get()).toEqual({ newbies: 1, target: 1 });
    expect((sql.prepare('SELECT COUNT(*) AS n FROM season_quests').get() as { n: number }).n).toBe(0); // 모둠 퀘스트 8개는 안 만들어요
    await applySync(db, payload({ members: [member(A)] }), NOW);
    expect((sql.prepare('SELECT COUNT(*) AS n FROM team_pairs').get() as { n: number }).n).toBe(6);
  });

  it('30분 함께하면 가운데 칸, 시즌이 끝나면 목표를 채운 사람만 보상(한 번만)', async () => {
    const { sql, db } = await setup();
    await applySync(db, payload({ room_minutes: [...minutes(30, [A, B]), ...minutes(30, [C, D], NOW + 3_600_000)] }), NOW + 7_200_000);
    const season = '2026-11-03';
    const states = await teamStatesFor(db, season, [A, B, C, D]);
    // 후보 4명, 목표 2명: A·B 달성 → 팀 완료, C·D는 "팀 완료, 나는 아직"(C-D도 짝이라 30분이면 달성이에요)
    expect(states.get(A)).toBe('done');
    expect(states.get(C)).toBe('done');
    const extras = await bingoExtras(db, A, START);
    expect(extras.team).toMatchObject({ complete: true, target: 2 });
    expect(extras.server).toMatchObject({ kidnapped: [D], participants: [C, D], met: true });

    const before = Object.fromEntries([A, B, C, D].map((u) => [u, jelly(sql, u)]));
    const after = Date.parse(END) + 31 * 60_000;
    await settleEnded(db, Date.parse(END) + 10 * 60_000); // 아직 30분 안 지남
    expect(jelly(sql, A)).toBe(before[A]);
    await settleEnded(db, after);
    await settleEnded(db, after + 60_000);
    expect(jelly(sql, A) - before[A]!).toBe(3);
    expect(jelly(sql, B) - before[B]!).toBe(3);
    expect(jelly(sql, C) - before[C]!).toBe(3 + 5);
    expect(jelly(sql, D) - before[D]!).toBe(3 + 5);
    expect([jp(sql, A), jp(sql, C)]).toEqual([3, 3 + 2]);
  });

  it('서버 목표를 못 채우면 아무도 못 받아요', async () => {
    const { sql, db } = await setup();
    sql.exec("UPDATE server_quest SET target = 2");
    await applySync(db, payload({ room_minutes: minutes(30, [C, D]) }), NOW + 3_600_000);
    const before = jelly(sql, C);
    await settleEnded(db, Date.parse(END) + 31 * 60_000);
    // C-D 팀 짝 달성(3)만, 서버(5)는 없음
    expect(jelly(sql, C) - before).toBe(3);
    expect(jp(sql, D)).toBe(3);
  });

  it('젤리피 순위: 많은 순, 같으면 먼저 모은 사람이 위. 떠나면 지워요', async () => {
    const { sql, db } = await setup();
    const add = sql.prepare("INSERT INTO jellypi (user_id, season_id, source, ref, amount, created_at) VALUES (?, '2026-11-03', 'line', ?, ?, ?)");
    add.run(A, 'x1', 3, '2026-11-04T00:00:00Z');
    add.run(B, 'x1', 3, '2026-11-03T00:00:00Z');
    add.run(C, 'x1', 5, '2026-11-05T00:00:00Z');
    sql.prepare("INSERT INTO jellypi (user_id, season_id, source, ref, amount, created_at) VALUES (?, 'old', 'line', 'y', 9, 'z')").run(D);
    const season = await jellypiRanking(db, '2026-11-03', A);
    expect(season.top.map((r) => r.id)).toEqual([C, B, A]);
    expect(season.me).toMatchObject({ rank: 3, total: 3 });
    expect((await jellypiRanking(db, null, D, 1)).me).toMatchObject({ rank: 1, total: 9 });
    expect((await jellypiRanking(db, null, A, 2)).me).toMatchObject({ rank: 4 });
    await applySync(db, payload({ removed: [C] }), NOW + 60_000);
    expect(jp(sql, C)).toBe(0);
  });
});

describe('팀 완료로 채워진 가운데 칸 보상', () => {
  it('활동이 없던 팀원도 동기화 때 줄 보상을 받아요', async () => {
    const { sql, db } = fakeD1([A, B, C, D]);
    await applySync(db, payload({ members: [member(A), member(B), member(C), member(D)], full_members: true }), NOW);
    const period = sql.prepare('SELECT id FROM bingo_periods ORDER BY starts_at LIMIT 1').get() as { id: string };
    // C는 개인 칸을 다 채워 두었어요(가운데 칸만 남음)
    const days = Array.from({ length: 7 }, (_, i) => `2026-11-0${3 + i}`);
    for (const day of days)
      sql.prepare('INSERT INTO bingo_day (week, user_id, day, minutes, crowd, night, attended) VALUES (?, ?, ?, 600, 600, 600, 1)').run(period.id, C, day);
    const others = Array.from({ length: 8 }, (_, i) => `5${String(i).padStart(17, '0')}`);
    for (const o of others) {
      sql.prepare('INSERT INTO bingo_pair (week, a, b, minutes) VALUES (?, ?, ?, 600)').run(period.id, C, o);
      for (const day of ['2026-11-03', '2026-11-04']) {
        sql.prepare('INSERT INTO praises (day, from_id, to_id, jelly, created_at) VALUES (?, ?, ?, 0, ?)').run(day, C, o, `${day}T03:00:00.000Z#g`);
        sql.prepare('INSERT INTO praises (day, from_id, to_id, jelly, created_at) VALUES (?, ?, ?, 0, ?)').run(day, o, C, `${day}T03:00:00.000Z#r`);
      }
    }
    sql.prepare("INSERT INTO bingo_flag (week, user_id, flag) VALUES (?, ?, 'panel'), (?, ?, 'web')").run(period.id, C, period.id, C);
    // A·B, A·D가 30분 → 팀 목표(2명) 넘김. C는 이번 묶음에 기록이 없어요.
    await applySync(db, payload({ room_minutes: [...minutes(30, [A, B]), ...minutes(30, [A, D], NOW + 3_600_000)] }), NOW + 7_200_000);
    const lines = (sql.prepare('SELECT COUNT(*) AS n FROM bingo_lines WHERE user_id = ?').get(C) as { n: number }).n;
    expect(lines).toBe(9); // 8줄 + 9칸
  });
});
