import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
// @ts-expect-error 스크립트는 .mjs라서 타입이 없어요
import { buildRewardSql, tierFor } from '../scripts/maintenance-reward.mjs';

const A = '100000000000000001'; // 원정대 3장까지, 겜블 계정 있음
const B = '100000000000000002'; // 원정대 안 해 봄, 프로필 없음
const LEFT = '100000000000000003';

function freshDb(moved = true) {
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${f}`, 'utf8'));
  sql.exec(`INSERT INTO members (user_id, display_name, updated_at, active) VALUES
    ('${A}', 'a', 'x', 1), ('${B}', 'b', 'x', 1), ('${LEFT}', 'left', 'x', 0);
    INSERT INTO profiles (user_id, dogam_jelly, updated_at) VALUES ('${A}', 10, 'x');
    INSERT INTO journey_bank (user_id, coins, mats, updated_at) VALUES ('${A}', 50, '{"1":2.0,"2":0.0,"3":1.0}', 'x');
    INSERT INTO gamble_accounts (user_id, chips) VALUES ('${A}', 1000);
    INSERT INTO gamble_jelly_moves (user_id, jelly, loaded_at, moved_at) VALUES ('${A}', 5, 'x', ${moved ? "'y'" : 'NULL'});`);
  return sql;
}

const one = (sql: DatabaseSync, q: string) => sql.prepare(q).get() as Record<string, unknown> | undefined;

it('점검 시간에 맞는 칸을 고르고, 경계는 아래 칸이에요', () => {
  expect(tierFor(0.5).jelly).toBe(1);
  expect(tierFor(1).chips).toBe(500);
  expect(tierFor(3).chips).toBe(1000);
  expect(tierFor(3.01).chips).toBe(2000);
  expect(tierFor(12).jelly).toBe(4);
  expect(tierFor(20).mats).toBe(3);
  expect(() => tierFor(0)).toThrow();
  expect(() => tierFor('abc')).toThrow();
});

it('지금 멤버에게 젤리·재료·젤칩·알림을 주고, 두 번 실행해도 한 번만 줘요', () => {
  const sql = freshDb();
  const run = buildRewardSql(4, '2026-11-21T10:00:00.000Z'); // 3~6시간: 젤리 3, 재료 2, 젤칩 2000
  sql.exec(run);
  sql.exec(run);
  expect(one(sql, `SELECT dogam_jelly FROM profiles WHERE user_id = '${A}'`)?.dogam_jelly).toBe(13);
  expect(one(sql, `SELECT dogam_jelly FROM profiles WHERE user_id = '${B}'`)?.dogam_jelly).toBe(3);
  expect(one(sql, `SELECT COUNT(*) n, SUM(amount) s FROM jelly_grants`)).toEqual({ n: 2, s: 6 });
  expect(JSON.parse(String(one(sql, `SELECT mats FROM journey_bank WHERE user_id = '${A}'`)?.mats))).toEqual({ '1': 4, '2': 2, '3': 3 });
  expect(one(sql, `SELECT coins FROM journey_bank WHERE user_id = '${A}'`)?.coins).toBe(50);
  expect(JSON.parse(String(one(sql, `SELECT mats FROM journey_bank WHERE user_id = '${B}'`)?.mats))).toEqual({ '1': 2 });
  expect(one(sql, `SELECT chips FROM gamble_accounts WHERE user_id = '${A}'`)?.chips).toBe(3000);
  expect(one(sql, `SELECT chips, free_day FROM gamble_accounts WHERE user_id = '${B}'`)).toEqual({ chips: 2000, free_day: null });
  expect(one(sql, `SELECT COUNT(*) n FROM alerts WHERE ref = 'maint-2026-11-21'`)?.n).toBe(2);
  // 떠난 멤버는 받지 않아요
  expect(one(sql, `SELECT COUNT(*) n FROM journey_bank WHERE user_id = '${LEFT}'`)?.n).toBe(0);
  expect(one(sql, `SELECT COUNT(*) n FROM gamble_accounts WHERE user_id = '${LEFT}'`)?.n).toBe(0);
  // 알림을 지운 뒤 다시 실행해도 또 받지 않아요(받음 표시는 지급 기록)
  sql.exec(`DELETE FROM alerts`);
  sql.exec(run);
  expect(one(sql, `SELECT dogam_jelly FROM profiles WHERE user_id = '${A}'`)?.dogam_jelly).toBe(13);
  expect(one(sql, `SELECT chips FROM gamble_accounts WHERE user_id = '${A}'`)?.chips).toBe(3000);
  expect(JSON.parse(String(one(sql, `SELECT mats FROM journey_bank WHERE user_id = '${A}'`)?.mats))).toEqual({ '1': 4, '2': 2, '3': 3 });
  expect(one(sql, `SELECT COUNT(*) n FROM alerts`)?.n).toBe(0);
});

it('겜블장 젤리 이전 전에 돌리면 아무것도 주지 않고 멈춰요', () => {
  const sql = freshDb(false);
  expect(() => sql.exec(buildRewardSql(2))).toThrow();
  expect(one(sql, `SELECT dogam_jelly FROM profiles WHERE user_id = '${A}'`)?.dogam_jelly).toBe(10);
  expect(one(sql, `SELECT COUNT(*) n FROM alerts`)?.n).toBe(0);
});
