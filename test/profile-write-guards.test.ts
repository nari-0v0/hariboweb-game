import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { saveProfile, setTheme, setDeco } from '../src/db';
import { equipTitle } from '../src/title-db';
import { markPraiseSeen } from '../src/praise-note';
import { SHOP_ITEMS, rewardNeed, shopItem } from '../src/shop';

const USER = '111111111111111111';
function setup() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${file}`, 'utf8'));
  const statement = (query: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => statement(query, values),
    run: async () => ({ success: true, results: [], meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
  }) as unknown as D1PreparedStatement;
  const db = { prepare: statement } as D1Database;
  sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'a', 1, 'x')").run(USER);
  for (const item of ['theme:rose', 'deco:maid', 'title:shop-1']) sql.prepare("INSERT OR IGNORE INTO owned_items VALUES (?, ?, 'x')").run(USER, item);
  return { sql, db };
}
const saves: [string, (db: D1Database) => Promise<unknown>][] = [
  ['소개', (db) => saveProfile(db, USER, '옛 소개', 'basic')],
  ['테마', (db) => setTheme(db, USER, 'rose')],
  ['꾸밈 캐릭터', (db) => setDeco(db, USER, 'maid')],
  ['칭호', (db) => equipTitle(db, USER, 'shop-1')],
  ['칭찬함 읽음', (db) => markPraiseSeen(db, USER, Date.now(), [])],
];
describe('탈퇴 후 늦게 끝난 화면 저장', () => {
  it.each(saves)('%s 저장이 지워진 프로필을 되살리지 않아요', async (_name, save) => {
    const { sql, db } = setup();
    // 화면의 회원 확인 뒤, 봇이 탈퇴와 개인 기록 삭제를 먼저 반영한 상태.
    sql.prepare('UPDATE members SET active = 0 WHERE user_id = ?').run(USER);
    await save(db);
    expect(sql.prepare('SELECT * FROM profiles WHERE user_id = ?').get(USER)).toBeUndefined();
  });
  it.each(saves)('지금 있는 멤버의 %s 저장은 유지해요', async (_name, save) => {
    const { sql, db } = setup();
    await save(db);
    expect(sql.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(USER)).toEqual({ user_id: USER });
  });
});

describe('초기화 뒤 늦게 끝난 꾸미기 저장', () => {
  it.each([
    ['소개와 테마', (db: D1Database) => saveProfile(db, USER, '소개', 'rose')],
    ['테마', (db: D1Database) => setTheme(db, USER, 'rose')],
    ['꾸밈 캐릭터', (db: D1Database) => setDeco(db, USER, 'maid')],
  ] as const)('%s 저장 때 지워진 구매 소유권을 다시 확인해요', async (_name, save) => {
    const { sql, db } = setup();
    sql.prepare("INSERT INTO profiles (user_id, updated_at) VALUES (?, 'x')").run(USER);
    for (const item of ['theme:rose', 'deco:maid']) sql.prepare("INSERT OR IGNORE INTO owned_items VALUES (?, ?, 'x')").run(USER, item);
    // 요청의 소유권 확인 이후 초기화가 끝나고 나서 저장이 실행돼요.
    sql.exec(readFileSync('scripts/launch-reset.sql', 'utf8'));
    await save(db);
    expect(sql.prepare('SELECT theme_id, deco_id FROM profiles WHERE user_id = ?').get(USER)).toEqual({ theme_id: 'basic', deco_id: null });
  });
});

// 소규모 서버에서 전부 모으기, 큰 서버에서 비율·최소 장수 규칙의 경계를 함께 확인해요.
// 키는 보상 캐릭터: 1번째(마법사), 기존 13번째(드래곤 조련사), 마지막(로봇 기사), 그리고 사이에 넣은 메카(2026-11-21).
it.each([
  [2, 'wizard', 1], [2, 'dragon-tamer', 1], [2, 'robot', 1],
  [4, 'wizard', 3], [4, 'dragon-tamer', 3], [4, 'robot', 3], [4, 'mech-cannon', 3],
  [26, 'wizard', 3], [26, 'dragon-tamer', 25], [26, 'robot', 25], [26, 'mech-cannon', 8], [26, 'mech-blue-twin', 25],
  [60, 'wizard', 3], [60, 'dragon-tamer', 39], [60, 'robot', 59], [60, 'mech-cannon', 8], [60, 'mech-blue-twin', 59],
  [101, 'wizard', 4], [101, 'dragon-tamer', 50], [101, 'robot', 100], [101, 'mech-cannon', 10], [101, 'mech-blue-twin', 95],
])('서버 %i명, 보상 %s는 카드 %i장부터 실제로 장착할 수 있어요', async (members, key, need) => {
  expect(rewardNeed(shopItem(`deco:${key}`)!.rewardRank!, members)).toBe(need); // 화면 계산과 저장 문장이 같아요
  const { db, sql } = setup();
  const item = shopItem(`deco:${key}`)!;
  for (let i = 1; i < members; i++) {
    const other = `member-${i}`;
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(other, other);
    if (i < need) sql.prepare("INSERT INTO cards (owner_id, target_id, first_met, updated_at) VALUES (?, ?, 'x', 'x')").run(USER, other);
  }
  expect(await setDeco(db, USER, item.key)).toBe(false);
  sql.prepare("INSERT INTO cards (owner_id, target_id, first_met, updated_at) VALUES (?, ?, 'x', 'x')").run(USER, `member-${need}`);
  expect(await setDeco(db, USER, item.key)).toBe(true);
  // 카드가 줄어 새로 잠긴 보상을 옛 화면에서 다시 선택할 수 없어요.
  sql.prepare('DELETE FROM cards WHERE owner_id = ? AND target_id = ?').run(USER, `member-${need}`);
  expect(await setDeco(db, USER, item.key)).toBe(false);
  expect(await setDeco(db, USER, null)).toBe(true);
});
