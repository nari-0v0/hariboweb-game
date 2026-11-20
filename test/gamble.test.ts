import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buyWithJelly } from '../src/db';
import { activeHand, awardGambleSeason, betChips, betTooSoon, claimDaily, expireAllHands, expireHand, gambleAccount, gambleRanks, moveHand, publicHand, rescueChips } from '../src/gamble-db';
import { cardScore, COIN_PAYOUT, payback, openingPayout, playHand, SLOTS, slotPayout, WHEEL } from '../src/gamble';
import { SHOP_ITEMS } from '../src/shop';
import { loadRankings } from '../src/rankings';

const TODAY = '2026-11-10T14:59:00.000Z';
const TOMORROW = '2026-11-10T15:00:00.000Z';
// 같은 날 TODAY보다 n초 뒤(판 사이 최소 간격을 넘기려고 써요)
const LATER = (n: number) => new Date(Date.parse(TODAY) + n * 1000).toISOString();
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
    // 평균이 100%를 넘지 않아요(계속 돌려도 칩이 불어나지 않게, 2026-11-18)
    expect(weightedPayout / total ** 3).toBeCloseTo(0.99346, 4);
    expect(weightedPayout / total ** 3).toBeLessThan(1);
  });

  it('룰렛 배수별 확률(100번 중)과 기대값', () => {
    expect(WHEEL).toHaveLength(100);
    expect([0, 1, 2, 3, 5, 10].map((n) => WHEEL.filter((v) => v === n).length)).toEqual([49, 25, 15, 8, 2, 1]);
    expect(WHEEL).toHaveLength(100);
    expect(WHEEL.reduce((a, b) => a + b, 0) / 100).toBeCloseTo(0.99);
    expect(WHEEL[WHEEL.length - 1]).toBe(10);
    const mean = WHEEL.reduce((sum, n) => sum + n, 0) / WHEEL.length;
    expect(mean).toBeCloseTo(0.99);
    expect(mean).toBeLessThan(1);
  });

  it('동전 던지기는 맞히면 2배, 틀리면 0배이고 평균 1배(배수는 정수)', async () => {
    expect(COIN_PAYOUT).toBe(2);
    expect(Number.isInteger(COIN_PAYOUT)).toBe(true);
    const { db } = fixture();
    await claimDaily(db, USER, TODAY);
    roll(0); // 0 → 곰(heads)
    const win = await betChips(db, USER, 'coinflip', 10, 'c1', TODAY, 'heads');
    expect(win).toMatchObject({ multiplier: 2 });
    expect(JSON.parse(win!.state)).toEqual({ pick: 'heads', side: 'heads' });
    expect(await gambleAccount(db, USER)).toMatchObject({ chips: 1010, won: 10 });
    roll(1); // 1 → 발바닥(tails)
    const lose = await betChips(db, USER, 'coinflip', 10, 'c2', LATER(2), 'heads');
    expect(lose).toMatchObject({ multiplier: 0 });
    expect((await gambleAccount(db, USER))?.chips).toBe(1000);
    expect(await betChips(db, USER, 'coinflip', 10, 'c3', LATER(4))).toBeNull();
    roll(0);
    await betChips(db, USER, 'coinflip', 100, 'c4', LATER(6), 'heads');
    expect(await gambleAccount(db, USER)).toMatchObject({ chips: 1100, won: 110, best_win: 100 });
    // 예전 2.05배 기록: 100 × 2.05는 부동소수점으로 204.999…라 그냥 내림하면 204가 돼요. 정확히 205로 계산해요.
    expect(payback(100, 2.05)).toBe(205);
  });

  it('룰렛 1배는 본전, 2배는 건 만큼 더 받아요', async () => {
    const { db } = fixture();
    await claimDaily(db, USER, TODAY);
    roll(49);
    const even = await betChips(db, USER, 'roulette', 3, 'even', TODAY);
    expect(even?.multiplier).toBe(1);
    expect((await gambleAccount(db, USER))?.chips).toBe(1000);
    roll(74);
    const more = await betChips(db, USER, 'roulette', 3, 'more', LATER(2));
    expect(more?.multiplier).toBe(2);
    expect(await gambleAccount(db, USER)).toMatchObject({ chips: 1003, won: 3, best_win: 3 });
  });

  it('A를 1이나 11로 계산하고 딜러는 소프트 17에서도 멈춘다', () => {
    expect(cardScore([0, 5])).toBe(17);
    expect(cardScore([0, 13, 9, 8])).toBe(21);
    expect(cardScore([0, 9, 8])).toBe(20);
    const hand = { player: [8, 7], dealer: [13, 4], deck: [11, 26] };
    // 무승부는 언제나 1배(17점끼리도)
    expect(playHand(hand, 'stand')).toBe(1);
    expect(hand.dealer).toEqual([13, 4, 26]);
    expect(playHand({ player: [8, 8], dealer: [9, 7], deck: [] }, 'stand')).toBe(1);
    expect(hand.deck).toEqual([11]);
    expect(playHand({ player: [11, 12], dealer: [4, 5], deck: [8] }, 'hit')).toBe(0);
    expect(playHand({ player: [11, 12], dealer: [9, 5], deck: [8] }, 'stand')).toBe(2);
    // 첫 두 장 21: A와 그림 카드(J·Q·K)면 3배, A와 10이면 2배(2026-11-19 나리 "좀 낮춰")
    expect(openingPayout({ player: [0, 12], dealer: [4, 5], deck: [] })).toBe(3);
    expect(openingPayout({ player: [23, 13], dealer: [4, 5], deck: [] })).toBe(3);
    expect(openingPayout({ player: [9, 0], dealer: [4, 5], deck: [] })).toBe(2);
    expect(openingPayout({ player: [9, 13], dealer: [13, 25], deck: [] })).toBe(1);
    expect(openingPayout({ player: [0, 12], dealer: [13, 25], deck: [] })).toBe(1);
    expect(openingPayout({ player: [4, 5], dealer: [13, 25], deck: [] })).toBe(0);
  });
});

describe('칩과 판 기록', () => {
  it('젤칩 이전·점검 보상으로 계정이 먼저 생긴 사람도 첫 방문에 시작 칩 1000을 더 받아요', async () => {
    const { db, sql } = fixture();
    sql.prepare('INSERT INTO gamble_accounts (user_id, chips) VALUES (?, 0)').run(USER);
    sql.prepare('UPDATE gamble_accounts SET chips = chips + 2500 WHERE user_id = ?').run(USER);
    expect(await claimDaily(db, USER, TODAY)).toBe(1000);
    expect((await gambleAccount(db, USER))?.chips).toBe(3500);
    expect(await claimDaily(db, USER, TODAY)).toBe(0);
    expect(await claimDaily(db, USER, TOMORROW)).toBe(0);
  });

  it('처음 오면 시작 칩 1000, 그 뒤로는 0개일 때만 한국 날짜마다 한 번 300개로 채워요', async () => {
    const { db, sql } = fixture();
    expect(await Promise.all([claimDaily(db, USER, TODAY), claimDaily(db, USER, TODAY)])).toEqual([1000, 0]);
    // 칩이 남아 있으면 다음 날에도 더 주지 않아요
    expect(await claimDaily(db, USER, TOMORROW)).toBe(0);
    roll(0);
    await betChips(db, USER, 'roulette', 1000, 'lose', TODAY);
    expect((await gambleAccount(db, USER))?.chips).toBe(0);
    // 시작 칩을 받은 날(free_day)과 같은 날이면 그날은 못 받아요
    expect(await rescueChips(db, USER, TODAY)).toBe(false);
    expect(await Promise.all([claimDaily(db, USER, TOMORROW), claimDaily(db, USER, TOMORROW)])).toEqual([300, 0]);
    expect((await gambleAccount(db, USER))?.chips).toBe(300);
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
    const win = await betChips(db, USER, 'slot', 400, 'win', LATER(2));
    expect(win?.multiplier).toBe(10);
    roll(0);
    await betChips(db, USER, 'roulette', 1, 'win', LATER(4));
    expect(await gambleAccount(db, USER)).toMatchObject({ chips: 4000, all_in_wins: 1, plays: 2, won: 3600, best_win: 3600, jackpots: 1 });
    expect(sql.prepare("SELECT item_id FROM owned_items WHERE item_id = 'title:gamble-jackpot'").get()).toBeDefined();
    expect(() => sql.exec('UPDATE gamble_accounts SET chips = -1')).toThrow();
  });

  it('판이 끝나고 1초 안에는 다음 판을 받지 않는다(콘솔 자동 반복 막기)', async () => {
    const { db } = fixture();
    await claimDaily(db, USER, TODAY);
    roll(0);
    expect(await betChips(db, USER, 'roulette', 1, 'one', TODAY)).not.toBeNull();
    expect(await betTooSoon(db, USER, LATER(0.5))).toBe(true);
    expect(await betChips(db, USER, 'slot', 1, 'two', LATER(0.5))).toBeNull();
    // 같은 판을 다시 보내면(두 번 누르기) 그 판 결과를 그대로 돌려줘요
    expect((await betChips(db, USER, 'roulette', 1, 'one', LATER(0.5)))?.token).toBe('one');
    expect((await gambleAccount(db, USER))?.chips).toBe(999);
    expect(await betTooSoon(db, USER, LATER(1.5))).toBe(false);
    expect(await betChips(db, USER, 'slot', 1, 'two', LATER(1.5))).not.toBeNull();
  });

  it('칩을 다 건 카드 21이 진행 중이면 구제하지 않는다', async () => {
    const { db } = fixture();
    await claimDaily(db, USER, TODAY);
    roll(1);
    const hand = await betChips(db, USER, 'cards', 1000, 'all-in', TODAY);
    expect(hand?.multiplier).toBeNull();
    expect((await gambleAccount(db, USER))?.chips).toBe(0);
    expect(await rescueChips(db, USER, TODAY)).toBe(false);
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

  it('1젤칩 올인이 1배(본전)면 올인 승리도 시즌 우승 후보도 아니다', async () => {
    const { db, sql } = fixture();
    sql.prepare("INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES ('season', ?, ?, ?)").run('2026-11-01T00:00:00.000Z', TOMORROW, TODAY);
    await claimDaily(db, USER, TODAY);
    sql.prepare('UPDATE gamble_accounts SET chips = 1 WHERE user_id = ?').run(USER);
    roll(49);
    const r = await betChips(db, USER, 'roulette', 1, 'even', TODAY);
    expect(r?.multiplier).toBe(1);
    expect(await gambleAccount(db, USER)).toMatchObject({ chips: 1, won: 0, all_in_wins: 0 });
    expect((await gambleRanks(db, TODAY))[3]).toEqual([]);
    await awardGambleSeason(db, 'season', TOMORROW, TOMORROW);
    expect(sql.prepare('SELECT * FROM gamble_season_winners').get()).toBeUndefined();
  });

  it('시즌 우승을 한 번 기록하고 떠난 멤버는 순위에서 제외한다', async () => {
    const { db, sql } = fixture();
    sql.prepare("INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES ('season', ?, ?, ?)").run('2026-11-01T00:00:00.000Z', TOMORROW, TODAY);
    await claimDaily(db, USER, TODAY);
    roll(99);
    await betChips(db, USER, 'roulette', 100, 'win', TODAY);
    expect((await gambleRanks(db, TODAY))[3]).toMatchObject([{ name: '테스트', value: 900 }]);
    await awardGambleSeason(db, 'season', TOMORROW, TOMORROW);
    await awardGambleSeason(db, 'season', TOMORROW, TOMORROW);
    expect(sql.prepare('SELECT won FROM gamble_season_winners').get()).toMatchObject({ won: 900 });
    expect(sql.prepare("SELECT item_id FROM owned_items WHERE item_id = 'title:gamble-season-winner'").get()).toBeDefined();
    sql.prepare("UPDATE profiles SET title_id = 'gamble-season-winner' WHERE user_id = ?").run(USER);
    expect((await gambleRanks(db, TODAY))[0]).toMatchObject([{ name: '「도박신」 테스트', value: 1900 }]);
    sql.exec('UPDATE members SET active = 0');
    expect((await gambleRanks(db, TODAY)).every((rank) => rank.length === 0)).toBe(true);
  });
});

it('지난 카드 21이 51명분 쌓여도 모두 정산한 잔액과 칭호로 순위를 보여 줘요', async () => {
  const { sql, db } = fixture();
  const addMember = sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, ?)");
  const addAccount = sql.prepare('INSERT INTO gamble_accounts (user_id, chips) VALUES (?, 10000)');
  const addRound = sql.prepare("INSERT INTO gamble_rounds (user_id, token, game, bet, all_in, state, expires_at) VALUES (?, 'pending', 'cards', 10000, 1, ?, ?)");
  // 둘 다 자연 21은 아님. 플레이어 20, 딜러 17 → 2배 승리.
  const state = JSON.stringify({ player: [9, 10], dealer: [8, 7], deck: [] });
  for (let i = 0; i < 51; i++) {
    const id = `expired-${String(i).padStart(2, '0')}`;
    addMember.run(id, id, TODAY);
    addAccount.run(id);
    addRound.run(id, state, TOMORROW);
  }
  const ranks = await loadRankings(db, 'expired-50', Date.parse(LATER(61)), 'gamble');
  expect(ranks.gamble.chips.me).toMatchObject({ rank: 1, value: 20000 });
  expect(sql.prepare('SELECT COUNT(*) AS n FROM gamble_rounds WHERE settled_at IS NULL').get()).toEqual({ n: 0 });
  expect(sql.prepare('SELECT COUNT(*) AS n FROM gamble_accounts WHERE chips = 20000 AND plays = 1 AND all_in_wins = 1').get()).toEqual({ n: 51 });
  expect(sql.prepare("SELECT COUNT(*) AS n FROM owned_items WHERE item_id = 'title:gamble-all-in-1'").get()).toEqual({ n: 51 });
  await expireAllHands(db, LATER(62));
  expect(sql.prepare('SELECT SUM(chips) AS n FROM gamble_accounts').get()).toEqual({ n: 51 * 20000 });
});
