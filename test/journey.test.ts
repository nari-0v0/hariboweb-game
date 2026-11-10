import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAYS, actJourney, autoChoice, decodeJourney, journeyXp, startJourney, stat, type JourneyState } from '../src/journey';
import { actJourneyRun, activeJourney, beginJourney, getJourney, journeyRecord, quitJourney } from '../src/journey-db';

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
    const id = (await beginJourney(db, 'me'))!;
    for (let i = 0; i < 300; i++) {
      const run = await getJourney(db, 'me', id);
      if (run!.row.status !== 'going') break;
      expect(await actJourneyRun(db, 'me', id, run!.row.rev, { a: 'idle' })).toBe('ok');
    }
    const end = (await getJourney(db, 'me', id))!;
    expect(end.row.status).toBe('done');
    const bank = await journeyBank(db, 'me');
    expect(bank.coins).toBe(end.state.coins);
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
