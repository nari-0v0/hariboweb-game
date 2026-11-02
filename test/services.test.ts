import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listPendingServices, requestService, serviceState, settleService } from '../src/db';
import { SERVICES, serviceItem, servicePrice } from '../src/shop';
import { resultLines } from '../src/views/shop';

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

function setup(jelly: number) {
  const f = fakeD1();
  f.sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'a', 1, 'x')").run(A);
  f.sql.prepare("INSERT INTO profiles (user_id, dogam_jelly, updated_at) VALUES (?, ?, 'x')").run(A, jelly);
  const jellyOf = () => (f.sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get(A) as { dogam_jelly: number }).dogam_jelly;
  return { ...f, jellyOf };
}

describe('디스코드 물건(벌점·경고 지우기, 닉네임 변경권)', () => {
  it('값은 살 때마다 1.5배(올림), 닉네임 변경권은 그대로', () => {
    const penalty = serviceItem('svc:penalty')!;
    expect([0, 1, 2, 3].map((n) => servicePrice(penalty, n))).toEqual([100, 150, 225, 338]);
    expect(servicePrice(serviceItem('svc:nickname')!, 9)).toBe(5);
    expect(SERVICES.map((s) => s.id)).toEqual(['svc:penalty', 'svc:warning', 'svc:nickname']);
  });

  it('젤리를 먼저 빼고 봇에게 맡기고, 같은 물건은 하나씩만', async () => {
    const { db, jellyOf } = setup(300);
    expect(await requestService(db, A, 'svc:penalty', 100)).toBe('pending');
    expect(jellyOf()).toBe(200);
    expect(await requestService(db, A, 'svc:penalty', 100)).toBe('busy');
    expect(jellyOf()).toBe(200);
    expect(await requestService(db, A, 'svc:warning', 300)).toBe('not_enough_jelly');
    const pending = await listPendingServices(db);
    expect(pending.map((p) => p.item_id)).toEqual(['svc:penalty']);
    expect((await serviceState(db, A)).pending.has('svc:penalty')).toBe(true);
    // 봇이 적용했어요 → 산 횟수 1, 다음 값은 150
    expect(await settleService(db, pending[0]!.id, true, null)).toBe(true);
    expect(await settleService(db, pending[0]!.id, false, 'no_penalty')).toBe(false);
    expect(jellyOf()).toBe(200);
    const state = await serviceState(db, A);
    expect(state.bought.get('svc:penalty')).toBe(1);
    expect(state.pending.size).toBe(0);
  });

  it('지울 게 없으면 젤리를 한 번만 돌려줘요', async () => {
    const { db, jellyOf } = setup(250);
    await requestService(db, A, 'svc:warning', 200);
    expect(jellyOf()).toBe(50);
    const [p] = await listPendingServices(db);
    expect(await settleService(db, p!.id, false, 'no_warning')).toBe(true);
    expect(await settleService(db, p!.id, false, 'no_warning')).toBe(false);
    expect(jellyOf()).toBe(250);
    expect((await serviceState(db, A)).bought.size).toBe(0);
    expect(resultLines({ status: 'failed', reason: 'no_warning', item_id: 'svc:warning' }, '경고 1점 지우기')[0]!.text).toContain('젤리를 돌려드렸습니다');
    expect(resultLines({ status: 'done', reason: null, item_id: 'svc:nickname' }, '닉네임 변경권')[0]!.text).toContain('닉네임 변경권 1장');
  });
});
