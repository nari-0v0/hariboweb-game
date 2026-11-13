import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { loadRankings, plainPodium, toPodium } from '../src/rankings';

const ids = Array.from({ length: 6 }, (_, i) => `${i + 1}`.repeat(18));
const [A, B, C, D] = ids as [string, string, string, string];
const NOW = Date.parse('2026-11-03T03:00:00Z');

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
        const result = list.map((s) => ({ results: sql.prepare(s.query).all(...(s.args as never[])) }));
        sql.exec('COMMIT');
        return result;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  for (const id of ids) {
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `m${id[0]}`);
    sql.prepare('INSERT INTO profiles (user_id, solo_xp, updated_at) VALUES (?, 0, ?)').run(id, '2026-11-01T00:00:00.000Z');
  }
  return { sql, db: db as unknown as D1Database };
}

describe('순위 메뉴', () => {
  it('겜블장에서도 10위 밖의 내 순위를 공동 순위로 표시해요', async () => {
    const { sql, db } = fakeD1();
    const addMember = sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')");
    const addAccount = sql.prepare("INSERT INTO gamble_accounts (user_id, chips, best_win, all_in_wins) VALUES (?, ?, ?, ?)");
    for (let i = 0; i < 12; i++) {
      const id = `other-${i}`;
      addMember.run(id, id);
      addAccount.run(id, 200, 20, 2);
    }
    addAccount.run(A, 100, 10, 1);
    addAccount.run(B, 100, 10, 1);
    const { gamble } = await loadRankings(db, A, NOW);
    expect(gamble.chips.top.map((row) => row.rank)).toEqual([1, 1, 1]);
    expect(gamble.chips.me).toMatchObject({ rank: 13, value: 100 });
    expect(gamble.best.me).toMatchObject({ rank: 13, value: 10 });
    expect(gamble.allIn.me).toMatchObject({ rank: 13, value: 1 });
  });
  it('3위까지, 같은 값은 같은 순위, 내 순위는 따로', () => {
    const rows = [
      { user_id: A, name: '가', value: 9 },
      { user_id: B, name: '나', value: 7 },
      { user_id: C, name: '다', value: 7 },
      { user_id: D, name: '라', value: 2 },
    ];
    const p = toPodium(rows, D);
    expect(p.top.map((r) => [r.rank, r.name])).toEqual([[1, '가'], [2, '나'], [2, '다']]);
    expect(p.me).toMatchObject({ rank: 4, name: '라', value: 2 });
    expect(p.me!.char).toMatch(/^\/char\//);
    expect(toPodium(rows, '0').me).toBeNull();
    expect(plainPodium([{ name: 'x', value: 5 }, { name: 'y', value: 4 }, { name: 'z', value: 3 }, { name: 'w', value: 1 }]).top).toHaveLength(3);
  });

  it('도감·원정대·사건파일은 지금 있는 멤버만 세요', async () => {
    const { sql, db } = fakeD1();
    const card = sql.prepare("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, 1, 'x', 'x')");
    for (const t of [B, C, D]) card.run(A, t);
    card.run(B, A);
    card.run(B, ids[4]!);
    sql.prepare('UPDATE members SET active = 0 WHERE user_id = ?').run(ids[4]!);
    sql.prepare("INSERT INTO escape_rewards (user_id, case_id, run_id, claimed_at) VALUES (?, ?, 'r', 'x')").run(C, 'c1');
    sql.prepare("INSERT INTO journey_runs (id, user_id, state, started_at, updated_at, chapter) VALUES ('just-started', ?, '{}', 'x', 'x', 2)").run(A);
    const r = await loadRankings(db, B, NOW);
    expect(r.dogam.top.map((x) => [x.name, x.value])).toEqual([['m1', 3], ['m2', 1]]);
    expect(r.dogam.me).toMatchObject({ rank: 2, value: 1 });
    expect(r.escape.top.map((x) => x.name)).toEqual(['m3']);
    expect(r.journey.top).toEqual([]);
  });
});
