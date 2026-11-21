import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claimDaily, gambleAccount } from '../src/gamble-db';
import { grantPostChips, parsePostChip, revokePostChips } from '../src/post-chips';

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
        const out = list.map((s) => ({ meta: { changes: Number(sql.prepare(s.query).run(...(s.args as never[])).changes) } }));
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sql, db: db as unknown as D1Database };
}

const A = '100000000000000001';
const B = '100000000000000002';
const NOW = Date.parse('2026-11-21T12:00:00Z'); // 한국 21시
const AT = '2026-11-21T11:50:00Z';

function setup() {
  const f = fakeD1();
  for (const id of [A, B]) f.sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'a', 1, 'x')").run(id);
  const chips = (u = A) => (f.sql.prepare('SELECT chips FROM gamble_accounts WHERE user_id = ?').get(u) as { chips: number } | undefined)?.chips;
  return { ...f, chips };
}

const post = (id: string, over: Record<string, unknown> = {}) => {
  const p = parsePostChip({ id, user: A, kind: 'recruit', at: AT, ...over });
  if (!p.ok) throw new Error(p.error);
  return p.value;
};
const ID = (n: number) => `90000000000000000${n}`;

describe('구인구직·디스타그램 글 젤칩', () => {
  it('글 하나에 100개, 같은 글은 한 번만', async () => {
    const { db, chips } = setup();
    expect(await grantPostChips(db, post(ID(1)), NOW)).toEqual({ result: 'applied', left: 3 });
    expect(chips()).toBe(100);
    expect(await grantPostChips(db, post(ID(1)), NOW)).toEqual({ result: 'duplicate', left: 3 });
    expect(chips()).toBe(100);
  });

  it('구인구직·디스타그램 합쳐 하루 4번, 아침 6시에 다시', async () => {
    const { db, chips } = setup();
    for (const [i, kind] of (['recruit', 'distagram', 'distagram', 'recruit'] as const).entries())
      expect((await grantPostChips(db, post(ID(i + 1), { kind }), NOW)).result).toBe('applied');
    expect(await grantPostChips(db, post(ID(5), { kind: 'distagram' }), NOW)).toEqual({ result: 'limit', left: 0 });
    expect(chips()).toBe(400);
    // 다른 사람은 따로 세요
    expect((await grantPostChips(db, post(ID(6), { user: B }), NOW)).result).toBe('applied');
    // 한국 05:59는 아직 같은 날, 06:00부터 새 날
    const late = Date.parse('2026-11-21T21:00:00Z');
    expect((await grantPostChips(db, post(ID(7), { at: '2026-11-21T20:59:00Z' }), late)).result).toBe('limit');
    expect((await grantPostChips(db, post(ID(8), { at: '2026-11-21T21:00:00Z' }), late)).result).toBe('applied');
    expect(chips()).toBe(500);
  });

  it('겜블장에 처음 오면 시작 1000개가 그 위에 더해져요', async () => {
    const { db, chips } = setup();
    await grantPostChips(db, post(ID(1)), NOW);
    expect(await claimDaily(db, A, new Date(NOW).toISOString())).toBe(1000);
    expect(chips()).toBe(1100);
  });

  it('나간 사람·초기화 전 글·오래된 글은 안 줘요', async () => {
    const { db, sql, chips } = setup();
    sql.prepare("UPDATE members SET reset_at = '2026-11-21T11:55:00Z' WHERE user_id = ?").run(A);
    expect((await grantPostChips(db, post(ID(1)), NOW)).result).toBe('no_member');
    expect((await grantPostChips(db, post(ID(2), { at: '2026-11-18T00:00:00Z' }), NOW)).result).toBe('too_old');
    sql.prepare('UPDATE members SET active = 0, reset_at = NULL WHERE user_id = ?').run(B);
    expect((await grantPostChips(db, post(ID(3), { user: B }), NOW)).result).toBe('no_member');
    expect(chips()).toBeUndefined();
    expect(chips(B)).toBeUndefined();
  });

  it('글이 지워지면 다시 빼요. 모자라면 마이너스(빚)로 남고 다음 젤칩에서 먼저 갚아요', async () => {
    const { db, sql, chips } = setup();
    const net = async () => (await gambleAccount(db, A))?.chips;
    await grantPostChips(db, post(ID(1)), NOW);
    await grantPostChips(db, post(ID(2)), NOW);
    expect(chips()).toBe(200);
    expect(await revokePostChips(db, ID(1), NOW)).toEqual({ result: 'revoked', taken: 100 });
    expect(chips()).toBe(100);
    expect(await revokePostChips(db, ID(1), NOW)).toEqual({ result: 'already', taken: 100 });
    expect(chips()).toBe(100);
    expect(await revokePostChips(db, ID(9), NOW)).toEqual({ result: 'not_found', taken: 0 });
    // 이미 30개만 남았으면 -70
    sql.prepare('UPDATE gamble_accounts SET chips = 30 WHERE user_id = ?').run(A);
    expect(await revokePostChips(db, ID(2), NOW)).toEqual({ result: 'revoked', taken: 100 });
    expect(chips()).toBe(0);
    expect(await net()).toBe(-70);
    // 마이너스면 걸 수 없어요(걸 수 있는 젤칩 0)
    // 다음 글 젤칩 100개 → 빚 70 갚고 30
    await grantPostChips(db, post(ID(3)), NOW);
    expect(await net()).toBe(30);
    expect(chips()).toBe(30);
    // 지운 글도 하루 4번에 세요
    expect(await grantPostChips(db, post(ID(4)), NOW)).toEqual({ result: 'applied', left: 0 });
    expect((await grantPostChips(db, post(ID(5)), NOW)).result).toBe('limit');
  });

  it('빚이 있으면 하루 충전·시작 젤칩에서도 먼저 갚아요', async () => {
    const { db, sql, chips } = setup();
    await grantPostChips(db, post(ID(1)), NOW);
    sql.prepare('UPDATE gamble_accounts SET chips = 0 WHERE user_id = ?').run(A);
    await revokePostChips(db, ID(1), NOW); // 0 - 100
    expect((await gambleAccount(db, A))?.chips).toBe(-100);
    expect(await claimDaily(db, A, new Date(NOW).toISOString())).toBe(1000);
    expect(chips()).toBe(900);
    expect((await gambleAccount(db, A))?.chips).toBe(900);
  });

  it('형식이 틀리면 거절', () => {
    expect(parsePostChip({ id: 'x', user: A, kind: 'recruit', at: AT }).ok).toBe(false);
    expect(parsePostChip({ id: ID(1), user: A, kind: 'chat', at: AT }).ok).toBe(false);
    expect(parsePostChip({ id: ID(1), user: A, kind: 'recruit', at: 'nope' }).ok).toBe(false);
  });
});
