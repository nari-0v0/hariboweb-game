import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buyGenderChange, chooseFirstGender, planCharacterPool } from '../src/db';
import { poolOf } from '../src/character';

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
  f.sql.prepare("INSERT INTO profiles (user_id, dogam_jelly, character_id, character_sig, updated_at) VALUES (?, ?, 'girl-01-0', 'girl-01-0', 'x')").run(A, jelly);
  const row = () =>
    f.sql.prepare('SELECT p.dogam_jelly, p.character_id, m.gender_chosen_at FROM profiles p JOIN members m USING (user_id) WHERE user_id = ?').get(A) as {
      dogam_jelly: number;
      character_id: string;
      gender_chosen_at: string | null;
    };
  return { ...f, row };
}

describe('처음 성별 고르기와 상점 성별 바꾸기', () => {
  it('처음 한 번만 무료로 고르고, 미리보기와 같은 캐릭터를 받아요', async () => {
    const { db, row } = setup(0);
    const preview = await planCharacterPool(db, A, 'boy');
    expect(poolOf(preview.character)).toBe('boy');
    expect((await planCharacterPool(db, A, 'girl')).character).toBe('girl-01-0'); // 이미 여자면 지금 캐릭터 그대로
    expect(await chooseFirstGender(db, A, 'boy')).toBe(true);
    expect(row().character_id).toBe(preview.character);
    expect(row().gender_chosen_at).not.toBeNull();
    // 두 번째부터는 무료로 못 바꿔요
    expect(await chooseFirstGender(db, A, 'girl')).toBe(false);
    expect(poolOf(row().character_id)).toBe('boy');
  });

  it('성별 바꾸기는 도감 젤리를 빼고 반대 캐릭터로', async () => {
    const { db, row, sql } = setup(40);
    expect(await buyGenderChange(db, A, 'boy', 30)).toBe('not_enough_jelly'); // 아직 처음 고르기 전
    await chooseFirstGender(db, A, 'girl');
    expect(await buyGenderChange(db, A, 'girl', 30)).toBe('same');
    expect(await buyGenderChange(db, A, 'boy', 30)).toBe('done');
    expect(row().dogam_jelly).toBe(10);
    expect(poolOf(row().character_id)).toBe('boy');
    expect(await buyGenderChange(db, A, 'girl', 30)).toBe('not_enough_jelly');
    expect(poolOf(row().character_id)).toBe('boy');
    expect(sql.prepare("SELECT COUNT(*) AS n FROM purchases WHERE item_id = 'change:gender' AND status = 'done'").get()).toEqual({ n: 1 });
  });

  it('동시에 두 번 골라도 먼저 저장된 쪽만 남아요', async () => {
    const { db, row } = setup(0);
    const results = await Promise.all([chooseFirstGender(db, A, 'boy'), chooseFirstGender(db, A, 'girl')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? 'boy' : 'girl';
    expect(poolOf(row().character_id)).toBe(winner);
  });
});
