import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { beginJourney, activeJourney, journeyBank } from '../src/journey-db';
import { MAX_CHAPTER } from '../src/journey-chapters';
import { BAND_MAX, PETS, PET_IDS, petCap, petNeed, petPower } from '../src/pets';
import { BOOST_IDS, TOWER_GAP_MS, boostCost, boostPrice, towerCoins, towerFight, towerFoe, towerMat } from '../src/tower';
import { buyPet, equipPet, levelPet, towerAttempt, towerRanking, parseTowerLast } from '../src/tower-db';
import { NO_GEAR, NO_PERKS } from '../src/journey';

function database() {
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(process.cwd(), 'migrations')).filter((f) => f.endsWith('.sql')).sort()) sql.exec(readFileSync(join(process.cwd(), 'migrations', f), 'utf8'));
  const statement = (query: string, args: unknown[] = []) => ({
    query,
    args,
    bind: (...a: unknown[]) => statement(query, a),
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    first: async () => sql.prepare(query).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
  });
  const db = {
    prepare: (q: string) => statement(q),
    batch: async (list: ReturnType<typeof statement>[]) => {
      sql.exec('BEGIN');
      try {
        const out = list.map((s) => ({ results: [], meta: { changes: Number(sql.prepare(s.query).run(...s.args).changes) } }));
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  for (const u of ['me', 'you', 'gone']) sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, ?, 'x')").run(u, u, u === 'gone' ? 0 : 1);
  return { sql, db };
}
// 장을 깬 기록과 준비소 줄을 만들어요
function setup(sql: DatabaseSync, user: string, top: number, bank: Record<string, unknown> = {}) {
  for (let ch = 1; ch <= top; ch++) {
    sql.prepare("INSERT INTO journey_runs (id, user_id, state, started_at, updated_at, chapter, status, cleared, day) VALUES (?, ?, '{}', 'x', 'x', ?, 'done', 1, 20)").run(`${user}-${ch}`, user, ch);
  }
  const cols = { coins: 0, mats: '{}', ...bank };
  sql.prepare(`INSERT INTO journey_bank (user_id, updated_at, ${Object.keys(cols).join(', ')}) VALUES (?, 'x', ${Object.keys(cols).map(() => '?').join(', ')})`).run(user, ...(Object.values(cols) as never[]));
}
const later = (ms: number) => new Date(Date.UTC(2026, 10, 19) + ms);
const strong = { atk: 40, hp: 40, def: 15, weapon: 9, armor: 9, charm: 9 };

describe('끝없는 탑 규칙', () => {
  it('예전 보상(n개)으로 더 받은 양 ⌊T²/4⌋은 절반 보상과의 차이와 같아요', () => {
    for (let T = 0; T <= 300; T++) {
      let extra = 0;
      for (let f = 1; f <= T; f++) extra += f - Math.ceil(f / 2); // 0054 당시 절반 보상
      expect(Math.floor((T * T) / 4)).toBe(extra);
    }
  });
  it('층 보상은 10층마다 1개부터 다시 세요(1·11·21층 1개, 10·20층 10개)', () => {
    expect([1, 2, 10, 11, 12, 20, 21, 69, 101].map(towerCoins)).toEqual([1, 2, 10, 1, 2, 10, 1, 9, 1]);
    expect(towerCoins(0)).toBe(0);
  });
  it('잠깐 강해지기 값은 어느 층에서나 그 층 보상보다 비싸요', () => {
    for (let f = 1; f <= 500; f++) for (const id of BOOST_IDS) expect(boostPrice(id, f)).toBeGreaterThan(towerCoins(f));
  });
  it('재료는 10층마다 2개, 20층마다 다음 장 재료지만 깬 장까지만 나와요', () => {
    expect(towerMat(9, 9)).toBeNull();
    expect(towerMat(10, 3)).toEqual({ ch: 1, n: 2 });
    expect(towerMat(20, 3)).toEqual({ ch: 1, n: 2 });
    expect(towerMat(30, 3)).toEqual({ ch: 2, n: 2 });
    expect(towerMat(60, 3)).toEqual({ ch: 3, n: 2 });
    expect(towerMat(70, 3)).toEqual({ ch: 3, n: 2 }); // 4장을 못 깼으면 3장 재료
    expect(towerMat(400, MAX_CHAPTER)?.ch).toBe(MAX_CHAPTER); // 15장까지 깼으면 15장 재료까지
    expect(towerMat(400, 9)?.ch).toBe(9);
  });
  it('몬스터는 층이 오를수록 세지고, 같은 층·같은 능력이면 결과가 늘 같아요', () => {
    for (let f = 1; f < 300; f++) {
      const a = towerFoe(f), b = towerFoe(f + 1);
      if (!a.boss && !b.boss) expect(b.hp).toBeGreaterThanOrEqual(a.hp);
    }
    const one = towerFight('me', 37, NO_PERKS, NO_GEAR, null, []);
    const two = towerFight('me', 37, NO_PERKS, NO_GEAR, null, []);
    expect(two.won).toBe(one.won);
    expect(two.fx.hits).toEqual(one.fx.hits);
  });
  it('장마다 그 장을 막 깬 사람(훈련 끝·장비 +장)이 20 × 장 층쯤까지 가요', () => {
    for (const c of [3, 5, 7, 9]) {
      const g = { weapon: c, armor: c, charm: c };
      const p = { atk: 10 + 3 * (c - 1), hp: 10 + 3 * (c - 1), def: 5 + (c - 1) };
      let f = 1;
      while (f < 400 && towerFight('u', f, p, g, null, []).won) f++;
      expect(f - 1).toBeGreaterThanOrEqual(20 * c - 2);
      expect(f - 1).toBeLessThanOrEqual(20 * c + 8);
    }
  });
});

describe('끝없는 탑 도전', () => {
  it('원정대 3장을 깨기 전에는 잠겨 있어요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 2, strong);
    expect(await towerAttempt(db, 'me', 1, [], later(0))).toBe('locked');
  });
  it('이기면 층이 저장되고 젤코인·재료를 받아요. 옛 화면·연타는 막아요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { ...strong, tower: 9, coins: 100 });
    expect(await towerAttempt(db, 'me', 9, [], later(0))).toBe('stale');
    expect(await towerAttempt(db, 'me', 10, [], later(0))).toBe('ok');
    let bank = await journeyBank(db, 'me');
    expect(bank.tower).toBe(10);
    expect(bank.coins).toBe(110);
    expect(bank.mats[1]).toBe(2);
    expect(parseTowerLast(bank.towerLast)?.won).toBe(true);
    expect(await towerAttempt(db, 'me', 11, [], later(100))).toBe('fast');
    expect(await towerAttempt(db, 'me', 11, ['atk', 'hp'], later(TOWER_GAP_MS + 1))).toBe('ok');
    bank = await journeyBank(db, 'me');
    expect(bank.coins).toBe(110 - boostCost(['atk', 'hp'], 11) + 1);
  });
  it('지면 그 층에 머물고 보상은 없어요. 잠깐 강해지기 값은 그래도 나가요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { tower: 150, coins: 1000 });
    expect(await towerAttempt(db, 'me', 151, ['atk'], later(0))).toBe('ok');
    const bank = await journeyBank(db, 'me');
    expect(bank.tower).toBe(150);
    expect(bank.coins).toBe(1000 - boostPrice('atk', 151));
    expect(parseTowerLast(bank.towerLast)?.won).toBe(false);
  });
  it('진 뒤 옛 화면에서 다시 보내도 물약 값이 두 번 나가지 않아요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { tower: 150, coins: 1000 });
    expect(await towerAttempt(db, 'me', 151, ['atk'], later(0), '')).toBe('ok');
    expect(await towerAttempt(db, 'me', 151, ['atk'], later(TOWER_GAP_MS + 1), '')).toBe('stale');
    const bank = await journeyBank(db, 'me');
    expect(bank.coins).toBe(1000 - boostPrice('atk', 151));
    expect(await towerAttempt(db, 'me', 151, ['atk'], later(TOWER_GAP_MS + 1), bank.towerAt ?? '')).toBe('ok');
  });
  it('젤코인이 모자라면 잠깐 강해지기를 못 사요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { coins: 5 });
    expect(await towerAttempt(db, 'me', 1, ['atk'], later(0))).toBe('nocoins');
  });
  it('배포 뒤 조정 SQL은 옛 방식으로 받은 층만 빼고, 다시 돌려도 그대로예요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { ...strong, tower: 20, coins: 100 });
    setup(sql, 'you', 3, { ...strong, tower: 69, coins: 592 });
    expect(await towerAttempt(db, 'me', 21, [], later(0))).toBe('ok'); // 새 방식으로 21층 1개
    const fix = readFileSync(join(__dirname, '../scripts/once/2026-11-19-tower-coins-reset10.sql'), 'utf8');
    sql.exec(fix);
    sql.exec(fix);
    expect((await journeyBank(db, 'me')).coins).toBe(101); // 1~20층은 두 방식 합계가 같아요(110)
    expect((await journeyBank(db, 'you')).coins).toBe(592 - (1225 - 375));
  });
  it('젤코인이 마이너스(조정 뒤 빚)여도 물약 없이는 도전하고, 이기면 빚이 줄어요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { ...strong, coins: -50 });
    expect(await towerAttempt(db, 'me', 1, ['atk'], later(0))).toBe('nocoins');
    expect(await towerAttempt(db, 'me', 1, [], later(0))).toBe('ok');
    expect((await journeyBank(db, 'me')).coins).toBe(-49);
  });
  it('순위는 지금 있는 멤버만, 높은 층부터', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { tower: 5 });
    setup(sql, 'you', 3, { tower: 12 });
    setup(sql, 'gone', 3, { tower: 99 });
    expect((await towerRanking(db)).map((r) => r.user_id)).toEqual(['you', 'me']);
  });
});

describe('탑 순위 같은 층', () => {
  it('같은 층이면 먼저 오른 사람이 위예요. 그 뒤 진 도전으로 밀리지 않아요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { ...strong, tower: 0, coins: 0 });
    setup(sql, 'you', 3, { ...strong, tower: 0, coins: 0 });
    expect(await towerAttempt(db, 'me', 1, [], later(0))).toBe('ok');
    expect(await towerAttempt(db, 'you', 1, [], later(10))).toBe('ok');
    // 내가 더 높은 층에서 지는 걸 흉내 내요(늦은 시각의 진 도전)
    sql.prepare("UPDATE journey_bank SET tower_at = '2099-01-01T00:00:00.000Z' WHERE user_id = 'me'").run();
    expect((await towerRanking(db)).map((r) => r.user_id)).toEqual(['me', 'you']);
  });
  it('진 도전은 오른 때를 바꾸지 않아요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 3, { tower: 150, coins: 1000 });
    sql.prepare("UPDATE journey_bank SET tower_up_at = 'x' WHERE user_id = 'me'").run();
    expect(await towerAttempt(db, 'me', 151, [], later(0))).toBe('ok');
    expect(sql.prepare("SELECT tower_up_at FROM journey_bank WHERE user_id = 'me'").get()).toEqual({ tower_up_at: 'x' });
  });
});

describe('펫', () => {
  it('키우는 젤코인과 재료는 레벨이 오를수록 늘어요', () => {
    let coins = 0, mats = 0;
    for (let L = 1; L <= BAND_MAX + 5; L++) {
      const n = petNeed(L);
      const m = n.cost.reduce((a, c) => a + c.n, 0) + n.any;
      expect(n.coins).toBeGreaterThan(coins);
      expect(m).toBeGreaterThanOrEqual(mats);
      coins = n.coins;
      mats = m;
    }
    expect(petNeed(1).cost).toEqual([{ ch: 1, n: 2 }]);
    expect(petNeed(6).cost).toEqual([{ ch: 2, n: 3 }, { ch: 1, n: 1 }]);
    expect(petNeed(45).cost).toEqual([{ ch: 9, n: 10 }, { ch: 8, n: 8 }]);
  });
  it('최고 레벨은 깬 장 × 5, 마지막 장을 깨면 끝이 없고 그 뒤로는 조금씩만 세져요', () => {
    expect(petCap(3)).toBe(15);
    expect(petCap(MAX_CHAPTER)).toBe(Infinity);
    for (const id of PET_IDS) {
      const step = petPower(id, BAND_MAX) - petPower(id, BAND_MAX - 20);
      const extra = petPower(id, BAND_MAX + 20) - petPower(id, BAND_MAX);
      expect(extra).toBeGreaterThan(0);
      expect(extra).toBeLessThan(step / 2);
    }
  });
  it('장을 깨야 사고, 처음 산 펫은 바로 데려가요. 같은 펫은 두 번 못 사요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 1, { coins: 5000 });
    expect(await buyPet(db, 'me', 'sheep')).toBe(false); // 2장 펫
    expect(await buyPet(db, 'me', 'slime')).toBe(true);
    expect(await buyPet(db, 'me', 'slime')).toBe(false);
    const bank = await journeyBank(db, 'me');
    expect(bank.coins).toBe(5000 - PETS.slime.price);
    expect(bank.pets).toEqual({ slime: 1 });
    expect(bank.pet).toBe('slime');
  });
  it('키우기는 재료·젤코인을 내고, 깬 장 × 5에서 멈춰요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 1, { coins: 10000, mats: JSON.stringify({ 1: 100 }), pets: JSON.stringify({ slime: 4 }), pet: 'slime' });
    expect(await levelPet(db, 'me', 'slime', 3)).toBe(false); // 옛 화면
    expect(await levelPet(db, 'me', 'slime', 4)).toBe(true);
    let bank = await journeyBank(db, 'me');
    expect(bank.pets.slime).toBe(5);
    expect(bank.mats[1]).toBe(100 - petNeed(5).cost[0]!.n);
    expect(bank.coins).toBe(10000 - petNeed(5).coins);
    expect(await levelPet(db, 'me', 'slime', 5)).toBe(false); // 1장만 깨서 Lv5까지
    bank = await journeyBank(db, 'me');
    expect(bank.pets.slime).toBe(5);
  });
  it('마지막 장 뒤로는 가장 많이 가진 재료 20개로 올려요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', MAX_CHAPTER, { coins: 100000, mats: JSON.stringify({ 2: 30, 5: 12 }), pets: JSON.stringify({ dragon: BAND_MAX }) });
    expect(await levelPet(db, 'me', 'dragon', BAND_MAX)).toBe(true);
    const bank = await journeyBank(db, 'me');
    expect(bank.pets.dragon).toBe(BAND_MAX + 1);
    expect(bank.mats[2]).toBe(10);
    expect(bank.mats[5]).toBe(12);
  });
  it('데려간 펫은 원정 판에 들어가고, 두고 가면 빠져요', async () => {
    const { sql, db } = database();
    setup(sql, 'me', 2, { coins: 0, pets: JSON.stringify({ sheep: 10, slime: 2 }) });
    expect(await equipPet(db, 'me', 'golem')).toBe(false); // 없는 펫
    expect(await equipPet(db, 'me', 'sheep')).toBe(true);
    await beginJourney(db, 'me', 1, later(0));
    const run = await activeJourney(db, 'me');
    expect(run?.state.pet).toEqual({ id: 'sheep', lv: 10 });
    expect(run!.state.hp).toBeGreaterThan(100); // 솜사탕 양: 최대 체력이 올라서 가득 채우고 떠나요
    await equipPet(db, 'me', null);
    expect((await journeyBank(db, 'me')).pet).toBeNull();
  });
});

describe('아기 펭귄 회피와 방패', () => {
  it('피한 공격에는 준비물 방패 횟수를 쓰지 않아요', async () => {
    const { startJourney, battle } = await import('../src/journey');
    const { rng } = await import('../src/rng');
    const { CHAPTERS } = await import('../src/journey-chapters');
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      const s = startJourney(`dodge${i}`, { atk: 1, hp: 30, def: 0 } as never, 1, undefined, ['shield'], { id: 'penguin', lv: 3000 });
      battle(s, CHAPTERS[0]!.foes[0]!, 1, rng(`dodge${i}`), [], 0, { hp: 400, atk: 30 });
      const taken = s.fx!.hits.filter((h) => h[0] === 1 && h[1] > 0).length;
      expect(s.kitShield).toBe(Math.max(0, 4 - taken));
      if (s.fx!.hits.some((h) => h[0] === 1 && h[1] === 0)) checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
