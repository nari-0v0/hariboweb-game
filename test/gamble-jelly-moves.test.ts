import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
// @ts-expect-error 스크립트는 .mjs라서 타입이 없어요
import { buildMoveSql } from '../scripts/gamble-jelly-moves.mjs';

const A = '100000000000000001';
const B = '100000000000000002';
const LEFT = '100000000000000003';
const NOT_ON_WEB = '100000000000000004';

function freshDb() {
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${f}`, 'utf8'));
  sql.exec(`INSERT INTO members (user_id, display_name, updated_at, active) VALUES
    ('${A}', 'a', 'x', 1), ('${B}', 'b', 'x', 1), ('${LEFT}', 'left', 'x', 0);
    INSERT INTO gamble_accounts (user_id, chips, won) VALUES ('${A}', 1000, 500);`);
  return sql;
}

const chips = (sql: DatabaseSync) => sql.prepare('SELECT user_id, chips, won FROM gamble_accounts ORDER BY user_id').all();

it('지갑 젤리를 젤칩에 1:1로 더하고, 두 번 실행해도 한 번만 넣어요', () => {
  const sql = freshDb();
  const wallets = [
    { user_id: A, jelly: 3000 },
    { user_id: B, jelly: 250 },
    { user_id: LEFT, jelly: 999 },
    { user_id: NOT_ON_WEB, jelly: 50 },
    { user_id: '100000000000000005', jelly: 0 },
  ];
  sql.exec(buildMoveSql(wallets, '2026-11-21T00:00:00.000Z'));
  // 원래 1000 + 3000. 딴 기록(won)은 그대로라 겜블 순위는 안 바뀌어요.
  expect(chips(sql)).toEqual([
    { user_id: A, chips: 4000, won: 500 },
    { user_id: B, chips: 250, won: 0 },
  ]);
  // 다시 실행(같은 파일, 다른 시간에 다시 만든 파일 모두)해도 더 들어가지 않아요.
  sql.exec(buildMoveSql(wallets, '2026-11-21T00:00:00.000Z'));
  sql.exec(buildMoveSql(wallets, '2026-11-21T01:00:00.000Z'));
  expect(chips(sql)).toEqual([
    { user_id: A, chips: 4000, won: 500 },
    { user_id: B, chips: 250, won: 0 },
  ]);
  // 떠난 사람과 웹에 없는 사람 몫은 넣지 않고 표에만 남아요. 0젤리는 아예 적지 않아요.
  expect(sql.prepare('SELECT user_id, jelly, moved_at FROM gamble_jelly_moves ORDER BY user_id').all()).toEqual([
    { user_id: A, jelly: 3000, moved_at: '2026-11-21T00:00:00.000Z' },
    { user_id: B, jelly: 250, moved_at: '2026-11-21T00:00:00.000Z' },
    { user_id: LEFT, jelly: 999, moved_at: null },
    { user_id: NOT_ON_WEB, jelly: 50, moved_at: null },
  ]);
});

it('이상한 값이 있으면 SQL을 만들지 않아요', () => {
  expect(() => buildMoveSql([{ user_id: "1'; DROP TABLE members; --", jelly: 1 }])).toThrow();
  expect(() => buildMoveSql([{ user_id: A, jelly: -5 }])).toThrow();
  expect(() => buildMoveSql([{ user_id: A, jelly: 1.5 }])).toThrow();
  expect(() => buildMoveSql([{ user_id: A, jelly: 1 }, { user_id: A, jelly: 2 }])).toThrow();
});

it('시작 초기화는 겜블 기록만 지우고, 젤리를 옮긴 뒤에는 아무것도 지우지 않아요', () => {
  const sql = freshDb();
  sql.exec(`INSERT INTO owned_items (user_id, item_id, acquired_at) VALUES ('${A}', 'title:gamble-chips-50000', 'x'), ('${A}', 'title:other', 'x');
    UPDATE profiles SET title_id = 'gamble-chips-50000' WHERE user_id = '${A}';`);
  const reset = readFileSync('scripts/gamble-reset.sql', 'utf8');
  sql.exec(reset);
  expect(chips(sql)).toEqual([]);
  expect(sql.prepare('SELECT item_id FROM owned_items ORDER BY item_id').all()).toEqual([{ item_id: 'title:other' }]);
  // 옮긴 사람은 옮긴 젤칩만 갖고, 오늘의 기본 젤칩(free_day)은 아직 안 받은 상태예요.
  sql.exec(buildMoveSql([{ user_id: A, jelly: 3000 }], '2026-11-21T00:00:00.000Z'));
  expect(sql.prepare('SELECT chips, free_day FROM gamble_accounts').all()).toEqual([{ chips: 3000, free_day: null }]);
  // 옮긴 뒤에 실수로 다시 실행해도 그대로예요.
  sql.exec(reset);
  expect(sql.prepare('SELECT chips FROM gamble_accounts').all()).toEqual([{ chips: 3000 }]);
});

it('이전 때 웹에 없던 사람은 들어오면(새로·다시) 받고, 이미 받은 사람은 다시 들어와도 또 받지 않아요', () => {
  const sql = freshDb();
  sql.exec(buildMoveSql([
    { user_id: A, jelly: 3000 },
    { user_id: LEFT, jelly: 999 },
    { user_id: NOT_ON_WEB, jelly: 50 },
  ], '2026-11-21T00:00:00.000Z'));
  const acct = (id: string) => sql.prepare('SELECT chips FROM gamble_accounts WHERE user_id = ?').get(id) as { chips: number } | undefined;
  expect(acct(LEFT)).toBeUndefined();
  expect(acct(NOT_ON_WEB)).toBeUndefined();
  // 처음 들어옴(동기화·로그인과 같은 upsert)
  const upsert = sql.prepare(`INSERT INTO members (user_id, display_name, updated_at, active) VALUES (?, 'n', 'x', 1)
    ON CONFLICT (user_id) DO UPDATE SET active = 1`);
  upsert.run(NOT_ON_WEB);
  expect(acct(NOT_ON_WEB)).toEqual({ chips: 50 });
  // 떠나 있던 사람이 다시 들어옴
  upsert.run(LEFT);
  expect(acct(LEFT)).toEqual({ chips: 999 });
  // 이미 받은 사람이 떠났다가(겜블 계정 지워짐) 다시 들어와도 또 받지 않아요
  sql.exec(`UPDATE members SET active = 0 WHERE user_id = '${A}'`);
  expect(acct(A)).toBeUndefined();
  upsert.run(A);
  expect(acct(A)).toBeUndefined();
  // 이미 들어와 있는 사람의 동기화(active 1 → 1)는 아무 일도 없어요
  upsert.run(NOT_ON_WEB);
  expect(acct(NOT_ON_WEB)).toEqual({ chips: 50 });
});
