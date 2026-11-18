// 시뮬레이션: 사건파일을 여러 번(다시 하기·그만두기·두 번 누르기·실수 섞기) 풀며
// 사건마다 처음 해결 한 번만 경험치·젤리를 받는지, 받은 값이 그 판 등급과 맞는지 확인해요.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { ESCAPE_CASES, ESC_XP, escJelly, type EscAction, type EscGrade } from '../src/escape';
import { actEscapeRun, beginEscape, getEscape, quitEscape } from '../src/escape-db';

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

const U = '700000000000000001';

it('시뮬: 사건파일 — 다시 풀어도 처음 해결 보상은 한 번, 값은 그 판 등급대로', async () => {
  const RUNS = Number(process.env.SIM_STEPS ?? 60);
  const cases = ESCAPE_CASES.filter((c) => c.solution).slice(0, 8);
  for (const seed of (process.env.SIM_SEEDS ?? '1,2,3').split(',').map(Number)) {
    const r = rng(seed);
    const { sql, db } = fakeD1();
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'u', 1, '2026-01-01')").run(U);
    for (let i = 0; i < 60; i++) {
      const o = `7100000000000000${String(i).padStart(2, '0')}`;
      sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'o', 1, '2026-01-01')").run(o);
      sql.prepare("INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES (?, ?, 1000000, 0, 0, '2026-01-01', '2026-01-01')").run(U, o);
    }
    let now = Date.parse('2026-11-18T10:00:00Z');
    const firstGrade = new Map<string, EscGrade>();
    let doubles = 0, quits = 0, solved = 0, wrongs = 0;
    for (let run = 0; run < RUNS; run++) {
      const c = cases[Math.floor(r() * cases.length)]!;
      // 하던 사건이 있으면 그걸 이어가요(바꾸려면 그만두고)
      const id = await beginEscape(db, U, c.id, new Date((now += 60_000)));
      expect(id).toBeTruthy();
      const first = await getEscape(db, U, id!);
      const steps = first!.def.solution!;
      let i = 0;
      for (let guard = 0; guard < 400; guard++) {
        const g = await getEscape(db, U, id!);
        if (!g || g.row.status !== 'going') break;
        if (r() < 0.01) {
          if (await quitEscape(db, U, id!, g.row.rev)) quits++;
          break;
        }
        // 가끔 틀린 답을 내요(실수 → 등급이 내려가요)
        let act: EscAction = steps[Math.min(i, steps.length - 1)]!;
        if (act.a === 'answer' && r() < 0.3) {
          act = { ...act, n: (act.n + 1) % 3 };
          wrongs++;
        }
        now += 5_000;
        let ok = false;
        if (r() < 0.15) {
          const res = await Promise.all([actEscapeRun(db, U, id!, g.row.rev, act, new Date(now)), actEscapeRun(db, U, id!, g.row.rev, act, new Date(now))]);
          expect(res.filter((x) => x === 'ok').length).toBeLessThanOrEqual(1);
          ok = res.includes('ok');
          doubles++;
        } else ok = (await actEscapeRun(db, U, id!, g.row.rev, act, new Date(now))) === 'ok';
        if (ok && act === steps[i]) i++;
        if (!ok && act === steps[i]) break; // 풀이와 다른 판(드뭄)
      }
      const end = await getEscape(db, U, id!);
      if (end?.row.status === 'done') {
        solved++;
        if (!firstGrade.has(end.row.case_id)) firstGrade.set(end.row.case_id, end.row.grade as EscGrade);
      } else if (end?.row.status === 'going') await quitEscape(db, U, id!);
      // ── 확인 ──
      const prof = sql.prepare('SELECT COALESCE(solo_xp,0) x, COALESCE(dogam_jelly,0) j FROM profiles WHERE user_id = ?').get(U) as { x: number; j: number } | undefined;
      const expXp = firstGrade.size * ESC_XP;
      const expJelly = [...firstGrade.values()].reduce((a, g) => a + escJelly(g), 0);
      expect(prof?.x ?? 0, `seed ${seed} run ${run}`).toBe(expXp);
      expect(prof?.j ?? 0, `seed ${seed} run ${run}`).toBe(expJelly);
      const rewards = sql.prepare('SELECT case_id, run_id FROM escape_rewards WHERE user_id = ?').all(U) as { case_id: string; run_id: string }[];
      expect(new Set(rewards.map((x) => x.case_id))).toEqual(new Set(firstGrade.keys()));
      const paid = sql.prepare('SELECT case_id, COUNT(*) n FROM escape_runs WHERE user_id = ? AND xp > 0 GROUP BY case_id').all(U) as { case_id: string; n: number }[];
      for (const p of paid) expect(p.n).toBe(1);
      expect(sql.prepare("SELECT COUNT(*) n FROM escape_runs WHERE user_id = ? AND status = 'going'").get(U)).toEqual({ n: 0 });
    }
    if (process.env.SIM_STATS) console.log(`seed ${seed}`, JSON.stringify({ solved, quits, doubles, wrongs, cases: firstGrade.size, grades: [...firstGrade.values()].join('') }));
  }
}, 600_000);
