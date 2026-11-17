// 실제 마이그레이션을 node:sqlite 메모리 DB에 올리고 applySync를 돌려 봐요(D1과 같은 SQLite).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';
import { levelFromXp } from '../src/levels';
import { claimedCardSteps, settleCardRewards } from '../src/card-rewards';
import { applySync, batchTime, isStaleBatch, levelSql, parseSync } from '../src/sync';

const A = '111111111111111111';
const B = '222222222222222222';
const STARTED = new Date().toISOString(); // 테스트 묶음 번호 앞에 붙는 만든 시각
vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

// D1에서 쓰는 만큼만 흉내 내요. batch는 한 트랜잭션이에요.
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
  return { sql, db: db as unknown as D1Database };
}

function batch(id: string, xp: number, extra: Record<string, unknown> = {}) {
  const r = parseSync({
    batch_id: /^\d/.test(id) ? id : `${STARTED}-${id}`,
    members: [
      { id: A, name: 'a' },
      { id: B, name: 'b' },
    ],
    pair_xp: xp ? [{ a: A, b: B, xp, at: '2026-11-01T00:00:00Z' }] : [],
    ...extra,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const jellyOf = (sql: DatabaseSync, id: string) =>
  (sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get(id) as { dogam_jelly: number } | undefined)?.dogam_jelly ?? 0;

describe('levelSql', () => {
  it('matches levelFromXp', () => {
    const sql = new DatabaseSync(':memory:');
    for (const xp of [0, 1, 29, 30, 31, 119, 120, 2430, 72029, 72030, 999999]) {
      const row = sql.prepare(`SELECT ${levelSql('?')} AS l`).get(xp) as { l: number };
      expect(row.l).toBe(levelFromXp(xp));
    }
  });
});

it('활동이 이미 반영된 묶음을 다시 받으면 빠진 첫 선물만 지급해요', async () => {
  const { sql, db } = fakeD1();
  const payload = batch('retry-starter', 0, { solo_xp: [{ id: A, xp: 20 }] });
  await applySync(db, payload);
  expect(jellyOf(sql, A)).toBe(0);
  const env = { DB: db, BOT_SYNC_SECRET: 'test' } as Env;
  for (let i = 0; i < 2; i++) {
    const response = await app.request('/api/bot/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, env);
    expect(await response.json()).toEqual({ ok: true, result: 'duplicate' });
  }
  expect(sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get(A)).toEqual({ solo_xp: 20, dogam_jelly: 5 });
});

describe('applySync dogam jelly', () => {
  it('gives three jelly per 10-level step, once per step, to both card owners', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, batch('b1', 200)); // 레벨 7
    expect(jellyOf(sql, A)).toBe(0);
    await applySync(db, batch('b2', 200)); // 400xp → 레벨 10
    expect(jellyOf(sql, A)).toBe(3);
    expect(jellyOf(sql, B)).toBe(3);
    await applySync(db, batch('b3', 20)); // 420xp, 그대로 레벨 10
    expect(jellyOf(sql, A)).toBe(3);
    expect(await applySync(db, batch('b2', 200))).toBe('duplicate');
    expect(jellyOf(sql, A)).toBe(3);
    await applySync(db, batch('b4', 3600)); // 4020xp → 레벨 30, 단계 2개 더
    expect(jellyOf(sql, A)).toBe(9);
  });

  it('adds bot-counted jelly and skips people not in the server', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, batch('b1', 0, { jelly_earned: [{ id: A, amount: 3 }, { id: '333333333333333333', amount: 1 }] }));
    expect(jellyOf(sql, A)).toBe(3);
    expect(jellyOf(sql, '333333333333333333')).toBe(0);
  });

  it('starts old cards at their current level when the migration runs', () => {
    const { sql } = fakeD1();
    // 마이그레이션 문장을 다시 돌려도 지금 레벨로 맞춰요
    sql.exec(`INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES ('${A}', '${B}', 500, 0, 0, 'x', 'x')`);
    const migration = readFileSync(join(process.cwd(), 'migrations', '0005_level_curve_100.sql'), 'utf8');
    const line = migration.split('\n').find((l) => l.startsWith('UPDATE cards SET jelly_level'))!;
    sql.exec(line);
    const row = sql.prepare('SELECT jelly_level FROM cards').get() as { jelly_level: number };
    expect(row.jelly_level).toBe(15); // 이 마이그레이션은 예전 곡선(2.25)으로 계산했어요
  });
});

describe('sync batch records stay small', () => {
  const NOW = Date.parse('2026-11-01T00:00:00Z');
  it('reads the time in a bot batch id', () => {
    expect(batchTime('2026-11-01T00:10:00Z-1a2b3c4d')).toBe(Date.parse('2026-11-01T00:10:00Z'));
    expect(batchTime('x')).toBeNull();
    expect(isStaleBatch('2026-10-01T00:00:00Z-aa', NOW)).toBe(true);
    expect(isStaleBatch('2026-10-20T00:00:00Z-aa', NOW)).toBe(false);
    expect(isStaleBatch('x', NOW)).toBe(true); // 만든 시각이 없으면 받지 않아요
    expect(isStaleBatch('2026-11-03T00:00:00Z-aa', NOW)).toBe(true); // 하루 넘게 미래
  });

  it('drops records older than 30 days and refuses batches older than 25 days', async () => {
    const { sql, db } = fakeD1();
    sql.exec("INSERT INTO sync_batches (batch_id, applied_at) VALUES ('old', '2026-09-01T00:00:00.000Z'), ('recent', '2026-10-25T00:00:00.000Z')");
    expect(await applySync(db, batch('2026-11-01T00:00:00Z-aa', 10), NOW)).toBe('applied');
    const ids = (sql.prepare('SELECT batch_id FROM sync_batches ORDER BY batch_id').all() as { batch_id: string }[]).map((r) => r.batch_id);
    expect(ids).toEqual(['2026-11-01T00:00:00Z-aa', 'recent']);
    expect(await applySync(db, batch('2026-10-01T00:00:00Z-bb', 10), NOW)).toBe('stale');
    const xp = sql.prepare('SELECT xp FROM cards WHERE owner_id = ?').get(A) as { xp: number };
    expect(xp.xp).toBe(10);
  });
});

describe('character pick retries after a clash', () => {
  it('reads again and picks again when someone took the same character at the same time', async () => {
    const { sql, db } = fakeD1();
    sql.prepare("INSERT OR REPLACE INTO members (user_id, display_name, active, updated_at) VALUES (?, 'a', 1, 'x')").run(A);
    const realBatch = db.batch.bind(db);
    let calls = 0;
    (db as unknown as { batch: typeof db.batch }).batch = (async (list: D1PreparedStatement[]) => {
      calls++;
      if (calls === 1) throw new Error('D1_ERROR: UNIQUE constraint failed: profiles.character_sig');
      return realBatch(list);
    }) as typeof db.batch;
    const { assignCharacters } = await import('../src/db');
    await assignCharacters(db, [A]);
    expect(calls).toBe(2);
    const row = sql.prepare('SELECT character_id FROM profiles WHERE user_id = ?').get(A) as { character_id: string };
    expect(row.character_id).toBeTruthy();
  });
  it('does not recreate a profile for someone who left in the same batch', async () => {
    const { sql, db } = fakeD1();
    sql.prepare("INSERT OR REPLACE INTO members (user_id, display_name, active, updated_at) VALUES (?, 'a', 0, 'x')").run(A);
    const { assignCharacters } = await import('../src/db');
    await assignCharacters(db, [A]);
    expect(sql.prepare('SELECT 1 FROM profiles WHERE user_id = ?').get(A)).toBeUndefined();
  });
});

describe('rejoined member titles', () => {
  it('counts only personal records made after the member left', async () => {
    const { sql, db } = fakeD1();
    sql.prepare("INSERT OR REPLACE INTO members (user_id, display_name, active, reset_at, updated_at) VALUES (?, 'a', 1, '2026-10-10T00:00:00.000Z', 'x')").run(A);
    sql.prepare("INSERT INTO praises (day, from_id, to_id, created_at) VALUES ('2026-10-01', 'z', ?1, '2026-10-01T00:00:00.000Z'), ('2026-10-02', ?1, 'z', '2026-10-02T00:00:00.000Z'), ('2026-10-20', 'z', ?1, '2026-10-20T00:00:00.000Z')").run(A);
    sql.prepare("INSERT INTO bingo_lines (week, user_id, line, mark, created_at) VALUES ('w1', ?, 0, 'x', '2026-10-01T00:00:00.000Z')").run(A);
    sql.prepare("INSERT INTO season_titles (season_id, user_id, title, created_at) VALUES ('s1', ?, 't', '2026-10-01T00:00:00.000Z')").run(A);
    // 나가기 전에 끝난 시즌(s0)은 빼고, 다시 들어온 뒤 끝난 시즌(s2)만 세요
    sql.prepare("INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES ('s0', '2026-09-01T00:00:00.000Z', '2026-09-15T00:00:00.000Z', 'x'), ('s2', '2026-10-15T00:00:00.000Z', '2026-10-29T00:00:00.000Z', 'x')").run();
    sql.prepare("INSERT INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES ('s0', ?1, 0, 1, 'x'), ('s2', ?1, 0, 1, 'x')").run(A);
    (db as unknown as { batch: unknown }).batch = async (list: { query: string; args: never[] }[]) =>
      list.map((x) => ({ results: /^\s*SELECT/i.test(x.query) ? sql.prepare(x.query).all(...x.args) : [], meta: {} }));
    const { loadTitleStats } = await import('../src/title-db');
    const st = await loadTitleStats(db, A, '2026-11-01T00:00:00.000Z');
    expect([st.praiseGot, st.praiseGave, st.bingoLines, st.fullClears]).toEqual([1, 0, 0, 0]);
    expect(st.seasons).toHaveLength(1);
  });
});

describe('초기화 전 동기화 기록', () => {
  const reset = '2026-11-15T03:00:00.000Z';
  const before = '2026-11-14T03:00:00.000Z';
  const after = '2026-11-15T04:00:00.000Z';
  const room = '900000000000000001';
  function setup() {
    const f = fakeD1();
    for (const id of [A, B]) f.sql.prepare('INSERT INTO members (user_id, display_name, active, reset_at, updated_at) VALUES (?, ?, 1, ?, ?)').run(id, id, reset, reset);
    return f;
  }
  it('늦게 도착한 초기화 전 묶음이 카드·레벨 젤리·혼자 경험치·출석 젤리·빙고를 되살리지 않아요', async () => {
    const { sql, db } = setup();
    const p = batch(`${before}-pending`, 400, {
      pair_xp: [{ a: A, b: B, xp: 400, at: before }],
      solo_xp: [{ id: A, xp: 20 }], jelly_earned: [{ id: A, amount: 4 }],
      room_minutes: [{ at: before, room, members: [A, B] }],
      attendance: [{ id: A, day: '2026-11-14' }],
    });
    expect(await applySync(db, p, Date.parse(after))).toBe('applied');
    expect(await applySync(db, p, Date.parse(after))).toBe('duplicate');
    for (const table of ['cards', 'profiles', 'bingo_day', 'bingo_pair', 'pair_day', 'member_voice_day'])
      expect(sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
  });
  it('새 묶음에 섞인 예전 통화도 빼고 초기화 뒤 활동은 한 번만 줘요', async () => {
    const { sql, db } = setup();
    const p = batch(`${after}-mixed`, 0, {
      pair_xp: [{ a: A, b: B, xp: 400, at: before }, { a: A, b: B, xp: 400, at: after }],
      solo_xp: [{ id: A, xp: 20 }], jelly_earned: [{ id: A, amount: 4 }],
      room_minutes: [{ at: before, room, members: [A, B] }, { at: after, room, members: [A, B] }],
      attendance: [{ id: A, day: '2026-11-14' }, { id: A, day: '2026-11-15' }],
    });
    await applySync(db, p, Date.parse(after));
    await applySync(db, p, Date.parse(after));
    expect(sql.prepare('SELECT xp, first_met, jelly_level FROM cards WHERE owner_id = ?').get(A)).toEqual({ xp: 400, first_met: after, jelly_level: 10 });
    expect(sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get(A)).toEqual({ solo_xp: 20, dogam_jelly: 7 });
    expect(sql.prepare('SELECT SUM(minutes) AS n, SUM(attended) AS a FROM bingo_day WHERE user_id = ?').get(A)).toEqual({ n: 1, a: 1 });
    expect(sql.prepare('SELECT SUM(minutes) AS n FROM member_voice_day WHERE user_id = ?').get(A)).toEqual({ n: 1 });
  });
});

describe('도감 카드 장수 보상', () => {
  const others = Array.from({ length: 10 }, (_, i) => `30000000000000000${i}`);
  const cardBatch = (id: string, partners: string[], removed: string[] = []) => {
    const r = parseSync({
      batch_id: `${STARTED}-${id}`,
      members: [{ id: A, name: 'a' }, ...others.filter((o) => !removed.includes(o)).map((o) => ({ id: o, name: o }))],
      pair_xp: partners.map((b) => ({ a: A, b, xp: 1, at: '2026-11-01T00:00:00Z' })),
      ...(removed.length ? { removed } : {}),
    });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const alertsOf = (sql: DatabaseSync, id: string) =>
    (sql.prepare('SELECT ref, body FROM alerts WHERE user_id = ? ORDER BY ref').all(id) as { ref: string; body: string }[]);

  it('5·10장에 처음 닿을 때 한 번씩 젤리와 알림을 줘요', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, cardBatch('c4', others.slice(0, 4)));
    expect(jellyOf(sql, A)).toBe(0);
    await applySync(db, cardBatch('c5', others.slice(0, 5)));
    expect(jellyOf(sql, A)).toBe(1);
    expect(alertsOf(sql, A).map((a) => a.ref)).toEqual(['cards-5']);
    // 같은 장수로 또 와도 더 주지 않아요
    await applySync(db, cardBatch('c5b', others.slice(0, 5)));
    expect(jellyOf(sql, A)).toBe(1);
    await applySync(db, cardBatch('c10', others));
    expect(jellyOf(sql, A)).toBe(2);
    expect(alertsOf(sql, A).map((a) => a.ref)).toEqual(['cards-10', 'cards-5']);
    // 상대 쪽(카드 1장)은 받지 않아요
    expect(jellyOf(sql, others[0]!)).toBe(0);
  });

  it('나갔다 돌아온 상대가 있어도 한 번 받은 단계는 다시 주지 않아요', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, cardBatch('l5', others.slice(0, 5)));
    expect(jellyOf(sql, A)).toBe(1);
    sql.prepare('UPDATE members SET active = 0 WHERE user_id = ?').run(others[0]!);
    sql.prepare('UPDATE members SET active = 1 WHERE user_id = ?').run(others[0]!);
    await applySync(db, cardBatch('l5b', others.slice(0, 5)));
    expect(jellyOf(sql, A)).toBe(1);
    expect((sql.prepare('SELECT COUNT(*) AS n FROM card_count_rewards WHERE user_id = ?').get(A) as { n: number }).n).toBe(1);
  });

  it('같은 묶음에서 떠난 상대 카드는 세지 않아요', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, cardBatch('r4', others.slice(0, 4)));
    await applySync(db, cardBatch('r5', [others[4]!], [others[0]!]));
    expect(jellyOf(sql, A)).toBe(0);
    expect(alertsOf(sql, A)).toEqual([]);
  });

  it('장수를 채웠는데 못 받은 단계는 화면을 열 때 받아요(상대 재가입 등)', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, cardBatch('v4', others.slice(0, 4)));
    // 함께한 활동 없이 장수가 5장이 된 경우(예: 떠났던 상대가 돌아옴)
    sql.prepare("INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES (?, ?, 1, 0, 0, 'x', 'x')").run(A, others[5]!);
    expect(jellyOf(sql, A)).toBe(0);
    expect(await settleCardRewards(db, A, 5, await claimedCardSteps(db, A))).toBe(true);
    expect(jellyOf(sql, A)).toBe(1);
    expect(alertsOf(sql, A).map((a) => a.ref)).toEqual(['cards-5']);
    // 다시 열어도 또 주지 않아요
    expect(await settleCardRewards(db, A, 5, await claimedCardSteps(db, A))).toBe(false);
    await settleCardRewards(db, A, 5, new Set());
    expect(jellyOf(sql, A)).toBe(1);
  });
});
