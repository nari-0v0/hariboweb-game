import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { grantJelly, parseGrant } from '../src/jelly-grant';

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

const A = '100000000000000001';
const NARI = '100000000000000009';
const T = Date.parse('2026-11-16T08:00:00Z');

function setup(jelly: number | null, active = 1) {
  const f = fakeD1();
  f.sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'a', ?, 'x')").run(A, active);
  if (jelly != null) f.sql.prepare("INSERT INTO profiles (user_id, dogam_jelly, updated_at) VALUES (?, ?, 'x')").run(A, jelly);
  const jellyOf = () => (f.sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get(A) as { dogam_jelly: number } | undefined)?.dogam_jelly;
  const grants = () => f.sql.prepare('SELECT id, amount, reason, granted_by, applied_at IS NOT NULL AS applied FROM jelly_grants').all();
  return { ...f, jellyOf, grants };
}

const grant = (over: Record<string, unknown> = {}) => {
  const p = parseGrant({ id: 'g1', user: A, amount: 10, reason: '이벤트 상품', by: NARI, ...over });
  if (!p.ok) throw new Error(p.error);
  return p.value;
};

describe('나리 전용 도감 젤리 지급', () => {
  it('주면 잔액이 늘고 기록이 남아요', async () => {
    const { db, jellyOf, grants } = setup(5);
    expect(await grantJelly(db, grant(), T)).toEqual({ result: 'applied', balance: 15 });
    expect(jellyOf()).toBe(15);
    expect(grants()).toEqual([{ id: 'g1', amount: 10, reason: '이벤트 상품', granted_by: NARI, applied: 1 }]);
  });

  it('같은 번호를 다시 보내도 한 번만 반영돼요', async () => {
    const { db, jellyOf } = setup(0);
    await grantJelly(db, grant(), T);
    expect(await grantJelly(db, grant(), T + 1000)).toEqual({ result: 'duplicate', balance: 10 });
    expect(jellyOf()).toBe(10);
  });

  it('프로필이 아직 없어도 받아요', async () => {
    const { db, jellyOf } = setup(null);
    expect((await grantJelly(db, grant({ amount: 3 }), T)).result).toBe('applied');
    expect(jellyOf()).toBe(3);
  });

  it('빼기는 0개 밑으로 내려가지 않아요', async () => {
    const { db, jellyOf } = setup(4);
    expect(await grantJelly(db, grant({ amount: -10 }), T)).toEqual({ result: 'applied', balance: 0 });
    expect(jellyOf()).toBe(0);
  });

  it('서버에 없는 사람에게는 주지 않고 기록도 반영 안 됨으로 남아요', async () => {
    const { db, jellyOf, grants } = setup(7, 0);
    expect(await grantJelly(db, grant(), T)).toEqual({ result: 'no_member', balance: null });
    expect(jellyOf()).toBe(7);
    expect(grants()).toEqual([]);
  });

  it('잘못된 값은 받지 않아요', () => {
    expect(parseGrant({ id: 'g', user: A, amount: 0, by: NARI }).ok).toBe(false);
    expect(parseGrant({ id: 'g', user: A, amount: 10001, by: NARI }).ok).toBe(false);
    expect(parseGrant({ id: 'g', user: A, amount: 1.5, by: NARI }).ok).toBe(false);
    expect(parseGrant({ id: 'g', user: 'x', amount: 1, by: NARI }).ok).toBe(false);
    expect(parseGrant({ id: 'a b', user: A, amount: 1, by: NARI }).ok).toBe(false);
    const long = parseGrant({ id: 'g', user: A, amount: 1, by: NARI, reason: '가'.repeat(300) });
    expect(long.ok && [...(long.value.reason ?? '')].length).toBe(100);
  });
});
