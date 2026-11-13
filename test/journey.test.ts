import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAYS, actJourney, autoChoice, decodeJourney, journeyXp, perkMax, startJourney, stat, type JourneyState } from '../src/journey';
import { actJourneyRun, activeJourney, beginJourney, buyPerk, getJourney, journeyBank, journeyRecord, quitJourney } from '../src/journey-db';

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
  it('하루 첫 2판만 경험치·젤리를 받아요', async () => {
    const { db, sql } = database();
    let xp = 0;
    let jelly = 0;
    for (let i = 0; i < 3; i++) {
      const r = await playToEnd(db);
      expect(r.row.status).toBe('done');
      if (i < 2) {
        expect(r.row.xp).toBe(journeyXp(r.state.day, r.state.cleared));
        expect(r.row.jelly).toBe(r.state.cleared ? 1 : 0);
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
  it('아직 못 깬 장은 죽어도 젤코인이 다 모이고, 이미 깬 장을 다시 돌면 하루에 100% → 50% → 25% → 0%', async () => {
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
    for (const pct of [100, 50, 25, 0, 0]) {
      const r = await playToEnd(db);
      expect([r.state.farm, r.state.bankPct]).toEqual([true, pct]);
      expect(r.state.banked).toBe(Math.floor((r.state.coins * pct) / 100));
      total += r.state.banked!;
    }
    expect((await journeyBank(db, 'me')).coins).toBe(before + total);
    expect((await journeyRecord(db, 'me')).farmedToday).toBe(5);
    expect((await journeyRecord(db, 'me', '2099-01-01')).farmedToday).toBe(0);
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
        expect(next.fx.hits.length).toBeLessThanOrEqual(6);
        const last = next.fx.hits[next.fx.hits.length - 1]!;
        expect(last[0]).toBe(next.fx.won ? 0 : 1);
        const plan = fightPlan(next.fx);
        expect(plan.pops.length).toBe(next.fx.hits.length + (next.fx.spark ? 1 : 0));
        expect(plan.ms).toBeGreaterThan(1000);
      }
      s = next;
    }
    expect(seen).toBeGreaterThan(0);
    // 싸움 뒤 스킬을 고르면 지난 싸움은 다시 보여 주지 않아요
    const fought = { ...startJourney('x'), fx: { foe: 'slime', won: true, hits: [[0, 5]] as [0, number][] }, pending: { kind: 'skill' as const, options: ['power' as const] } };
    expect(actJourney(fought, { a: 'pick', n: 0 })!.fx).toBeUndefined();
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
    const id = (await beginJourney(db, 'me', 5))!;
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
