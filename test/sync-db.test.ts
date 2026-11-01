// 실제 마이그레이션을 node:sqlite 메모리 DB에 올리고 applySync를 돌려 봐요(D1과 같은 SQLite).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { levelFromXp } from '../src/levels';
import { applySync, batchTime, isStaleBatch, levelSql, parseSync } from '../src/sync';

const A = '111111111111111111';
const B = '222222222222222222';

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
    batch_id: id,
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

describe('applySync dogam jelly', () => {
  it('gives one jelly per card level, once per level, to both card owners', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, batch('b1', 20)); // 레벨 1
    expect(jellyOf(sql, A)).toBe(0);
    await applySync(db, batch('b2', 100)); // 120xp → 레벨 3
    expect(jellyOf(sql, A)).toBe(2);
    expect(jellyOf(sql, B)).toBe(2);
    await applySync(db, batch('b3', 10)); // 130xp, 그대로 레벨 3
    expect(jellyOf(sql, A)).toBe(2);
    expect(await applySync(db, batch('b2', 100))).toBe('duplicate');
    expect(jellyOf(sql, A)).toBe(2);
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
    const migration = readFileSync(join(process.cwd(), 'migrations', '0004_dogam_jelly.sql'), 'utf8');
    const line = migration.split('\n').find((l) => l.startsWith('UPDATE cards SET jelly_level'))!;
    sql.exec(line);
    const row = sql.prepare('SELECT jelly_level FROM cards').get() as { jelly_level: number };
    expect(row.jelly_level).toBe(levelFromXp(500));
  });
});

describe('sync batch records stay small', () => {
  const NOW = Date.parse('2026-11-01T00:00:00Z');
  it('reads the time in a bot batch id', () => {
    expect(batchTime('2026-11-01T00:10:00Z-1a2b3c4d')).toBe(Date.parse('2026-11-01T00:10:00Z'));
    expect(batchTime('x')).toBeNull();
    expect(isStaleBatch('2026-10-01T00:00:00Z-aa', NOW)).toBe(true);
    expect(isStaleBatch('2026-10-20T00:00:00Z-aa', NOW)).toBe(false);
    expect(isStaleBatch('x', NOW)).toBe(false);
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
});
