import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

it('입력에 없는 미지급 행은 빈 파일이나 다른 파일을 실행해도 지급하지 않아요', () => {
  const sql = freshDb();
  sql.exec(`INSERT INTO gamble_jelly_moves (user_id, jelly, loaded_at) VALUES ('${A}', 999, 'x');`);
  sql.exec(buildMoveSql([]));
  sql.exec(buildMoveSql([{ user_id: B, jelly: 250 }]));
  expect(chips(sql)).toEqual([
    { user_id: A, chips: 1000, won: 500 },
    { user_id: B, chips: 250, won: 0 },
  ]);
});

it('이미 적재한 금액과 다르면 새 행과 지급을 모두 중단해요', () => {
  const sql = freshDb();
  sql.exec(`INSERT INTO gamble_jelly_moves (user_id, jelly, loaded_at) VALUES ('${A}', 999, 'x');`);
  expect(() => sql.exec(buildMoveSql([{ user_id: B, jelly: 250 }, { user_id: A, jelly: 1000 }]))).toThrow();
  expect(sql.prepare('SELECT user_id, jelly, moved_at FROM gamble_jelly_moves').all()).toEqual([
    { user_id: A, jelly: 999, moved_at: null },
  ]);
  expect(chips(sql)).toEqual([{ user_id: A, chips: 1000, won: 500 }]);
});

it('ID는 문자열, 잔액은 정수 숫자로 내보낸 경우만 받아요', () => {
  expect(() => buildMoveSql([{ user_id: Number(A), jelly: 5 }])).toThrow();
  for (const jelly of [null, false, '', '250']) {
    expect(() => buildMoveSql([{ user_id: A, jelly }])).toThrow();
  }
});

it('지급이 0건이어도 출시 초기화는 한 번만 실행해요', () => {
  const sql = freshDb();
  const reset = readFileSync('scripts/gamble-reset.sql', 'utf8');
  sql.exec(reset);
  expect(chips(sql)).toEqual([]);
  sql.exec(`INSERT INTO gamble_accounts (user_id, chips) VALUES ('${A}', 1000);`);
  sql.exec(reset);
  expect(chips(sql)).toEqual([{ user_id: A, chips: 1000, won: 0 }]);
});

it('초기화가 중단되면 삭제와 완료 기록을 함께 되돌려요', () => {
  const sql = freshDb();
  const reset = readFileSync('scripts/gamble-reset.sql', 'utf8');
  sql.exec(`CREATE TRIGGER fail_reset BEFORE DELETE ON gamble_accounts
    BEGIN SELECT RAISE(ABORT, 'failed reset'); END;`);
  expect(() => sql.exec(reset)).toThrow();
  expect(sql.prepare('SELECT COUNT(*) AS n FROM gamble_launch_reset').get()).toEqual({ n: 0 });
  expect(chips(sql)).toEqual([{ user_id: A, chips: 1000, won: 500 }]);
  sql.exec('DROP TRIGGER fail_reset;');
  sql.exec(reset);
  expect(chips(sql)).toEqual([]);
});

it('승인 명단 밖의 계정은 활성 상태라도 지급하지 않아요', () => {
  const sql = freshDb();
  const wallets = [{ user_id: A, jelly: 100 }, { user_id: B, jelly: 200 }];
  const stamp = '2026-11-21T00:00:00.000Z';
  sql.exec(buildMoveSql(wallets, stamp, [wallets[0]]));
  expect(chips(sql)).toEqual([{ user_id: A, chips: 1100, won: 500 }]);
  expect(sql.prepare('SELECT moved_at FROM gamble_jelly_moves WHERE user_id = ?').get(B)).toEqual({ moved_at: null });
  expect(() => buildMoveSql(wallets, stamp, [{ user_id: A, jelly: 99 }])).toThrow();
  expect(() => buildMoveSql(wallets, stamp, [wallets[0], wallets[0]])).toThrow();
});

it('승인 대상이 비활성화되면 아직 지급하지 않은 건 전체를 롤백해요', () => {
  const sql = freshDb();
  const wallets = [{ user_id: A, jelly: 100 }, { user_id: B, jelly: 200 }];
  const move = buildMoveSql(wallets, '2026-11-21T00:00:00.000Z', wallets);
  sql.exec(`UPDATE members SET active = 0 WHERE user_id = '${B}'`);
  expect(() => sql.exec(move)).toThrow();
  expect(chips(sql)).toEqual([{ user_id: A, chips: 1000, won: 500 }]);
  expect(sql.prepare('SELECT COUNT(*) AS n FROM gamble_jelly_moves WHERE moved_at IS NOT NULL').get()).toEqual({ n: 0 });
  sql.exec(`UPDATE members SET active = 1 WHERE user_id = '${B}'`);
  sql.exec(move);
  sql.exec(move);
  expect(chips(sql)).toEqual([
    { user_id: A, chips: 1100, won: 500 },
    { user_id: B, chips: 200, won: 0 },
  ]);
});

it('이관 후 잔액이 안전한 정수 범위를 넘으면 다른 계정도 지급하지 않아요', () => {
  const sql = freshDb();
  const stamp = '2026-11-21T00:00:00.000Z';
  const wallets = [{ user_id: B, jelly: 200 }, { user_id: A, jelly: 100 }];
  const move = buildMoveSql(wallets, stamp, wallets);
  const maximum = Number.MAX_SAFE_INTEGER;
  sql.exec(`UPDATE gamble_accounts SET chips = ${maximum - 99} WHERE user_id = '${A}'`);
  expect(() => sql.exec(move)).toThrow();
  expect(chips(sql)).toEqual([{ user_id: A, chips: maximum - 99, won: 500 }]);
  expect(sql.prepare('SELECT COUNT(*) AS n FROM gamble_jelly_moves WHERE moved_at IS NOT NULL').get()).toEqual({ n: 0 });
  sql.exec(`UPDATE gamble_accounts SET chips = ${maximum - 100} WHERE user_id = '${A}'`);
  sql.exec(move);
  expect(chips(sql)).toEqual([
    { user_id: A, chips: maximum, won: 500 },
    { user_id: B, chips: 200, won: 0 },
  ]);
});

it('운영 CLI는 완성된 SQL만 새 파일로 게시하고 기존 파일을 보존해요', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gamble-moves-'));
  try {
    const wallets = join(directory, 'wallets.json');
    const approved = join(directory, 'approved.json');
    const output = join(directory, 'move.sql');
    const run = () => spawnSync(process.execPath, ['scripts/gamble-jelly-moves.mjs', wallets, approved, output]);
    writeFileSync(wallets, JSON.stringify([{ user_id: A, jelly: 100 }]));
    writeFileSync(approved, '{');
    expect(run().status).toEqual(1);
    expect(readdirSync(directory).sort()).toEqual(['approved.json', 'wallets.json']);
    writeFileSync(approved, readFileSync(wallets));
    expect(run().status).toEqual(0);
    const generated = readFileSync(output, 'utf8');
    const sql = freshDb();
    sql.exec(generated);
    expect(chips(sql)).toEqual([{ user_id: A, chips: 1100, won: 500 }]);
    expect(run().status).toEqual(1);
    expect(readFileSync(output, 'utf8')).toEqual(generated);
    expect(readdirSync(directory).sort()).toEqual(['approved.json', 'move.sql', 'wallets.json']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
