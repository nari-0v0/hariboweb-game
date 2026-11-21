// 하리보 빙고: 팀 퀘스트(가운데 칸), 서버 퀘스트(초록하리보 납치 대소동!), 젤리피, 팀 짜기
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../src/quests';
import { type Person, planGroups, seasonFrom } from '../src/season';
import { applySync, parseSync } from '../src/sync';
import {
  bingoExtras,
  loadPrior,
  OLD_TEAM_RULE,
  TEAM_RULE,
  matesNeeded,
  teamRuleFor,
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
  const E = '5'.repeat(18);
  const mins = (list: [string, string, number][]) => new Map(list.map(([a, b, n]) => [a < b ? `${a}|${b}` : `${b}|${a}`, n]));
  it('필요한 팀원 수 = 4명(나를 뺀 팀원이 더 적으면 모두)', () => {
    expect([1, 2, 3, 4, 5, 9, 10, 11].map(matesNeeded)).toEqual([0, 1, 2, 3, 4, 4, 4, 4]);
  });

  it('팀원 4명과 각각 60분 이상이면 나는 달성, 팀에서 4명이 달성하면 팀 완료', () => {
    const F = '6'.repeat(18);
    const all = [A, B, C, D, E];
    const full: [string, string, number][] = [];
    all.forEach((x, i) => all.slice(i + 1).forEach((y) => full.push([x, y, 60])));
    // 5명 모두 서로 60분 → 모두 달성(각자 4명), 목표 4명
    expect(teamProgress([...all, F], mins(full), new Set())).toMatchObject({ need: 4, target: 4, achievers: [A, B, C, D, E].sort(), complete: true });
    // 한 짝이 59분이면 그 두 사람은 3명뿐이라 아직 → 3명 달성, 미완료
    const short = full.map(([x, y, n]): [string, string, number] => (x === A && y === B ? [x, y, 59] : [x, y, n]));
    expect(teamProgress([...all, F], mins(short), new Set())).toMatchObject({ achievers: [C, D, E], complete: false });
    // 3명 팀은 나머지 2명과 각각, 3명 모두
    expect(teamProgress([A, B, C], mins([[A, B, 60], [B, C, 60], [A, C, 60]]), new Set())).toMatchObject({ need: 2, target: 3, complete: true });
  });

  it('떠난 팀원과 함께한 시간도 세고, 목표는 남은 팀원으로 맞춰요', () => {
    const p = teamProgress([A, B, C, D], mins([[A, B, 60], [A, C, 60], [A, D, 60], [C, D, 40]]), new Set([B]));
    expect(p).toMatchObject({ candidates: [A, C, D], need: 2, target: 3, achievers: [A] });
  });

  it('2026-11-21 전에 시작한 시즌은 예전 규칙(팀 절반과 각각 30분, 팀 절반 달성)으로 판정해요', () => {
    expect(teamRuleFor('2026-11-14')).toBe(OLD_TEAM_RULE);
    expect(teamRuleFor('2026-11-21')).toBe(TEAM_RULE);
    const m = mins([[A, B, 30], [A, C, 30], [B, C, 30], [C, D, 29]]);
    expect(teamProgress([A, B, C, D], m, new Set(), new Map(), OLD_TEAM_RULE)).toMatchObject({ need: 2, target: 2, achievers: [A, B, C], complete: true });
    expect(teamProgress([A, B, C, D], m, new Set())).toMatchObject({ need: 3, target: 4, achievers: [], complete: false });
  });

  it('남은 팀원이 2명보다 적으면 보너스 칸(보상 없음)', () => {
    expect(teamProgress([A], new Map(), new Set())).toMatchObject({ bonus: true, complete: false, target: 0 });
    expect(teamProgress([A, B], new Map(), new Set([B]))).toMatchObject({ bonus: true, target: 0 });
    expect(teamProgress([A, B], mins([[A, B, 60]]), new Set())).toMatchObject({ bonus: false, need: 1, achievers: [A, B], complete: true });
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

  it('시즌을 만들면 납치 목표를 정해요(한 번만)', async () => {
    const { sql, db } = await setup();
    expect(sql.prepare('SELECT newbies, target FROM server_quest').get()).toEqual({ newbies: 1, target: 1 });
    expect((sql.prepare('SELECT COUNT(*) AS n FROM season_quests').get() as { n: number }).n).toBe(0); // 모둠 퀘스트 8개는 안 만들어요
    await applySync(db, payload({ members: [member(A)] }), NOW);
    expect((sql.prepare('SELECT COUNT(*) AS n FROM server_quest').get() as { n: number }).n).toBe(1);
  });

  it('30분 함께하면 가운데 칸, 시즌이 끝나면 목표를 채운 사람만 보상(한 번만)', async () => {
    const { sql, db } = await setup();
    await applySync(db, payload({ room_minutes: [...minutes(30, [A, B, C]), ...minutes(30, [C, D], NOW + 3_600_000)] }), NOW + 7_200_000);
    const season = '2026-11-03';
    const states = await teamStatesFor(db, season, [A, B, C, D]);
    // 4명 팀: 팀원 2명과 30분씩이면 달성, 목표 2명. A·B·C 달성 → 팀 완료, D는 C하고만 30분이라 "팀 완료, 나는 아직"
    expect(states.get(A)).toBe('done');
    expect(states.get(C)).toBe('done');
    expect(states.get(D)).toBe('team-done');
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
    expect(jelly(sql, D) - before[D]!).toBe(5);
    expect([jp(sql, A), jp(sql, C)]).toEqual([3, 3 + 2]);
    // 결과 알림(🔔): 사람마다 한 번, 두 번 정산해도 그대로
    const alerts = sql.prepare('SELECT user_id, ref, title, body FROM alerts ORDER BY user_id').all() as { user_id: string; ref: string; title: string; body: string }[];
    expect(alerts.map((a) => a.user_id)).toEqual([A, B, C, D]);
    expect(alerts[0]).toMatchObject({ ref: 'season:2026-11-03', title: '지난 시즌 퀘스트 결과 (11.3~11.16)' });
    expect(alerts[0]!.body).toBe('🤝 팀 퀘스트 달성! 팀도 완료했어요. 보상: 도감 젤리 3개 + 젤리피 3');
    expect(alerts[2]!.body.split('\n')).toEqual([
      '🤝 팀 퀘스트 달성! 팀도 완료했어요. 보상: 도감 젤리 3개 + 젤리피 3',
      '🟢 납치 대소동: 서버 목표 달성! 참여 보상: 도감 젤리 5개 + 젤리피 2',
    ]);
  });

  it('시즌 종료 뒤 탈퇴했다 재가입한 사람에게 밀린 옛 시즌 보상을 주지 않아요', async () => {
    const { sql, db } = await setup();
    await applySync(db, payload({ room_minutes: minutes(30, [B, C, D]) }), NOW + 3_600_000);
    // 시즌이 끝난 뒤, 정산 전에 나가면 season_members는 옛 시즌에 남아요.
    const left = Date.parse(END) + 5 * 60_000;
    const removed = payload({ removed: [C] });
    removed.batch_id = new Date(left).toISOString() + '-left';
    await applySync(db, removed, left);
    const back = payload({ members: [member(C)] });
    back.batch_id = new Date(left + 60_000).toISOString() + '-back';
    await applySync(db, back, left + 60_000);
    const dBefore = jelly(sql, D);
    await settleEnded(db, Date.parse(END) + 31 * 60_000);
    expect(sql.prepare('SELECT 1 FROM profiles WHERE user_id = ?').get(C)).toBeUndefined();
    expect(jp(sql, C)).toBe(0);
    expect(jelly(sql, D) - dBefore).toBe(3 + 5);
    await settleEnded(db, Date.parse(END) + 32 * 60_000);
    expect(jelly(sql, D) - dBefore).toBe(3 + 5);
  });

  it('같은 시즌에 나갔다 다시 들어오면 나가기 전 통화는 본인 팀 달성·납치 참여에 세지 않아요', async () => {
    const { db } = await setup();
    await applySync(db, payload({ room_minutes: minutes(30, [B, C, D]) }), NOW + 3_600_000);
    expect((await teamStatesFor(db, '2026-11-03', [B, C])).get(C)).toBe('done');
    const t1 = NOW + 2 * 3_600_000;
    const removed = payload({ removed: [C] });
    removed.batch_id = new Date(t1).toISOString() + '-left';
    await applySync(db, removed, t1);
    const back = payload({ members: [member(C)] });
    back.batch_id = new Date(t1 + 60_000).toISOString() + '-back';
    await applySync(db, back, t1 + 60_000);
    // 다시 들어온 C는 처음부터, 함께 있던 B·D 쪽 기록은 그대로예요
    const states = await teamStatesFor(db, '2026-11-03', [B, C]);
    expect(states.get(C)).not.toBe('done');
    expect(states.get(B)).toBe('done');
    const server = (await bingoExtras(db, C, START)).server;
    expect(server).toMatchObject({ kidnapped: [D], met: true });
    expect(server?.participants).toEqual([B, D]);
    // 다시 들어온 뒤 30분을 함께하면 다시 세요
    const again = payload({ members: [member(B), member(C), member(D, true)], room_minutes: minutes(30, [B, C, D], t1 + 120_000) });
    again.batch_id = new Date(t1 + 3_600_000).toISOString() + '-again';
    await applySync(db, again, t1 + 3_600_000);
    expect((await teamStatesFor(db, '2026-11-03', [C])).get(C)).toBe('done');
    expect((await bingoExtras(db, C, START)).server?.participants).toEqual([B, C, D]);
  });

  it('시즌이 끝난 뒤 정산 전에 달성자가 나가도 그 시즌 팀 달성은 그대로예요', async () => {
    const { sql, db } = await setup();
    await applySync(db, payload({ room_minutes: [...minutes(30, [A, B, C])] }), NOW + 3_600_000);
    expect((await teamStatesFor(db, '2026-11-03', [B])).get(B)).toBe('done');
    const left = Date.parse(END) + 5 * 60_000;
    const removed = payload({ removed: [A] });
    removed.batch_id = new Date(left).toISOString() + '-left';
    await applySync(db, removed, left);
    expect((sql.prepare('SELECT COUNT(*) AS n FROM season_pair_reset').get() as { n: number }).n).toBe(0);
    const bBefore = jelly(sql, B);
    await settleEnded(db, Date.parse(END) + 31 * 60_000);
    expect(jelly(sql, B) - bBefore).toBe(3);
  });

  it('초기화 전에 한 통화는 팀 달성·납치 진행으로 되살아나지 않아요', async () => {
    const { sql, db } = await setup();
    const reset = NOW + 2 * 3_600_000;
    sql.prepare('UPDATE members SET reset_at = ?').run(new Date(reset).toISOString());
    await applySync(db, payload({ room_minutes: minutes(30, [B, C, D]) }), reset + 3_600_000);
    expect((await bingoExtras(db, C, START)).server).toMatchObject({ kidnapped: [], participants: [], met: false });
    expect((await teamStatesFor(db, '2026-11-03', [C, D])).get(C)).toBe('todo');
    await applySync(db, payload({ room_minutes: minutes(30, [B, C, D], reset + 60_000) }), reset + 3_600_000);
    expect((await bingoExtras(db, C, START)).server).toMatchObject({ kidnapped: [D], met: true });
    expect((await teamStatesFor(db, '2026-11-03', [C, D])).get(C)).toBe('done');
  });

  it('서버 목표를 못 채우면 아무도 못 받아요', async () => {
    const { sql, db } = await setup();
    sql.exec("UPDATE server_quest SET target = 2");
    await applySync(db, payload({ room_minutes: minutes(30, [B, C, D]) }), NOW + 3_600_000);
    const before = jelly(sql, C);
    await settleEnded(db, Date.parse(END) + 31 * 60_000);
    // 팀 퀘스트 달성(3)만, 서버(5)는 없음
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
    // A·B·D가 함께 30분 → 셋 다 달성, 팀 목표(2명) 넘김. C는 이번 묶음에 기록이 없어요.
    await applySync(db, payload({ room_minutes: minutes(30, [A, B, D]) }), NOW + 7_200_000);
    const lines = (sql.prepare('SELECT COUNT(*) AS n FROM bingo_lines WHERE user_id = ?').get(C) as { n: number }).n;
    expect(lines).toBe(9); // 8줄 + 9칸
  });
});

describe('패널 팀 순위', () => {
  it('목표를 채운 팀 → 달성 비율 → 달성 수 순, 보너스 칸 팀은 맨 뒤', async () => {
    const { rankTeams } = await import('../src/team');
    const t = (no: number, achievers: number, target: number, extra: Partial<{ complete: boolean; bonus: boolean }> = {}) => ({
      no,
      members: Array.from({ length: 10 }, (_, i) => ({ id: `${no}-${i}`, name: 'x', left: false })),
      candidates: [],
      need: 5,
      pairs: [],
      achievers: Array.from({ length: achievers }, (_, i) => `${no}-${i}`),
      target,
      complete: achievers >= target && target > 0,
      bonus: false,
      ...extra,
    });
    const r = rankTeams([t(0, 1, 4), t(1, 0, 0, { bonus: true }), t(2, 3, 3), t(3, 2, 4)]);
    expect(r.map((x) => [x.no, x.rank, x.done, x.total])).toEqual([
      [2, 1, 3, 3],
      [3, 2, 2, 4],
      [0, 3, 1, 4],
      [1, 4, 0, 0],
    ]);
  });
});

describe('팀 짝 고르기: 시즌 시작 전 2주', () => {
  it('2주 경계에 걸친 빙고 기간은 2주 안에 든 만큼만 세요', async () => {
    const { sql, db } = fakeD1([A, B]);
    // 21일 시즌의 절반(10.5일)짜리 기간 둘. 다음 시즌 시작 2주 전은 앞 기간 한가운데쯤이에요.
    sql.prepare('INSERT INTO bingo_periods (id, starts_at, ends_at) VALUES (?, ?, ?)').run('p1', '2026-10-12T15:00:00.000Z', '2026-10-23T03:00:00.000Z');
    sql.prepare('INSERT INTO bingo_periods (id, starts_at, ends_at) VALUES (?, ?, ?)').run('p2', '2026-10-23T03:00:00.000Z', '2026-11-02T15:00:00.000Z');
    sql.prepare('INSERT INTO bingo_pair (week, a, b, minutes) VALUES (?, ?, ?, ?)').run('p1', A, B, 105);
    sql.prepare('INSERT INTO bingo_pair (week, a, b, minutes) VALUES (?, ?, ?, ?)').run('p2', A, B, 0);
    const prior = await loadPrior(db, seasonFrom(START, END));
    // 앞 기간 10.5일 중 2주 안에 든 건 3.5일 → 105분의 1/3
    expect(prior.minutes.get(`${A}|${B}`)).toBe(35);
  });
  it('하루치 짝 기록이 2주 전까지 있으면 그 날짜 안의 통화만 정확히 세요', async () => {
    const { sql, db } = fakeD1([A, B]);
    sql.prepare('INSERT INTO bingo_periods (id, starts_at, ends_at) VALUES (?, ?, ?)').run('p1', '2026-10-12T15:00:00.000Z', '2026-10-23T03:00:00.000Z');
    sql.prepare('INSERT INTO bingo_pair (week, a, b, minutes) VALUES (?, ?, ?, ?)').run('p1', A, B, 15);
    // 2주(한국 10월 20일~11월 2일) 바깥 날 하루, 안쪽 날 15분
    sql.prepare('INSERT INTO pair_day (day, a, b, minutes) VALUES (?, ?, ?, ?)').run('2026-10-19', A, B, 40);
    sql.prepare('INSERT INTO pair_day (day, a, b, minutes) VALUES (?, ?, ?, ?)').run('2026-10-22', A, B, 15);
    const prior = await loadPrior(db, seasonFrom(START, END));
    expect(prior.minutes.get(`${A}|${B}`)).toBe(15);
  });
});

describe('내 팀원별 함께한 시간', () => {
  it('떠난 팀원은 함께한 시간이 있을 때만 보여요(달성에 세니까)', async () => {
    const { myMates } = await import('../src/team');
    const team = {
      no: 0,
      members: [
        { id: A, name: 'a', left: false },
        { id: B, name: 'b', left: true },
        { id: C, name: 'c', left: false },
        { id: D, name: 'd', left: true },
      ],
      pairs: [{ a: A, b: B, minutes: 40 }],
      candidates: [],
      need: 1,
      achievers: [],
      target: 0,
      complete: false,
      bonus: false,
    };
    expect(myMates(team, A).map((m) => [m.id, m.minutes, m.left])).toEqual([
      [B, 40, true],
      [C, 0, false],
    ]);
  });
});
