// 시뮬레이션: 원정대를 수백 판 무작위로 돌리며(두 번 누르기·옛 화면·그만두기·강화·장비·준비물·날짜 넘김 포함)
// 젤코인·재료·경험치·도감 젤리가 판 기록과 맞는지, 하루 보상 판 수·마지막 장 젤리가 한 번인지 확인해요.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { actJourneyRun, beginJourney, buyPerk, getJourney, journeyBank, quitJourney, upgradeGear, NO_COINS, STALE_PICK } from '../src/journey-db';
import { DAILY_REWARD_JOURNEYS, GEAR_IDS, JELLY_CHAPTERS, gearNeed, perkCost, type JourneyAction, type KitId, type PerkId } from '../src/journey';
import { MAX_CHAPTER } from '../src/journey-chapters';
import { journeyOpenTo } from '../src/unlock';
import { kstDay } from '../src/db';

function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  const tick = () => Promise.resolve();
  const stmt = (query: string, args: unknown[] = []) => ({
    query,
    args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => (await tick(), { results: sql.prepare(query).all(...(args as never[])) }),
    first: async () => (await tick(), sql.prepare(query).get(...(args as never[])) ?? null),
    run: async () => (await tick(), { meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }),
  });
  const db = {
    prepare: (q: string) => stmt(q),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      await tick();
      sql.exec('BEGIN');
      const out = [];
      try {
        for (const s of list) out.push({ meta: { changes: Number(sql.prepare(s.query).run(...(s.args as never[])).changes) }, results: [] });
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
      return out;
    },
  };
  return { sql, db: db as unknown as D1Database };
}

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
}

const U = '600000000000000001';

it('시뮬: 원정대 수백 판 — 젤코인·재료·보상이 판 기록과 맞아요', async () => {
  const RUNS = Number(process.env.SIM_STEPS ?? 80);
  for (const seed of (process.env.SIM_SEEDS ?? '1,2,3').split(',').map(Number)) {
    const r = rng(seed);
    const { sql, db } = fakeD1();
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'u', 1, '2026-01-01')").run(U);
    // 도감 조건은 다 채운 사람(카드 많이, 레벨 높게)
    for (let i = 0; i < 60; i++) {
      const o = `6100000000000000${String(i).padStart(2, '0')}`;
      sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'o', 1, '2026-01-01')").run(o);
      sql.prepare("INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES (?, ?, 1000000, 0, 0, '2026-01-01', '2026-01-01')").run(U, o);
    }
    sql.prepare("INSERT INTO profiles (user_id, dogam_jelly, solo_xp, updated_at) VALUES (?, 0, 0, '2026-01-01')").run(U);
    // 시드 절반은 훈련·장비를 다 올린 채 시작해요(마지막 장까지 가서 끝까지 깬 젤리를 확인하려고)
    if (seed % 2 === 0) sql.prepare("INSERT INTO journey_bank (user_id, coins, atk, hp, def, weapon, armor, charm, mats, updated_at) VALUES (?, 0, 10, 10, 5, 9, 9, 9, '{}', '2026-01-01')").run(U);
    let now = Date.parse('2026-11-18T14:50:00Z'); // 한국 23:50, 곧 날짜가 바뀌어요
    let spentCoins = 0;
    const spentMats = new Map<number, number>();
    let finishJelly = 0;
    let banked = 0;
    const mats = new Map<number, number>();
    let perks = 0, gears = 0, kits = 0, doubles = 0, quits = 0;
    for (let run = 0; run < RUNS; run++) {
      now += Math.floor(r() * 6) * 3_600_000 + Math.floor(r() * 60) * 60_000;
      // 준비 화면: 강화·장비를 가끔 사요(두 탭에서 같이 누르기도)
      for (let k = 0; k < 3; k++) {
        const bank = await journeyBank(db, U);
        if (r() < 0.5) {
          const id = (['atk', 'hp', 'def'] as PerkId[])[Math.floor(r() * 3)]!;
          const both = r() < 0.3;
          const res = await Promise.all((both ? [0, 1] : [0]).map(() => buyPerk(db, U, id, new Date(now), bank[id])));
          const ok = res.filter(Boolean).length;
          expect(ok).toBeLessThanOrEqual(1);
          if (ok) (spentCoins += perkCost(bank[id])), perks++;
        } else {
          const id = GEAR_IDS[Math.floor(r() * GEAR_IDS.length)]!;
          const res = await Promise.all((r() < 0.3 ? [0, 1] : [0]).map(() => upgradeGear(db, U, id, new Date(now), bank[id])));
          const ok = res.filter(Boolean).length;
          expect(ok).toBeLessThanOrEqual(1);
          if (ok) {
            const need = gearNeed(bank[id] + 1);
            spentCoins += need.coins;
            for (const c of need.cost) spentMats.set(c.ch, (spentMats.get(c.ch) ?? 0) + c.n);
            gears++;
          }
        }
      }
      const top = (sql.prepare("SELECT COALESCE(MAX(chapter), 0) t FROM journey_runs WHERE user_id = ? AND status = 'done' AND cleared = 1").get(U) as { t: number }).t;
      const open = Math.min(MAX_CHAPTER, top + 1, journeyOpenTo({ cards: 60, levels: Array(60).fill(999) }, new Date(now))); // 10장부터는 여는 날 전이라 잠겨 있어요
      const ch = 1 + Math.floor(r() * open);
      const kit: KitId[] = r() < 0.25 ? [(['potion', 'shield', 'clover'] as KitId[])[Math.floor(r() * 3)]!] : [];
      const coinsBefore = (await journeyBank(db, U)).coins;
      const id = await beginJourney(db, U, ch, new Date(now), kit, open);
      expect(id).not.toBe(STALE_PICK);
      if (id === NO_COINS || !id) continue;
      const paid = coinsBefore - (await journeyBank(db, U)).coins;
      if (paid > 0) (spentCoins += paid), kits++;
      // 진행
      for (let guard = 0; guard < 400; guard++) {
        const g = await getJourney(db, U, id);
        if (!g || g.row.status !== 'going') break;
        if (r() < 0.0005) {
          if (await quitJourney(db, U, id, g.row.rev)) quits++;
          break;
        }
        const s = g.state;
        const pend = s.pending;
        const act: JourneyAction = !pend ? (r() < 0.2 ? { a: 'next' } : { a: 'auto' })
          : pend.kind === 'shop' ? (r() < 0.5 ? { a: 'buy', n: Math.floor(r() * pend.offers.length) } : { a: 'leave' })
          : pend.kind === 'event' ? (r() < 0.1 ? { a: 'leave' } : { a: 'pick', n: Math.floor(r() * 2) })
          : { a: 'pick', n: Math.floor(r() * pend.options.length) };
        now += 20_000;
        if (r() < 0.1) {
          // 두 번 누르기: 같은 순번으로 두 번
          const res = await Promise.all([actJourneyRun(db, U, id, g.row.rev, act, new Date(now)), actJourneyRun(db, U, id, g.row.rev, act, new Date(now))]);
          expect(res.filter((x) => x === 'ok').length, JSON.stringify(res)).toBeLessThanOrEqual(1);
          doubles++;
        } else {
          const res = await actJourneyRun(db, U, id, g.row.rev, act, new Date(now));
          if (res === 'bad') await actJourneyRun(db, U, id, g.row.rev, { a: 'leave' }, new Date(now));
        }
      }
      // 끝난 판이 모은 젤코인·재료(3일 지나면 판 내용이 비워져서 끝난 바로 그때 적어 둬요)
      const end = await getJourney(db, U, id);
      if (end?.row.status === 'done') {
        const st = end.state as unknown as { banked?: number; coins: number; matsBanked?: number };
        banked += st.banked ?? st.coins;
        const chap = (end.row as unknown as { chapter: number }).chapter;
        mats.set(chap, (mats.get(chap) ?? 0) + (st.matsBanked ?? 0));
      }
      // ── 확인 ──
      const runs = sql.prepare('SELECT * FROM journey_runs WHERE user_id = ?').all(U) as { status: string; xp: number; jelly: number; reward_day: string | null; chapter: number; cleared: number; state: string; day: number }[];
      const prof = sql.prepare('SELECT dogam_jelly j, solo_xp x FROM profiles WHERE user_id = ?').get(U) as { j: number; x: number };
      const sumXp = runs.reduce((a, x) => a + x.xp, 0);
      const sumJelly = runs.reduce((a, x) => a + x.jelly, 0);
      expect(prof.x).toBe(sumXp);
      expect(prof.j).toBe(sumJelly);
      // 하루 보상 판 수
      const perDay = new Map<string, number>();
      for (const x of runs) if (x.xp > 0) perDay.set(x.reward_day!, (perDay.get(x.reward_day!) ?? 0) + 1);
      for (const [d, n] of perDay) expect(n, d).toBeLessThanOrEqual(DAILY_REWARD_JOURNEYS);
      // 보상 날짜는 끝낸 한국 날짜
      for (const x of runs) if (x.status === 'done') expect(x.reward_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // 9장(그리고 15장) 젤리는 장마다 딱 한 번
      finishJelly = runs.filter((x) => x.jelly > 0).length;
      expect(finishJelly).toBeLessThanOrEqual(JELLY_CHAPTERS.length);
      for (const x of runs.filter((x) => x.jelly > 0)) expect(JELLY_CHAPTERS).toContain(x.chapter);
      // 강화 주머니 = 판마다 모은 것 − 쓴 것
      const bank = await journeyBank(db, U);
      let clears = 0, best = 0;
      for (const x of runs) {
        if (x.status !== 'done') continue;
        clears += x.cleared;
        best = Math.max(best, (x.chapter - 1) * 20 + x.day);
      }
      expect(bank.coins, `seed ${seed} run ${run}`).toBe(banked - spentCoins);
      expect(bank.coins).toBeGreaterThanOrEqual(0);
      for (let c = 1; c <= MAX_CHAPTER; c++) expect(bank.mats[c] ?? 0, `mats ch${c}`).toBe((mats.get(c) ?? 0) - (spentMats.get(c) ?? 0));
      const b = sql.prepare('SELECT best, clears FROM journey_bank WHERE user_id = ?').get(U) as { best: number; clears: number } | undefined;
      if (b) {
        expect(b.clears).toBe(clears);
        expect(b.best).toBe(best);
      }
      expect(kstDay(new Date(now))).toMatch(/^\d{4}/);
    }
    const stat = sql.prepare("SELECT COUNT(*) n, SUM(cleared) c, MAX(chapter) top, SUM(xp > 0) rewarded FROM journey_runs").get();
    if (process.env.SIM_STATS) console.log(`seed ${seed}`, JSON.stringify({ ...stat, perks, gears, kits, doubles, quits, finishJelly }));
  }
}, 600_000);
