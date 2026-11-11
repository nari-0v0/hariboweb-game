import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buyWithJelly } from '../src/db';
import { activeHand, awardGambleSeason, betChips, claimDaily, expireHand, gambleAccount, gambleRanks, moveHand, publicHand, rescueChips } from '../src/gamble-db';
import { cardScore, openingPayout, playHand, SLOTS, slotPayout, WHEEL } from '../src/gamble';
import { SHOP_ITEMS } from '../src/shop';

const TODAY = '2026-11-10T14:59:00.000Z';
const TOMORROW = '2026-11-10T15:00:00.000Z';
const USER = '100000000000000001';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  const stmt = (query: string, args: unknown[] = []) => {
    // node:sqlite expects numbered SQLite placeholders to be supplied as named values.
    const numbered = [...new Set(query.match(/\?\d+/g) ?? [])];
    const params = numbered.length ? [Object.fromEntries(numbered.map((key) => [key, args[Number(key.slice(1)) - 1]]))] : args;
    const run = () => ({ meta: { changes: Number(sql.prepare(query).run(...(params as never[])).changes) } });
    const all = () => ({ results: sql.prepare(query).all(...(params as never[])) });
    return {
      query, run, all, bind: (...values: unknown[]) => stmt(query, values),
      first: async () => sql.prepare(query).get(...(params as never[])) ?? null,
    };
  };
  const db = {
    prepare: stmt,
    batch: async (statements: ReturnType<typeof stmt>[]) => {
      sql.exec('BEGIN');
      try {
        const results = statements.map((s) => /^SELECT/i.test(s.query) ? s.all() : s.run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, '테스트', 1, ?)").run(USER, TODAY);
  sql.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)').run(USER, TODAY);
  return { db, sql };
}

function roll(value: number) {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((buffer) => {
    (buffer as Uint32Array)[0] = value;
    return buffer;
  });
}

afterEach(() => vi.restoreAllMocks());

describe('겜블장 배당', () => {
  it('슬롯의 배당과 정확한 기대값', () => {
    expect(SLOTS.map((_, i) => slotPayout([i, i, i]))).toEqual([3, 5, 7, 10]);
    expect(slotPayout([0, 1, 0])).toBe(2);
    expect(slotPayout([1, 0, 2])).toBe(0);
    let weightedPayout = 0;
    const total = SLOTS.reduce((n, s) => n + s.weight, 0);
    SLOTS.forEach((a, i) => SLOTS.forEach((b, j) => SLOTS.forEach((c, k) => {
      weightedPayout += slotPayout([i, j, k]) * a.weight * b.weight * c.weight;
    })));
    expect(weightedPayout / total ** 3).toBeGreaterThanOrEqual(1.02);
    expect(weightedPayout / total ** 3).toBeLessThanOrEqual(1.05);
  });

  it('룰렛의 40칸 구성과 기대값', () => {
    expect(WHEEL).toHaveLength(40);
    expect([0, 1, 2, 3, 5, 10].map((n) => WHEEL.filter((v) => v === n).length)).toEqual([22, 8, 6, 2, 1, 1]);
    const mean = WHEEL.reduce((sum, n) => sum + n, 0) / WHEEL.length;
    expect(mean).toBeCloseTo(1.025);
    expect(mean).toBeGreaterThanOrEqual(1.02);
    expect(mean).toBeLessThanOrEqual(1.05);
  });

  it('A를 1이나 11로 계산하고 딜러는 소프트 17에서도 멈춘다', () => {
    expect(cardScore([0, 5])).toBe(17);
    expect(cardScore([0, 13, 9, 8])).toBe(21);
    expect(cardScore([0, 9, 8])).toBe(20);
    const hand = { player: [8, 7], dealer: [13, 4], deck: [11, 26] };
    expect(playHand(hand, 'stand')).toBe(1);
    expect(hand.dealer).toEqual([13, 4, 26]);
    expect(hand.deck).toEqual([11]);
    expect(playHand({ player: [11, 12], dealer: [4, 5], deck: [8] }, 'hit')).toBe(0);
    expect(playHand({ player: [11, 12], dealer: [9, 5], deck: [8] }, 'stand')).toBe(2);
    expect(openingPayout({ player: [0, 12], dealer: [4, 5], deck: [] })).toBe(3);
    expect(openingPayout({ player: [0, 12], dealer: [13, 25], deck: [] })).toBe(1);
    expect(openingPayout({ player: [4, 5], dealer: [13, 25], deck: [] })).toBe(0);
  });
});

describe('칩과 판 기록', () => {
  it('한국 날짜마다 무료 칩은 한 번, 구제는 잔액이 0일 때 별도로 한 번', async () => {
    const { db, sql } = fixture();
    expect(await Promise.all([claimDaily(db, USER, TODAY), claimDaily(db, USER, TODAY)])).toEqual([true, false]);
    expect(await rescueChips(db, USER, TODAY)).toBe(false);
    roll(0);
    await betChips(db, USER, 'roulette', 1000, 'lose', TODAY);
    expect((await gambleAccount(db, USER))?.chips).toBe(0);
    expect(await Promise.all([rescueChips(db, USER, TODAY), rescueChips(db, USER, TODAY)])).toEqual([true, false]);
    await betChips(db, USER, 'roulette', 1000, 'lose2', TODAY);
    expect(await rescueChips(db, USER, TODAY)).toBe(false);
    expect(await claimDaily(db, USER, TOMORROW)).toBe(true);
    expect((await gambleAccount(db, USER))?.chips).toBe(1000);
    expect(sql.prepare('SELECT dogam_jelly FROM profiles').get()).toMatchObject({ dogam_jelly: 0 });
  });

  it('보유 칩을 넘는 베팅과 중복 요청을 막고 올인 승리를 한 번만 기록한다', async () => {
    const { db, sql } = fixture();
    await claimDaily(db, USER, TODAY);
    roll(0);
    expect(await betChips(db, USER, 'roulette', 1001, 'too-big', TODAY)).toBeNull();
    const race = await Promise.all([
      betChips(db, USER, 'roulette', 600, 'a', TODAY),
      betChips(db, USER, 'roulette', 600, 'b', TODAY),
    ]);
    expect(race.filter(Boolean)).toHaveLength(1);
    expect((await gambleAccount(db, USER))?.chips).toBe(400);
    roll(99);
    const win = await betChips(db, USER, 'slot', 400, 'win', TODAY);
    expect(win?.multiplier).toBe(10);
    roll(0);
    await betChips(db, USER, 'roulette', 1, 'win', TODAY);
    expect(await gambleAccount(db, USER)).toMatchObject({ chips: 4000, all_in_wins: 1, plays: 2, won: 3600, best_win: 3600, jackpots: 1 });
    expect(sql.prepare("SELECT item_id FROM owned_items WHERE item_id = 'title:gamble-jackpot'").get()).toBeDefined();
    expect(() => sql.exec('UPDATE gamble_accounts SET chips = -1')).toThrow();
  });

  it('진행 중인 카드 판 하나만 허용하고 같은 조작을 두 번 적용하지 않는다', async () => {
    const { db, sql } = fixture();
    await claimDaily(db, USER, TODAY);
    roll(1);
    const first = await betChips(db, USER, 'cards', 100, 'cards', TODAY);
    expect(first?.multiplier).toBeNull();
    expect(publicHand(first!).dealer).toHaveLength(1);
    expect(await betChips(db, USER, 'cards', 100, 'second', TODAY)).toBeNull();
    expect((await gambleAccount(db, USER))?.chips).toBe(900);
    sql.prepare('UPDATE gamble_rounds SET state = ? WHERE token = ?')
      .run(JSON.stringify({ player: [1, 2], dealer: [4, 5], deck: [9, 0] }), 'cards');
    const moves = await Promise.all([
      moveHand(db, USER, 'cards', 0, 'hit', TODAY),
      moveHand(db, USER, 'cards', 0, 'hit', TODAY),
    ]);
    expect(moves.filter(Boolean)).toHaveLength(1);
    expect(await expireHand(db, USER, TOMORROW)).toBe('cards');
    expect(await activeHand(db, USER)).toBeNull();
    expect((await gambleAccount(db, USER))?.plays).toBe(1);
  });

  it('상점은 칩 잔액이 있어도 젤리 없이 물건을 살 수 없다', async () => {
    const { db } = fixture();
    await claimDaily(db, USER, TODAY);
    const item = SHOP_ITEMS.find((i) => i.price !== null)!;
    expect(await buyWithJelly(db, USER, item.id, item.price!)).toBe('not_enough_jelly');
    expect((await gambleAccount(db, USER))?.chips).toBe(1000);
  });

  it('시즌 우승을 한 번 기록하고 떠난 멤버는 순위에서 제외한다', async () => {
    const { db, sql } = fixture();
    sql.prepare("INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES ('season', ?, ?, ?)").run('2026-11-01T00:00:00.000Z', TOMORROW, TODAY);
    await claimDaily(db, USER, TODAY);
    roll(39);
    await betChips(db, USER, 'roulette', 100, 'win', TODAY);
    expect((await gambleRanks(db, TODAY))[3]).toEqual([{ name: '테스트', value: 900 }]);
    await awardGambleSeason(db, 'season', TOMORROW, TOMORROW);
    await awardGambleSeason(db, 'season', TOMORROW, TOMORROW);
    expect(sql.prepare('SELECT won FROM gamble_season_winners').get()).toMatchObject({ won: 900 });
    expect(sql.prepare("SELECT item_id FROM owned_items WHERE item_id = 'title:gamble-season-winner'").get()).toBeDefined();
    sql.prepare("UPDATE profiles SET title_id = 'gamble-season-winner' WHERE user_id = ?").run(USER);
    expect((await gambleRanks(db, TODAY))[0]).toEqual([{ name: '「도박신」 테스트', value: 1900 }]);
    sql.exec('UPDATE members SET active = 0');
    expect((await gambleRanks(db, TODAY)).every((rank) => rank.length === 0)).toBe(true);
  });
});
