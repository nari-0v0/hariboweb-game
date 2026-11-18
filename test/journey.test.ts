import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAYS, journeyJelly, KIT_SHIELD_HITS, kitCost, actJourney, autoChoice, decodeJourney, journeyXp, perkMax, gearBonus, gearNeed, hasMats, GEAR_MAX, LOWER_MATS, FIRST_CLEAR_BONUS, FARM_DROP, FX_HITS, startJourney, stat, type JourneyState } from '../src/journey';
import { NO_COINS, STALE_PICK, actJourneyRun, activeJourney, beginJourney, buyPerk, getJourney, journeyBank, journeyRecord, quitJourney, upgradeGear } from '../src/journey-db';

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
  for (const u of ['me', 'gone']) sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, ?, 'x')").run(u, u, u === 'gone' ? 0 : 1);
  return { sql, db };
}

function idleToEnd(seed: string) {
  let s = startJourney(seed);
  let steps = 0;
  while (!s.done) {
    const next = actJourney(s, { a: 'idle' });
    expect(next, `${seed} day ${s.day}`).not.toBeNull();
    s = next!;
    expect(s.hp).toBeGreaterThanOrEqual(0);
    expect(s.hp).toBeLessThanOrEqual(stat(s).maxHp);
    expect(s.coins).toBeGreaterThanOrEqual(0);
    if (++steps > 200) throw new Error('끝나지 않아요');
  }
  return s;
}

describe('원정대 하루 모험 규칙', () => {
  it('자동 선택만으로도 늘 끝까지 가고, 일부는 드래곤을 이겨요', () => {
    let cleared = 0;
    for (let i = 0; i < 200; i++) {
      const s = idleToEnd(`seed-${i}`);
      expect(s.day).toBeLessThanOrEqual(DAYS);
      if (s.cleared) {
        cleared++;
        expect(s.day).toBe(DAYS);
      }
    }
    // 자동은 무난하게: 너무 쉽지도, 불가능하지도 않게
    expect(cleared).toBeGreaterThan(20);
    expect(cleared).toBeLessThan(150);
  });
  it('같은 판은 같은 결과(서버가 정해요)', () => {
    expect(idleToEnd('same')).toEqual(idleToEnd('same'));
  });
  it('고를 일이 있으면 다음 날로 못 가고, 이상한 고르기는 거절해요', () => {
    let s: JourneyState = startJourney('pick');
    while (!s.pending) s = actJourney(s, { a: 'next' })!;
    expect(actJourney(s, { a: 'next' })).toBeNull();
    expect(actJourney(s, { a: 'auto' })).toBeNull();
    expect(actJourney(s, { a: 'pick', n: 7 })).toBeNull();
    const c = autoChoice(s)!;
    expect(actJourney(s, c)).not.toBeNull();
  });
  it('"고를 때까지"는 여러 날을 한 번에 가요', () => {
    const s = actJourney(startJourney('far'), { a: 'auto' })!;
    expect(s.pending || s.done || s.day > 1).toBeTruthy();
  });
  it('상점에선 동전이 모자라면 못 사고, 여러 개 살 수 있어요', () => {
    let s: JourneyState = startJourney('x');
    for (let i = 0; !(s.pending?.kind === 'shop'); i++) {
      s = actJourney(s, s.pending ? autoChoice(s)! : { a: 'next' })!;
      if (s.done) s = startJourney(`x${i}`);
    }
    const p = s.pending as Extract<JourneyState['pending'], { kind: 'shop' }>;
    const poor = { ...s, coins: 0 };
    expect(actJourney(poor, { a: 'buy', n: 0 })).toBeNull();
    const rich = { ...s, coins: 999 };
    const n = p.offers.findIndex((o) => o.id !== 'scroll');
    const after = actJourney(rich, { a: 'buy', n })!;
    expect(after.pending?.kind).toBe('shop');
    expect(after.coins).toBe(999 - p.offers[n]!.price);
    expect(actJourney(after, { a: 'leave' })!.pending?.kind ?? null).not.toBe('shop');
  });
  it('저장된 상태가 깨졌으면 읽지 않아요', () => {
    expect(decodeJourney('{')).toBeNull();
    expect(decodeJourney(JSON.stringify({ ...startJourney('a'), hp: -1 }))).toBeNull();
    expect(decodeJourney(JSON.stringify(startJourney('a')))).toEqual(startJourney('a'));
  });
});

describe('원정대 저장과 보상', () => {
  async function playToEnd(db: D1Database, user = 'me') {
    const id = (await beginJourney(db, user))!;
    for (let i = 0; i < 300; i++) {
      const run = (await getJourney(db, user, id))!;
      if (run.row.status !== 'going') break;
      expect(await actJourneyRun(db, user, id, run.row.rev, { a: 'idle' })).toBe('ok');
    }
    return (await getJourney(db, user, id))!;
  }
  it('하루 첫 2판만 경험치를 받고, 끝까지 깨기 전엔 젤리가 없어요', async () => {
    const { db, sql } = database();
    let xp = 0;
    let jelly = 0;
    for (let i = 0; i < 3; i++) {
      const r = await playToEnd(db);
      expect(r.row.status).toBe('done');
      if (i < 2) {
        expect(r.row.xp).toBe(journeyXp(r.state.day, r.state.cleared));
        expect(r.row.jelly).toBe(0);
        xp += r.row.xp;
        jelly += r.row.jelly;
      } else expect([r.row.xp, r.row.jelly]).toEqual([0, 0]);
    }
    expect(sql.prepare("SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = 'me'").get()).toEqual({ solo_xp: xp, dogam_jelly: jelly });
    const rec = await journeyRecord(db, 'me');
    expect(rec.rewardedToday).toBe(2);
    expect(rec.best).toBeGreaterThan(0);
  });
  it('옛 화면(순번이 다른 요청)은 반영하지 않아요', async () => {
    const { db } = database();
    const id = (await beginJourney(db, 'me'))!;
    expect(await actJourneyRun(db, 'me', id, 0, { a: 'next' })).toBe('ok');
    expect(await actJourneyRun(db, 'me', id, 0, { a: 'next' })).toBe('stale');
    expect((await activeJourney(db, 'me'))!.state.day).toBe(1);
  });
  it('하던 원정이 있으면 이어가고, 그만두면 새로 떠나요', async () => {
    const { db } = database();
    const a = await beginJourney(db, 'me');
    expect(await beginJourney(db, 'me')).toBe(a);
    expect(await quitJourney(db, 'me', a!)).toBe(true);
    const b = await beginJourney(db, 'me');
    expect(b).not.toBe(a);
  });
  it('떠난 멤버는 떠날 수 없어요', async () => {
    const { db } = database();
    expect(await beginJourney(db, 'gone')).toBeNull();
  });
  it('아직 못 깬 장은 죽어도 젤코인이 다 모이고, 이미 깬 장을 다시 돌면 그 장을 돈 횟수만큼 100% → 75% → 50% → 25% → 10% (날이 바뀌어도 그대로)', async () => {
    const { db, sql } = database();
    // 대장을 깬 적 없는 1장: 몇 판을 돌아도 100%
    for (let i = 0; i < 3; i++) {
      const r = await playToEnd(db);
      if (r.state.cleared) break;
      expect([r.state.farm, r.state.bankPct]).toEqual([false, 100]);
    }
    // 1장 대장을 깼다고 치면, 그 뒤 1장은 파밍
    sql.prepare("INSERT INTO journey_runs (id, user_id, state, started_at, updated_at, chapter, status, cleared) VALUES ('c1', 'me', '{}', 'x', 'x', 1, 'done', 1)").run();
    const before = (await journeyBank(db, 'me')).coins;
    let total = 0;
    for (const pct of [100, 75, 50, 25, 10, 10]) {
      const r = await playToEnd(db);
      expect([r.state.farm, r.state.bankPct]).toEqual([true, pct]);
      expect(r.state.banked).toBe(Math.floor((r.state.coins * pct) / 100));
      total += r.state.banked!;
    }
    expect((await journeyBank(db, 'me')).coins).toBe(before + total);
    expect((await journeyRecord(db, 'me')).farmed[1]).toBe(6);
    expect((await journeyRecord(db, 'me', '2099-01-01')).farmed[1]).toBe(6); // 다른 날에도 그대로
  });
  it('장비는 그 단계 장의 재료와 젤코인으로 올리고, 다음 원정부터 세져요', async () => {
    const { db, sql } = database();
    sql.prepare(`INSERT INTO journey_bank (user_id, coins, mats, updated_at) VALUES ('me', 100, '{"1":3}', 'x')`).run();
    expect(await upgradeGear(db, 'me', 'weapon')).toBe(true); // +1: 1장 재료 2개, 젤코인 30
    let bank = await journeyBank(db, 'me');
    expect([bank.weapon, bank.coins, bank.mats[1]]).toEqual([1, 70, 1]);
    expect(await upgradeGear(db, 'me', 'armor')).toBe(false); // 1장 재료 1개뿐
    expect(await upgradeGear(db, 'me', 'weapon')).toBe(false); // +2는 2장 재료(+ 1장 재료 2개)
    const id = (await beginJourney(db, 'me'))!;
    const run = (await getJourney(db, 'me', id))!;
    expect(run.state.atk).toBe(12 + gearBonus('weapon', 1));
    bank = await journeyBank(db, 'me');
    expect(bank.armor).toBe(0);
  });
  it('+2부터는 앞 장 재료도 장마다 2개씩 같이 써요(하나라도 모자라면 아무것도 빼지 않아요)', async () => {
    const { db, sql } = database();
    sql.prepare(`INSERT INTO journey_bank (user_id, coins, weapon, mats, updated_at) VALUES ('me', 1000, 1, '{"1":1,"2":5}', 'x')`).run();
    expect(await upgradeGear(db, 'me', 'weapon')).toBe(false); // 1장 재료가 1개뿐
    let bank = await journeyBank(db, 'me');
    expect([bank.weapon, bank.coins, bank.mats[1], bank.mats[2]]).toEqual([1, 1000, 1, 5]);
    sql.prepare(`UPDATE journey_bank SET mats = '{"1":4,"2":5,"3":7}'`).run();
    expect(await upgradeGear(db, 'me', 'weapon')).toBe(true); // +2: 2장 2개 + 1장 2개
    bank = await journeyBank(db, 'me');
    expect([bank.weapon, bank.mats[1], bank.mats[2]]).toEqual([2, 2, 3]);
    expect(await upgradeGear(db, 'me', 'weapon')).toBe(true); // +3: 3장 2개 + 2장 2개 + 1장 2개
    bank = await journeyBank(db, 'me');
    expect([bank.weapon, bank.mats[1] ?? 0, bank.mats[2], bank.mats[3]]).toEqual([3, 0, 1, 5]);
    expect(await upgradeGear(db, 'me', 'armor')).toBe(false); // 갑옷 +1에 쓸 1장 재료가 이제 없어요
  });
  it('강화 값: 그 장 재료는 2~4개, 앞 장 재료는 장마다 2개, 1장 재료도 +9까지 계속 쓰여요', () => {
    expect(gearNeed(1).cost).toEqual([{ ch: 1, n: 2 }]);
    expect(gearNeed(3).cost).toEqual([{ ch: 3, n: 2 }, { ch: 2, n: LOWER_MATS }, { ch: 1, n: LOWER_MATS }]);
    const top = gearNeed(GEAR_MAX);
    expect(top.cost[0]).toEqual({ ch: GEAR_MAX, n: 4 });
    expect(top.cost.map((c) => c.ch)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(hasMats({ 1: 2, 2: 2 }, gearNeed(2).cost)).toBe(true);
    expect(hasMats({ 1: 1, 2: 9 }, gearNeed(2).cost)).toBe(false);
  });
  it('오래된 화면(다른 단계)에서 누르면 다음 단계 값을 내지 않아요', async () => {
    const { db, sql } = database();
    sql.prepare(`INSERT INTO journey_bank (user_id, coins, mats, updated_at) VALUES ('me', 1000, '{"1":9}', 'x')`).run();
    expect(await buyPerk(db, 'me', 'atk', new Date(), 0)).toBe(true);
    expect(await buyPerk(db, 'me', 'atk', new Date(), 0)).toBe(false); // 두 번째 탭의 Lv.0 화면
    expect(await upgradeGear(db, 'me', 'armor', new Date(), 1)).toBe(false);
    expect(await upgradeGear(db, 'me', 'armor', new Date(), 0)).toBe(true);
    const bank = await journeyBank(db, 'me');
    expect([bank.atk, bank.armor]).toEqual([1, 1]);
  });
  it('주운 재료는 끝날 때 그 장 칸에 모이고(젤코인이 0%여도), 처음 대장을 깨면 2개 더 받아요', async () => {
    const { db } = database();
    for (let i = 0; i < 6; i++) {
      const r = await playToEnd(db);
      const expected = (r.state.mats ?? 0) + (r.state.cleared && !r.state.farm ? FIRST_CLEAR_BONUS : 0);
      expect(r.state.matsBanked).toBe(expected);
    }
    const bank = await journeyBank(db, 'me');
    const runs = await db.prepare("SELECT state FROM journey_runs WHERE user_id = 'me' AND status = 'done'").all<{ state: string }>();
    const sum = runs.results.reduce((n, x) => n + (JSON.parse(x.state).matsBanked ?? 0), 0);
    expect(bank.mats[1] ?? 0).toBe(sum);
  });
  it('훈련 한도는 도감으로 열린 장까지만 늘어요', async () => {
    const { db, sql } = database();
    // 1~4장 대장을 깼다고 치고(도감 카드 0장이라 열린 장은 3장까지), 젤코인을 넉넉히
    for (let ch = 1; ch <= 4; ch++)
      sql.prepare("INSERT INTO journey_runs (id, user_id, state, started_at, updated_at, chapter, status, cleared) VALUES (?, 'me', '{}', 'x', 'x', ?, 'done', 1)").run(`c${ch}`, ch);
    sql.prepare("INSERT INTO journey_bank (user_id, coins, updated_at) VALUES ('me', 999999, 'x')").run();
    let n = 0;
    while (await buyPerk(db, 'me', 'def')) n++;
    expect(n).toBe(perkMax('def', 3));
    expect(perkMax('def', 3)).toBeLessThan(perkMax('def', 5));
  });
});

describe('journey battle motion', () => {
  it('keeps every hit of a long boss fight and fits the motion in time', async () => {
    const { fightPlan } = await import('../src/views/journey');
    // 체력이 많고 몬스터도 단단한 긴 싸움(예전엔 6칸으로 잘렸어요)
    const tough = { ...startJourney('long-fight'), day: 19, ch: 4, hp: 400, maxHp: 400, def: 0 } as JourneyState;
    const fx = actJourney(tough, { a: 'next' })!.fx!;
    expect(fx.hits.length).toBeGreaterThan(6);
    let hp = fx.hp0!;
    for (const [i, [who, dmg]] of fx.hits.entries()) {
      if (who === 1 && fx.php![i]! < hp) expect(fx.php![i]).toBe(Math.max(0, hp - dmg));
      hp = fx.php![i]!;
    }
    const plan = fightPlan(fx);
    expect(plan.pops.length).toBe(fx.hits.length + (fx.spark ? 1 : 0));
    expect(plan.ms).toBeLessThanOrEqual(8000);
    // 아주 긴 싸움(80칸)도 모션은 몇 초 안에 끝나요
    const long = { foe: fx.foe, won: false, hits: Array.from({ length: 80 }, (_, i) => [(i % 2) as 0 | 1, 1] as [0 | 1, number]), hp0: 40, mhp: 999 };
    const lp = fightPlan(long);
    expect(lp.ms).toBeLessThanOrEqual(8000);
    // 같은 쪽 숫자는 다음 숫자가 뜨기 전에 사라져요(겹치지 않게)
    for (const side of [0, 1] as const) {
      const on = lp.pops.filter((p) => p.on === side);
      for (let i = 1; i < on.length; i++) expect(on[i - 1]!.at + (on[i - 1]!.len ?? 0.75)).toBeLessThanOrEqual(on[i]!.at + 1e-9);
    }
  });

  it('records the fight for the stage and forgets it on the next action', async () => {
    const { fightPlan } = await import('../src/views/journey');
    const { FOES } = await import('../src/journey-art');
    let s = startJourney('fx-seed');
    let seen = 0;
    for (let i = 0; i < 200 && !s.done; i++) {
      const next = actJourney(s, { a: 'idle' })!;
      if (next.fx) {
        seen++;
        expect(FOES[next.fx.foe]).toBeTruthy();
        expect(next.fx.hits.length).toBeGreaterThan(0);
        expect(next.fx.hits.length).toBeLessThanOrEqual(FX_HITS);
        // 모든 공격이 빠짐없이 남아요: 적이 때린 칸은 바로 앞 칸 체력에서 그 피해만큼만 줄어요(물약은 늘 수 있음).
        // 예전엔 긴 싸움 중간이 빠져서 '두 대 버틸 체력'에서 한 대에 죽는 것처럼 보였어요(슬금님 제보 2026-11-18)
        let hpNow = next.fx.hp0!;
        let foeNow = next.fx.mhp! - (next.fx.spark ?? 0);
        for (const [i, [who, dmg]] of next.fx.hits.entries()) {
          if (who === 1) {
            // 물약을 마신 칸만 더 높을 수 있어요
            if (next.fx.php![i]! <= Math.max(0, hpNow - dmg)) expect(next.fx.php![i]).toBe(Math.max(0, hpNow - dmg));
          } else expect(next.fx.left![i]).toBe(Math.max(0, foeNow - dmg));
          hpNow = next.fx.php![i]!;
          foeNow = next.fx.left![i]!;
        }
        const last = next.fx.hits[next.fx.hits.length - 1]!;
        expect(last[0]).toBe(next.fx.won ? 0 : 1);
        const plan = fightPlan(next.fx);
        expect(plan.pops.length).toBe(next.fx.hits.length + (next.fx.spark ? 1 : 0));
        expect(plan.ms).toBeGreaterThan(1000);
        // 몬스터 체력 막대: 처음 체력이 있고, 이기면 0, 줄어드는 칸은 점점 짧아져요
        expect(next.fx.mhp).toBeGreaterThan(0);
        expect(next.fx.left).toHaveLength(next.fx.hits.length);
        expect(plan.foeHp!.max).toBe(next.fx.mhp);
        if (next.fx.won) expect(plan.foeHp!.now).toBe(0);
        else expect(plan.foeHp!.now).toBeGreaterThan(0);
        const pcts = plan.foeHp!.drops.map((d) => d.pct);
        expect(pcts).toEqual([...pcts].sort((x, y) => y - x));
        if (next.fx.won) expect(pcts.at(-1)).toBe(0);
        // 내 체력 막대: 칸마다 남은 체력이 있고, 진 싸움은 모션 안에서 0까지 줄어요
        expect(next.fx.php).toHaveLength(next.fx.hits.length);
        if (!next.fx.won && next.fx.hits.length) expect(plan.heroHp.at(-1)?.now ?? next.fx.hp0).toBe(0);
        expect(plan.heroHp.every((x, i, a) => i === 0 || x.at > a[i - 1]!.at)).toBe(true);
      }
      s = next;
    }
    expect(seen).toBeGreaterThan(0);
    // 싸움 뒤 스킬을 고르면 지난 싸움은 다시 보여 주지 않아요
    const fought = { ...startJourney('x'), fx: { foe: 'slime', won: true, hits: [[0, 5]] as [0, number][] }, pending: { kind: 'skill' as const, options: ['power' as const] } };
    expect(actJourney(fought, { a: 'pick', n: 0 })!.fx).toBeUndefined();
    // 가시 반격 피해는 그 반격 칸의 남은 체력에 바로 들어가요
    const thorny = { ...startJourney('thorn'), day: 9, skills: { thorn: 3 } } as JourneyState;
    const tf = actJourney(thorny, { a: 'next' })!.fx!;
    const ti = tf.hits.findIndex((h, i) => h[0] === 1 && i < tf.hits.length - 1);
    expect(ti).toBeGreaterThan(0);
    expect(tf.left![ti]).toBe(Math.max(0, tf.left![ti - 1]! - 9));
    // 흡혈 회복은 그 공격 칸의 내 체력에 바로 들어가요(맞는 칸에서 체력이 오르지 않게)
    const leechy = { ...startJourney('leech'), day: 9, hp: 60, skills: { leech: 3 } } as JourneyState;
    const lf = actJourney(leechy, { a: 'next' })!.fx!;
    for (const [i, h] of lf.hits.entries()) if (h[0] === 1 && i > 0) expect(lf.php![i]!).toBeLessThanOrEqual(lf.php![i - 1]!);
    // 예전에 저장된 싸움(몬스터 체력 기록 없음)은 막대 없이 그대로 보여요
    expect(fightPlan(fought.fx).foeHp).toBeNull();
    expect(fightPlan(fought.fx).heroHp).toEqual([]);
  });
});

describe('journey training (permanent perks)', () => {
  it('starts stronger with perks and costs grow each level', async () => {
    const { PERKS, perkCost } = await import('../src/journey');
    const s = startJourney('p', { atk: 3, hp: 2, def: 1 });
    expect([s.atk, s.maxHp, s.hp, s.def]).toEqual([12 + 3 * PERKS.atk.per, 120, 120, 3]);
    expect(perkCost(1)).toBeGreaterThan(perkCost(0));
  });
});

describe('journey training bank', () => {
  it('banks leftover coins of finished runs only, buys training, and the next run starts stronger', async () => {
    const { buyPerk, journeyBank } = await import('../src/journey-db');
    const { db } = database();
    // 그만두면 동전이 모이지 않아요
    const q = (await beginJourney(db, 'me'))!;
    await quitJourney(db, 'me', q);
    expect((await journeyBank(db, 'me')).coins).toBe(0);
    // 끝까지 가면 남은 동전이 모여요
    // 판마다 씨앗이 무작위라 남는 동전이 다르니, 훈련 값(20)이 모일 때까지 몇 판 돌려요
    let banked = 0;
    for (let k = 0; k < 10 && banked < 20; k++) {
      const id = (await beginJourney(db, 'me'))!;
      for (let i = 0; i < 300; i++) {
        const run = await getJourney(db, 'me', id);
        if (run!.row.status !== 'going') break;
        expect(await actJourneyRun(db, 'me', id, run!.row.rev, { a: 'idle' })).toBe('ok');
      }
      const end = (await getJourney(db, 'me', id))!;
      expect(end.row.status).toBe('done');
      banked += end.state.coins;
      expect((await journeyBank(db, 'me')).coins).toBe(banked);
    }
    const bank = await journeyBank(db, 'me');
    expect(bank.coins).toBeGreaterThanOrEqual(20);
    expect(await buyPerk(db, 'me', 'atk')).toBe(true);
    const after = await journeyBank(db, 'me');
    expect(after).toMatchObject({ atk: 1, coins: bank.coins - 20 });
    const next = (await getJourney(db, 'me', (await beginJourney(db, 'me'))!))!;
    expect(next.state.atk).toBe(13);
    // 동전이 모자라면 못 사요
    await db.prepare('UPDATE journey_bank SET coins = 0 WHERE user_id = ?').bind('me').run();
    expect(await buyPerk(db, 'me', 'hp')).toBe(false);
  });
});

describe('journey pictures', () => {
  it('has a drawn picture for every foe and road stop', async () => {
    const { SPRITES } = await import('../src/sprites.gen');
    for (const k of ['mushroom', 'slime', 'bat', 'hedgehog', 'wolf', 'crab', 'bees', 'ghost', 'bear', 'dragon']) expect(SPRITES[`/journey/foe/${k}.webp`], k).toBeTruthy();
    for (const k of ['camp', 'merchant', 'chest', 'spring', 'fairy', 'gummy', 'sign', 'trophy']) expect(SPRITES[`/journey/prop/${k}.webp`], k).toBeTruthy();
  });
});

describe('원정대 장(챕터)', () => {
  it('마지막 장도 대장을 깨고 다시 떠나면 재도전으로 시작해요', async () => {
    const { db, sql } = database();
    const { MAX_CHAPTER } = await import('../src/journey-chapters');
    const previous = (await beginJourney(db, 'me'))!;
    sql.prepare("UPDATE journey_runs SET status = 'done', cleared = 1, chapter = ? WHERE id = ?").run(MAX_CHAPTER, previous);
    const card = sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, '친구', 1, 'x')");
    const pair = sql.prepare("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES ('me', ?, 2000, 'x', 'x')");
    for (let i = 0; i < 55; i++) {
      card.run(`friend-${i}`);
      pair.run(`friend-${i}`);
    }
    const id = (await beginJourney(db, 'me', MAX_CHAPTER))!;
    expect((await getJourney(db, 'me', id))?.state).toMatchObject({ ch: MAX_CHAPTER, farm: true });
  });
  it('장마다 몬스터 10마리 그림이 있고 이름이 겹치지 않아요', async () => {
    const { CHAPTERS } = await import('../src/journey-chapters');
    const { SPRITES } = await import('../src/sprites.gen');
    const keys = CHAPTERS.flatMap((c) => [...c.foes, c.elite, c.boss].map((m) => m.key));
    expect(CHAPTERS).toHaveLength(9);
    expect(new Set(keys).size).toBe(90);
    for (const k of keys) expect(SPRITES[`/journey/foe/${k}.webp`], k).toBeTruthy();
  });
  it('2장은 2장 몬스터가 나오고 더 세요', async () => {
    const { CHAPTERS } = await import('../src/journey-chapters');
    const two = new Set([...CHAPTERS[1]!.foes, CHAPTERS[1]!.elite, CHAPTERS[1]!.boss].map((m) => m.key));
    let s: JourneyState = startJourney('ch2-seed', undefined, 2);
    const seen: string[] = [];
    for (let i = 0; i < 400 && !s.done; i++) {
      s = actJourney(s, { a: 'idle' })!;
      if (s.fx) seen.push(s.fx.foe);
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const k of seen) expect(two.has(k), k).toBe(true);
    expect(decodeJourney(JSON.stringify({ ...startJourney('a'), ch: 12 }))).toBeNull();
  });
  it('열린 장까지만 떠날 수 있고, 장을 깨면 다음 장이 열려요', async () => {
    const { db, sql } = database();
    // 잠긴 장을 고르면 다른 장으로 몰래 바꾸지 않고 새 화면을 보여 줘요.
    expect(await beginJourney(db, 'me', 5)).toBe(STALE_PICK);
    expect(await journeyBank(db, 'me')).toMatchObject({ coins: 0 });
    const id = (await beginJourney(db, 'me', 1))!;
    expect((await getJourney(db, 'me', id))!.state.ch).toBe(1);
    expect((await journeyRecord(db, 'me')).unlocked).toBe(1);
    sql.prepare("UPDATE journey_runs SET status = 'done', cleared = 1 WHERE id = ?").run(id);
    expect((await journeyRecord(db, 'me')).unlocked).toBe(2);
    const id2 = (await beginJourney(db, 'me', 2))!;
    expect((await getJourney(db, 'me', id2))!.state.ch).toBe(2);
  });
});

describe('원정대 무대 그림', () => {
  it('2장 이후 몬스터도 무대에 그림이 나와요', async () => {
    const { Stage } = await import('../src/views/journey');
    const s = startJourney('1', undefined, 2);
    s.fx = { foe: 'c2-dew-slime', won: false, hits: [], skills: [] } as unknown as JourneyState['fx'];
    const html = String(await Stage({ s, art: '/a.png', name: 'n', lost: false }).toString());
    expect(html).toContain('/journey/foe/c2-dew-slime.webp');
  });
});

describe('닉네임 변경권 옮기기', () => {
  it('기다리던 예전 구매는 변경권 1장이 돼요', () => {
    const sql = new DatabaseSync(':memory:');
    const files = readdirSync(join(process.cwd(), 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files.filter((f) => f < '0024')) sql.exec(readFileSync(join(process.cwd(), 'migrations', f), 'utf8'));
    sql.exec("INSERT INTO purchases (id, user_id, item_id, price, status, created_at) VALUES ('p1', 'u1', 'svc:nickname', 5, 'pending', 'x')");
    for (const f of files.filter((f) => f >= '0024')) sql.exec(readFileSync(join(process.cwd(), 'migrations', f), 'utf8'));
    expect(sql.prepare("SELECT status FROM purchases WHERE id = 'p1'").get()).toEqual({ status: 'done' });
  });
});

describe('원정대 스킬 고르는 날', () => {
  it('레벨업한 날은 싸움만, 스킬은 다음 날 싸우지 않고 골라요', () => {
    let s: JourneyState = startJourney('skill-day');
    let seen = 0;
    for (let i = 0; i < 400 && !s.done && seen < 3; i++) {
      if (s.pending?.kind === 'skill') {
        seen++;
        expect(s.fx).toBeUndefined();
        expect(s.today.some((l) => l.text.includes('물리쳤') || l.text.includes('지고'))).toBe(false);
      } else if (s.fx) expect(s.pending?.kind).not.toBe('skill');
      s = actJourney(s, s.pending ? autoChoice(s)! : { a: 'next' })!;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('깬 장 다시 돌기 재료', () => {
  it('이미 깬 장은 재료가 덜 나와요(대장도 가끔만)', () => {
    const strong = { atk: 20, hp: 20, def: 10 };
    const play = (farm: boolean) => {
      let mats = 0;
      for (let i = 0; i < 200; i++) {
        let s = startJourney(`farm-${i}`, strong, 1, { weapon: 3, armor: 3, charm: 3 });
        s.farm = farm;
        for (let k = 0; k < 500 && !s.done; k++) s = actJourney(s, { a: 'idle' })!;
        mats += s.mats ?? 0;
      }
      return mats;
    };
    const fresh = play(false);
    const farm = play(true);
    expect(fresh).toBeGreaterThan(200); // 대장은 꼭 1개
    expect(farm).toBeGreaterThan(0);
    expect(farm).toBeLessThan(fresh * (FARM_DROP + 0.15));
  });
});

describe('원정대 도감 젤리', () => {
  it('9장 대장을 처음 이기면 하루 보상 판수와 상관없이 젤리 10개가 들어와요', async () => {
    const { db, sql } = database();
    const ins = sql.prepare("INSERT INTO journey_runs (id, user_id, state, started_at, updated_at, chapter, status, cleared, reward_day, xp) VALUES (?, 'me', '{}', 'x', 'x', ?, 'done', 1, ?, ?)");
    for (let ch = 1; ch <= 8; ch++) ins.run(`c${ch}`, ch, '2000-01-01', 0);
    // 오늘 보상 2판은 이미 받았어요
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    ins.run('t1', 1, today, 5);
    ins.run('t2', 1, today, 5);
    const s = startJourney('final', { atk: 200, hp: 200, def: 100 }, 9, {});
    s.day = DAYS - 1;
    sql.prepare("INSERT INTO journey_runs (id, user_id, state, started_at, updated_at, chapter) VALUES ('fin', 'me', ?, 'x', 'x', 9)").run(JSON.stringify(s));
    for (let k = 0; k < 20; k++) {
      const run = (await getJourney(db, 'me', 'fin'))!;
      if (run.row.status === 'done') break;
      await actJourneyRun(db, 'me', 'fin', run.row.rev, { a: 'idle' });
    }
    const done = (await getJourney(db, 'me', 'fin'))!;
    expect([done.state.cleared, done.row.xp, done.row.jelly]).toEqual([true, 0, 10]);
    expect((sql.prepare("SELECT dogam_jelly FROM profiles WHERE user_id = 'me'").get() as { dogam_jelly: number }).dogam_jelly).toBe(10);
  });
  it('원정대를 끝까지(9장 대장을 처음) 깼을 때만 10개, 그 전엔 없어요', () => {
    expect(journeyJelly(true, 1, 0)).toBe(0);
    expect(journeyJelly(true, 8, 7)).toBe(0);
    expect(journeyJelly(true, 9, 8)).toBe(10); // 처음 끝까지
    expect(journeyJelly(true, 9, 9)).toBe(0); // 다시 깨면 없음
    expect(journeyJelly(false, 9, 8)).toBe(0);
  });
});

describe('출발 준비물', () => {
  it('고른 준비물 값을 내고 떠나고, 모자라면 떠나지 않아요', async () => {
    const { db, sql } = database();
    const cost = kitCost(['potion', 'shield'], 1);
    sql.prepare(`INSERT INTO journey_bank (user_id, coins, mats, updated_at) VALUES ('me', ?, '{}', 'x')`).run(cost + 5);
    const id = await beginJourney(db, 'me', 1, new Date(), ['potion', 'shield']);
    expect(id).not.toBe(NO_COINS);
    const run = (await getJourney(db, 'me', id!))!;
    expect([run.state.kit, run.state.kitShield, run.state.potion]).toEqual([['potion', 'shield'], KIT_SHIELD_HITS, 1]);
    expect((await journeyBank(db, 'me')).coins).toBe(5);
    expect(await quitJourney(db, 'me', id!)).toBe(true);
    expect(await beginJourney(db, 'me', 1, new Date(), ['clover'])).toBe(NO_COINS);
    expect(await activeJourney(db, 'me')).toBeNull();
    expect((await journeyBank(db, 'me')).coins).toBe(5);
  });
  it('방패는 처음 4번 절반만 맞고, 물약은 위험할 때 한 번 마셔요', () => {
    let usedPotion = 0;
    let shieldLeft = 0;
    for (let i = 0; i < 40; i++) {
      let s = startJourney(`kit-${i}`, { atk: 0, hp: 0, def: 0 }, 3, {}, ['potion', 'shield']);
      for (let k = 0; k < 500 && !s.done; k++) {
        s = actJourney(s, { a: 'idle' })!;
        if (s.today.some((l) => l.text.includes('회복 물약을 마셨어요'))) usedPotion++;
      }
      shieldLeft += s.kitShield ?? 0;
      expect(s.potion ?? 0).toBeLessThanOrEqual(1);
    }
    expect(usedPotion).toBeGreaterThan(0);
    expect(usedPotion).toBeLessThanOrEqual(40);
    expect(shieldLeft).toBeLessThan(40 * KIT_SHIELD_HITS);
  });
  it('행운 부적이 있으면 재료가 더 잘 나와요', () => {
    const play = (kit: ('clover')[]) => {
      let mats = 0;
      for (let i = 0; i < 300; i++) {
        let s = startJourney(`clover-${i}`, { atk: 20, hp: 20, def: 10 }, 1, { weapon: 3, armor: 3, charm: 3 }, kit);
        s.farm = true;
        for (let k = 0; k < 500 && !s.done; k++) s = actJourney(s, { a: 'idle' })!;
        mats += s.mats ?? 0;
      }
      return mats;
    };
    expect(play(['clover'])).toBeGreaterThan(play([]) * 1.2);
  });
});
