// 주간 빙고: 주 경계, 빙고판 뽑기, 기록 모으기, 줄 보상(한 번만)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { fallbackWeek, periodFor, splitCycle, todayPartners, boardFor, bingoView, emptyStats, FULL_JELLY, grantBingo, LINE_JELLY, LINE_XP, LINES, loadStats, markFlag, myBingo, weekOf, weekOfDay, type BingoStats } from '../src/bingo';
import { applySync, parseSync } from '../src/sync';

const A = '111111111111111111';
const B = '222222222222222222';
const C = '333333333333333333';
const D = '444444444444444444';
const ROOM = '900000000000000001';
// 2026-11-02(월) 한국 시간 21:00
const NOW = Date.parse('2026-11-02T12:00:00Z');

function fakeD1() {
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
  for (const id of [A, B, C, D])
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `m${id[0]}`);
  return { sql, db: db as unknown as D1Database };
}

const profileOf = (sql: DatabaseSync, id: string) =>
  (sql.prepare('SELECT dogam_jelly, solo_xp FROM profiles WHERE user_id = ?').get(id) as { dogam_jelly: number; solo_xp: number } | undefined) ?? {
    dogam_jelly: 0,
    solo_xp: 0,
  };

const full = (): BingoStats => ({
  voice: 9999, crowd: 9999, night: 9999, weekend: 9999, voiceDays: 7, attendDays: 7, partners: 99,
  bestPair: 9999, newFriends: 9, praiseGiven: 99, praiseGot: 99, panel: 1, web: 1,
});

describe('주', () => {
  it('한국 시간 월요일 0시에 바뀌어요', () => {
    expect(weekOf(Date.parse('2026-11-01T14:59:59Z')).id).toBe('2026-10-26'); // 일요일 23:59:59 KST
    const w = weekOf(Date.parse('2026-11-01T15:00:00Z')); // 월요일 0시 KST
    expect(w).toEqual({ id: '2026-11-02', start: '2026-11-01T15:00:00.000Z', end: '2026-11-08T15:00:00.000Z' });
    expect(weekOfDay('2026-11-08').id).toBe('2026-11-02');
    expect(weekOfDay('2026-11-09').id).toBe('2026-11-09');
  });
});

describe('빙고판', () => {
  it('개인 칸 8개 모두 다른 종류이고 쉬움 3·보통 3·어려움 2, 같은 주에는 늘 같아요', () => {
    for (const u of [A, B, C, D]) {
      const board = boardFor('2026-11-02', u);
      expect(board).toHaveLength(8);
      expect(new Set(board.map((c) => c.def.id)).size).toBe(8);
      expect(board.some((c) => c.def.id === 'new')).toBe(false);
      const count = (d: string) => board.filter((c) => c.diff === d).length;
      expect([count('easy'), count('normal'), count('hard')]).toEqual([3, 3, 2]);
      expect(boardFor('2026-11-02', u).map((c) => c.def.id)).toEqual(board.map((c) => c.def.id));
    }
    expect(boardFor('2026-11-02', A).map((c) => c.def.id)).not.toEqual(boardFor('2026-11-09', A).map((c) => c.def.id));
  });

  it('줄과 보상을 세요', () => {
    const week = fallbackWeek(NOW);
    expect(bingoView(week, A, emptyStats())).toMatchObject({ lines: [], filled: 0, full: false, jelly: 0 });
    const v = bingoView(week, A, full(), 'done');
    expect(v.cells).toHaveLength(9);
    expect(v.cells[4]).toMatchObject({ id: 'team', center: true, done: true });
    expect(v.lines).toHaveLength(LINES.length);
    expect(v.full).toBe(true);
    expect(v.jelly).toBe(LINES.length * LINE_JELLY + FULL_JELLY);
  });

  it('가운데 칸(팀 퀘스트): 아직이면 가운데를 지나는 줄은 안 되고, 팀 완료·보너스 칸이면 채워져요', () => {
    const week = fallbackWeek(NOW);
    const todo = bingoView(week, A, full(), 'todo');
    expect(todo.cells[4]!.done).toBe(false);
    expect(todo.lines).toEqual([0, 2, 3, 5]);
    expect(bingoView(week, A, full(), 'none').cells[4]!.done).toBe(false);
    for (const s of ['team-done', 'bonus'] as const) expect(bingoView(week, A, full(), s).full).toBe(true);
  });
});

describe('기록 모으기', () => {
  it('통화방 1분과 출석을 사람·날·짝으로 모아요', async () => {
    const { sql, db } = fakeD1();
    // 한국 시간 23:00(밤)에 4명이 3분
    const room_minutes = [0, 1, 2].map((m) => ({ at: `2026-11-02T14:0${m}:00Z`, room: ROOM, members: [A, B, C, D] }));
    const r = parseSync({
      batch_id: '2026-11-02T14:05:00Z-x',
      members: [A, B, C, D].map((id) => ({ id, name: id })),
      room_minutes,
      attendance: [{ id: A, day: '2026-11-02' }],
    });
    if (!r.ok) throw new Error(r.error);
    await applySync(db, r.value, Date.parse('2026-11-02T14:06:00Z'));
    const row = sql.prepare('SELECT minutes, crowd, night, attended FROM bingo_day WHERE user_id = ?').get(A);
    expect(row).toEqual({ minutes: 3, crowd: 3, night: 3, attended: 1 });
    expect((sql.prepare('SELECT COUNT(*) AS n FROM bingo_pair').get() as { n: number }).n).toBe(6);
    // 같은 묶음을 다시 보내도 두 번 세지 않아요
    await applySync(db, r.value, Date.parse('2026-11-02T14:07:00Z'));
    expect((sql.prepare('SELECT minutes FROM bingo_day WHERE user_id = ?').get(A) as { minutes: number }).minutes).toBe(3);
    const stats = (await loadStats(db, fallbackWeek(NOW), [A])).get(A)!;
    expect(stats).toMatchObject({ voice: 3, crowd: 3, night: 3, attendDays: 1, partners: 0, bestPair: 3 });
  });

  it('칭찬, 패널 열기, 처음 만난 사람을 읽어요', async () => {
    const { sql, db } = fakeD1();
    const week = fallbackWeek(NOW);
    sql.exec(`INSERT INTO praises (day, from_id, to_id, jelly, created_at) VALUES ('2026-11-02', '${A}', '${B}', 1, '2026-11-02T01:00:00.000Z#a'), ('2026-11-03', '${A}', '${C}', 1, '2026-11-03T01:00:00.000Z#b'), ('2026-11-01', '${A}', '${D}', 1, '2026-11-01T01:00:00.000Z#c')`);
    sql.exec(`INSERT INTO bingo_pair (week, a, b, minutes) VALUES ('${week.id}', '${A}', '${B}', 40), ('${week.id}', '${A}', '${C}', 5)`);
    sql.exec(`INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES ('${A}', '${B}', 1, 0, 0, '2026-11-02T00:00:00.000Z', 'x'), ('${A}', '${C}', 1, 0, 0, '2026-10-01T00:00:00.000Z', 'x')`);
    expect(await markFlag(db, A, 'panel', NOW)).toBe(true);
    expect(await markFlag(db, A, 'panel', NOW)).toBe(false);
    const s = await loadStats(db, week, [A, B]);
    expect(s.get(A)).toMatchObject({ praiseGiven: 2, partners: 1, bestPair: 40, newFriends: 1, panel: 1, web: 0 });
    expect(s.get(B)).toMatchObject({ praiseGot: 1, partners: 1 });
  });
});

describe('줄 보상', () => {
  function fill(sql: DatabaseSync, id: string) {
    const week = fallbackWeek(NOW).id;
    for (let i = 0; i < 7; i++) {
      const day = `2026-11-0${2 + i}`;
      sql.prepare('INSERT INTO bingo_day (week, user_id, day, minutes, crowd, night, attended) VALUES (?, ?, ?, 600, 600, 600, 1)').run(week, id, day);
    }
    const others = Array.from({ length: 8 }, (_, i) => `5${String(i).padStart(17, '0')}`);
    for (const o of others) {
      sql.prepare('INSERT INTO bingo_pair (week, a, b, minutes) VALUES (?, ?, ?, 600)').run(week, id, o);
      sql.prepare("INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES (?, ?, 1, 0, 0, '2026-11-03T00:00:00.000Z', 'x')").run(id, o);
      for (const day of ['2026-11-02', '2026-11-03']) {
        sql.prepare("INSERT INTO praises (day, from_id, to_id, jelly, created_at) VALUES (?, ?, ?, 0, ?)").run(day, id, o, `${day}T03:00:00.000Z#g`);
        sql.prepare("INSERT INTO praises (day, from_id, to_id, jelly, created_at) VALUES (?, ?, ?, 0, ?)").run(day, o, id, `${day}T03:00:00.000Z#r`);
      }
    }
    sql.prepare("INSERT INTO bingo_flag (week, user_id, flag) VALUES (?, ?, 'panel'), (?, ?, 'web')").run(week, id, week, id);
    // 가운데 칸: 이 시즌 팀 퀘스트 짝과 30분
    const p = fallbackWeek(NOW);
    sql.prepare("INSERT OR IGNORE INTO seasons (id, starts_at, ends_at, created_at) VALUES ('s1', ?, ?, 'x')").run(p.start, p.end);
    sql.prepare("INSERT INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES ('s1', ?, 0, 1, 'x')").run(id);
    sql.prepare("INSERT INTO team_pairs (season_id, group_no, a, b) VALUES ('s1', 0, ?, ?)").run(id, others[0]);
    sql.prepare("INSERT INTO gq_pair (season_id, group_no, a, b, minutes) VALUES ('s1', 0, ?, ?, 30)").run(id, others[0]);
  }

  it('줄마다 한 번만, 9칸을 다 채우면 더 줘요', async () => {
    const { sql, db } = fakeD1();
    fill(sql, A);
    const views = await grantBingo(db, fallbackWeek(NOW), [A], NOW);
    expect(views.get(A)!.full).toBe(true);
    const want = { dogam_jelly: LINES.length * LINE_JELLY + FULL_JELLY, solo_xp: LINES.length * LINE_XP };
    expect(profileOf(sql, A)).toEqual(want);
    await grantBingo(db, fallbackWeek(NOW), [A], NOW + 1000);
    expect(profileOf(sql, A)).toEqual(want);
    expect((sql.prepare('SELECT COUNT(*) AS n FROM bingo_lines').get() as { n: number }).n).toBe(LINES.length + 1);
    // 젤리피: 한 줄 1, 9칸 3 (두 번 확인해도 한 번만)
    expect(sql.prepare("SELECT SUM(amount) AS n, MIN(season_id) AS s FROM jellypi WHERE user_id = ?").get(A)).toEqual({ n: LINES.length + 3, s: 's1' });
  });

  it('기간 마지막 순간에 내 카드를 열어도 그 판에 보상을 줘요', async () => {
    const { sql, db } = fakeD1();
    const week = fallbackWeek(NOW);
    const user = Array.from({ length: 100 }, (_, i) => `7${String(i).padStart(17, '0')}`)
      .find((id) => boardFor(week.id, id).some((cell) => cell.def.id === 'web'))!;
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'test', 1, 'x')").run(user);
    fill(sql, user);
    sql.prepare("DELETE FROM bingo_flag WHERE week = ? AND user_id = ? AND flag = 'web'").run(week.id, user);
    await grantBingo(db, week, [user], NOW);
    expect(profileOf(sql, user).dogam_jelly).toBeLessThan(LINES.length * LINE_JELLY + FULL_JELLY);
    expect(await markFlag(db, user, 'web', Date.parse(week.end) - 1)).toBe(true);
    const want = { dogam_jelly: LINES.length * LINE_JELLY + FULL_JELLY, solo_xp: LINES.length * LINE_XP };
    expect(profileOf(sql, user)).toEqual(want);
    expect(await markFlag(db, user, 'web', Date.parse(week.end) - 1)).toBe(false);
    expect(profileOf(sql, user)).toEqual(want);
  });

  it('끝난 기간의 줄 보상을 못 받았으면 빙고를 열 때 다시 받아요(한 번만)', async () => {
    const { sql, db } = fakeD1();
    fill(sql, B);
    const after = Date.parse(fallbackWeek(NOW).end) + 3_600_000; // 다음 주로 넘어간 뒤
    await myBingo(db, B, after);
    const got = profileOf(sql, B);
    expect(got.dogam_jelly).toBeGreaterThan(0);
    await myBingo(db, B, after);
    expect(profileOf(sql, B)).toEqual(got);
  });

  it('서버를 떠난 사람은 받지 않아요', async () => {
    const { sql, db } = fakeD1();
    fill(sql, B);
    sql.prepare('UPDATE members SET active = 0 WHERE user_id = ?').run(B);
    await grantBingo(db, fallbackWeek(NOW), [B], NOW);
    expect(profileOf(sql, B)).toEqual({ dogam_jelly: 0, solo_xp: 0 });
  });
});

describe('칭찬하기용 오늘 같이 통화한 사람', () => {
  it('동기화 기록으로 알고, 3일 지난 줄은 지워요', async () => {
    const { sql, db } = fakeD1();
    sql.exec(`INSERT INTO pair_day (day, a, b, minutes) VALUES ('2026-10-28', '${A}', '${C}', 9)`);
    const r = parseSync({
      batch_id: '2026-11-02T14:05:00Z-y',
      members: [A, B, C].map((id) => ({ id, name: id })),
      room_minutes: [0, 1].map((m) => ({ at: `2026-11-02T14:0${m}:00Z`, room: ROOM, members: [A, B] })),
    });
    if (!r.ok) throw new Error(r.error);
    await applySync(db, r.value, Date.parse('2026-11-02T14:06:00Z'));
    expect(await todayPartners(db, B, '2026-11-02')).toEqual([{ id: A, minutes: 2 }]);
    expect(await todayPartners(db, A, '2026-11-02')).toEqual([{ id: B, minutes: 2 }]);
    expect((sql.prepare('SELECT COUNT(*) AS n FROM pair_day').get() as { n: number }).n).toBe(1);
  });
});

describe('빙고 기간 = 생명력 주기의 절반', () => {
  it('주기를 반으로 나누고, 동기화 기록은 그 절반에 쌓여요', async () => {
    const halves = splitCycle('2026-11-02T21:00:00.000Z', '2026-11-16T21:00:00.000Z');
    expect(halves).toEqual([
      { id: '2026-11-03', start: '2026-11-02T21:00:00.000Z', end: '2026-11-09T21:00:00.000Z' },
      { id: '2026-11-10', start: '2026-11-09T21:00:00.000Z', end: '2026-11-16T21:00:00.000Z' },
    ]);
    expect(periodFor(Date.parse('2026-11-10T00:00:00Z'), halves).id).toBe('2026-11-10');
    // 주기를 모르면 월요일 기준 주
    expect(periodFor(NOW, []).id).toBe('w2026-11-02');

    const { sql, db } = fakeD1();
    const r = parseSync({
      batch_id: '2026-11-10T00:05:00Z-c',
      members: [A, B].map((id) => ({ id, name: id })),
      season: { start: '2026-11-02T21:00:00Z', end: '2026-11-16T21:00:00Z' },
      room_minutes: [{ at: '2026-11-10T00:00:00Z', room: ROOM, members: [A, B] }],
      attendance: [{ id: A, day: '2026-11-03' }],
    });
    if (!r.ok) throw new Error(r.error);
    await applySync(db, r.value, Date.parse('2026-11-10T00:06:00Z'));
    expect(sql.prepare('SELECT id FROM bingo_periods ORDER BY id').all()).toEqual([{ id: '2026-11-03' }, { id: '2026-11-10' }]);
    expect(sql.prepare('SELECT week, day, minutes, attended FROM bingo_day WHERE user_id = ? ORDER BY day').all(A)).toEqual([
      { week: '2026-11-03', day: '2026-11-03', minutes: 0, attended: 1 },
      { week: '2026-11-10', day: '2026-11-10', minutes: 1, attended: 0 },
    ]);
  });
  it('경계 날의 칭찬은 칭찬한 시각의 빙고판에만 세요', async () => {
    const { sql, db } = fakeD1();
    const [first, second] = splitCycle('2026-11-02T21:00:00.000Z', '2026-11-16T21:00:00.000Z');
    // 11월 10일(한국) 05:00은 앞 판, 09:00은 뒤 판
    sql.exec(`INSERT INTO praises (day, from_id, to_id, jelly, created_at) VALUES
      ('2026-11-10', '${A}', '${B}', 1, '2026-11-09T20:00:00.000Z#a'),
      ('2026-11-10', '${A}', '${C}', 1, '2026-11-10T00:00:00.000Z#b')`);
    expect((await loadStats(db, first!, [A])).get(A)!.praiseGiven).toBe(1);
    expect((await loadStats(db, second!, [A])).get(A)!.praiseGiven).toBe(1);
  });
});

describe('임시 주와 진짜 빙고 기간', () => {
  it('주기를 모를 때 채운 칸은 같은 날 시작하는 진짜 기간으로 넘어가지 않아요', async () => {
    const { sql, db } = fakeD1();
    const [half] = splitCycle('2026-11-09T09:00:00.000Z', '2026-11-23T09:00:00.000Z');
    const before = Date.parse(half!.start) - 3_600_000;
    expect(await markFlag(db, A, 'panel', before)).toBe(true);
    sql.prepare('INSERT INTO bingo_periods (id, starts_at, ends_at) VALUES (?, ?, ?)').run(half!.id, half!.start, half!.end);
    expect(await markFlag(db, A, 'panel', Date.parse(half!.start) + 60_000)).toBe(true);
  });
});
