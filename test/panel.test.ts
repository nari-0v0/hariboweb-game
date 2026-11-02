// 디스코드 고정 패널: 칭찬하기 한도, 칭찬 젤리, 제일 친한 카드, 카드 색표
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { getBestCard, givePraise, kstDay, praiseToday } from '../src/db';
import { cardPalette } from '../src/palette';

const ids = ['111111111111111111', '222222222222222222', '333333333333333333', '444444444444444444', '555555555555555555'];
const [A, B, C, D, E] = ids;
const DAY = '2026-11-02';

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
  for (const id of ids)
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `m${id[0]}`);
  return { sql, db: db as unknown as D1Database };
}

const jellyOf = (sql: DatabaseSync, id: string) =>
  (sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get(id) as { dogam_jelly: number } | undefined)?.dogam_jelly ?? 0;

describe('칭찬하기', () => {
  it('하루 3번, 같은 사람에게 하루 1번', async () => {
    const { db } = fakeD1();
    expect(await givePraise(db, A, B, DAY)).toEqual({ result: 'done', jelly: true, left: 2 });
    expect(await givePraise(db, A, B, DAY)).toMatchObject({ result: 'already', left: 2 });
    expect((await givePraise(db, A, C, DAY)).result).toBe('done');
    expect((await givePraise(db, A, D, DAY)).result).toBe('done');
    expect(await givePraise(db, A, E, DAY)).toMatchObject({ result: 'limit', left: 0 });
    expect(await praiseToday(db, A, DAY)).toEqual({ given: [B, C, D], left: 0 });
    // 다음 날은 다시 3번
    expect((await givePraise(db, A, B, '2026-11-03')).result).toBe('done');
  });

  it('자기 자신과 떠난 멤버에게는 못 줘요', async () => {
    const { db, sql } = fakeD1();
    expect((await givePraise(db, A, A, DAY)).result).toBe('self');
    sql.prepare('UPDATE members SET active = 0 WHERE user_id = ?').run(B);
    expect((await givePraise(db, A, B, DAY)).result).toBe('not_member');
    expect(await praiseToday(db, A, DAY)).toEqual({ given: [], left: 3 });
  });

  it('받은 사람은 하루 칭찬 젤리 3개까지', async () => {
    const { db, sql } = fakeD1();
    for (const from of [B, C, D, E]) expect((await givePraise(db, from, A, DAY)).result).toBe('done');
    expect(jellyOf(sql, A)).toBe(3);
    expect((await givePraise(db, B, A, '2026-11-03')).jelly).toBe(true);
    expect(jellyOf(sql, A)).toBe(4);
  });

  it('한국 날짜로 세요', () => {
    expect(kstDay(new Date('2026-11-01T15:00:00Z'))).toBe('2026-11-02');
    expect(kstDay(new Date('2026-11-01T14:59:59Z'))).toBe('2026-11-01');
  });
});

describe('패널 내 카드', () => {
  it('제일 친한 카드는 지금 있는 멤버 중 경험치가 가장 높은 카드', async () => {
    const { db, sql } = fakeD1();
    expect(await getBestCard(db, A)).toBeNull();
    const add = sql.prepare("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, ?, 'x', 'x')");
    add.run(A, B, 100);
    add.run(A, C, 500);
    add.run(A, D, 900);
    sql.prepare('UPDATE members SET active = 0 WHERE user_id = ?').run(D);
    expect(await getBestCard(db, A)).toMatchObject({ user_id: C, xp: 500 });
  });

  it('카드 색은 웹과 같은 규칙: 기본 카드는 레벨 따라, 산 테마는 테마 색에 테두리만', () => {
    expect(cardPalette('basic', 1)).toMatchObject({ rim: '#b8486a', ring: null, body: ['#ff8fab'] });
    expect(cardPalette('basic', 90)).toMatchObject({ rim: '#4a0614', ring: ['#ffc8d2', '#d0304a'], sparkle: true });
    expect(cardPalette('space', 25)).toMatchObject({ body: ['#4a3a8a'], ring: ['#ffd35a', '#fff3b0'], sparkle: false });
    expect(cardPalette('없는테마', 5).body).toEqual(['#ff8fab']);
  });
});
