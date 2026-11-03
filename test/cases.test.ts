import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASES, GOOD_LOOKS, grade, makePuzzle, possible, topic, type Suspect } from '../src/cases';
import { accuse, caseRecord, currentCase, lookAt, pickSuspects, quitCase, startCase } from '../src/cases-db';

function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (query: string, args: unknown[] = []) => ({
    query,
    args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => ({ results: sql.prepare(query).all(...(args as never[])) }),
    first: async () => sql.prepare(query).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }),
  });
  const db = {
    prepare: (q: string) => stmt(q),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      sql.exec('BEGIN');
      try {
        const out = list.map((s) =>
          /^\s*SELECT/i.test(s.query)
            ? { results: sql.prepare(s.query).all(...(s.args as never[])) }
            : { results: [], meta: { changes: Number(sql.prepare(s.query).run(...(s.args as never[])).changes) } },
        );
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sql, db: db as unknown as D1Database };
}

const cast: Suspect[] = ['가람', '나비', '다온', '라온'].map((name, i) => ({ id: `u${i}`, name, art: '/x.png' }));

describe('사건 만들기', () => {
  it('특징 단서 두 개를 겹치면 범인이 꼭 한 명으로 좁혀져요', () => {
    for (const def of CASES)
      for (let i = 0; i < 200; i++) {
        const p = makePuzzle(def, `seed-${i}`, cast);
        const t1 = p.clues.findIndex((c) => c.kind === 'trait1');
        const t2 = p.clues.findIndex((c) => c.kind === 'trait2');
        expect(possible(p, [t1, t2])).toEqual([p.culprit]);
        // 하나만으로는 두 명이 남아요(바로 찍히지 않게)
        expect(possible(p, [t1])).toHaveLength(2);
        expect(possible(p, [t2])).toHaveLength(2);
        // 용의자 넷의 특징 조합은 모두 다르고, 모든 특징 값은 꼭 두 명이 같이 가져요(처음 카드만 봐서는 범인을 알 수 없게)
        expect(new Set(p.traits.map(([a, b]) => `${a}-${b}`)).size).toBe(4);
        for (const k of [0, 1] as const) {
          const counts = new Map<number, number>();
          for (const t of p.traits) counts.set(t[k], (counts.get(t[k]) ?? 0) + 1);
          expect([...counts.values()]).toEqual([2, 2]);
        }
        // 알리바이는 범인을 빼지 않아요
        const alibi = p.clues.find((c) => c.kind === 'alibi')!;
        expect(alibi.who).not.toBe(p.culprit);
        expect(alibi.text.startsWith(topic(cast[alibi.who!]!.name))).toBe(true);
        expect(p.clues).toHaveLength(def.places.length);
      }
  });

  it('같은 씨앗이면 늘 같은 사건이에요(새로고침해도 그대로)', () => {
    expect(makePuzzle(CASES[0]!, 'same', cast)).toEqual(makePuzzle(CASES[0]!, 'same', cast));
  });

  it('범인이 다양하게 나와요', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add(makePuzzle(CASES[1]!, `v-${i}`, cast).culprit);
    expect(seen.size).toBe(4);
  });

  it('등급은 범인이 먼저, 그다음 방법·동기와 조사 횟수로 정해요', () => {
    const p = makePuzzle(CASES[2]!, 'g', cast);
    const right = { culprit: p.culprit, method: p.method, motive: p.motive };
    expect(grade(p, right, GOOD_LOOKS)).toBe('S');
    expect(grade(p, right, GOOD_LOOKS + 1)).toBe('A');
    expect(grade(p, { ...right, motive: (p.motive + 1) % 3 }, 2)).toBe('B');
    expect(grade(p, { ...right, method: (p.method + 1) % 3, motive: (p.motive + 1) % 3 }, 2)).toBe('C');
    expect(grade(p, { ...right, culprit: (p.culprit + 1) % 4 }, 2)).toBe('F');
  });

  it('받침에 맞춰 은/는을 붙여요', () => {
    expect(topic('가람')).toBe('가람은');
    expect(topic('나비')).toBe('나비는');
    expect(topic('abc')).toBe('abc은(는)');
  });
});

describe('사건파일 기록과 보상', () => {
  function setup() {
    const { sql, db } = fakeD1();
    const t = '2026-11-03T00:00:00Z';
    for (const id of ['me', 'f1', 'f2', 'gone'])
      sql.prepare('INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, ?, ?)').run(id, id, id === 'gone' ? 0 : 1, t);
    for (const id of ['f1', 'gone'])
      sql.prepare('INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, ?, ?, ?)').run('me', id, 50, t, t);
    return { sql, db };
  }

  it('용의자는 내가 카드를 가진 지금 멤버이고, 모자라면 가상 인물로 채워요', async () => {
    const { db } = setup();
    const s = await pickSuspects(db, 'me', 'x');
    expect(s).toHaveLength(4);
    expect(s.filter((v) => v.id).map((v) => v.id)).toEqual(['f1']);
    expect(s.filter((v) => !v.id)).toHaveLength(3);
  });

  async function solve(db: D1Database, now: Date, right = true) {
    expect(await startCase(db, 'me', 'jelly')).toBe('started');
    const run = (await currentCase(db, 'me'))!;
    expect((await lookAt(db, 'me', run.row.id, 0, 0)).result).toBe('ok');
    const p = run.puzzle;
    const ans = right ? { culprit: p.culprit, method: p.method, motive: p.motive } : { culprit: (p.culprit + 1) % 4, method: 0, motive: 0 };
    const r = await accuse(db, 'me', run.row.id, 1, ans, now);
    expect(r.result).toBe('done');
    return r.runId!;
  }

  it('하루 첫 3건만 경험치를 주고, S·A면 젤리도 줘요', async () => {
    const { sql, db } = setup();
    const now = new Date('2026-11-03T03:00:00Z');
    await solve(db, now);
    await solve(db, now, false);
    await solve(db, now);
    await solve(db, now);
    const rows = sql.prepare(`SELECT xp, jelly, grade FROM case_runs WHERE status = 'done' ORDER BY rowid`).all() as { xp: number; jelly: number; grade: string }[];
    expect(rows.map((r) => r.xp)).toEqual([10, 10, 10, 0]);
    expect(rows.map((r) => r.jelly)).toEqual([1, 0, 1, 0]);
    expect(rows.map((r) => r.grade)).toEqual(['S', 'F', 'S', 'S']);
    const p = sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get('me') as { solo_xp: number; dogam_jelly: number };
    expect(p.solo_xp).toBe(30);
    expect(p.dogam_jelly).toBe(2);
    const rec = await caseRecord(db, 'me', now);
    expect(rec.best.get('jelly')).toBe('S');
    expect(rec.solved).toBe(3);
    expect(rec.played).toBe(4);
    expect(rec.today).toBe(4);
  });

  it('조사 없이 지목하거나, 옛 화면·두 번 누르기는 반영하지 않아요', async () => {
    const { db } = setup();
    await startCase(db, 'me', 'trophy');
    const run = (await currentCase(db, 'me'))!;
    const p = run.puzzle;
    const ans = { culprit: p.culprit, method: p.method, motive: p.motive };
    expect((await accuse(db, 'me', run.row.id, 0, ans)).result).toBe('bad');
    expect((await lookAt(db, 'me', run.row.id, 0, 2)).result).toBe('ok');
    expect((await lookAt(db, 'me', run.row.id, 0, 3)).result).toBe('stale');
    expect((await lookAt(db, 'me', run.row.id, 1, 2)).result).toBe('bad');
    expect((await lookAt(db, 'me', run.row.id, 1, 9)).result).toBe('bad');
    expect((await currentCase(db, 'me'))!.looked).toEqual([2]);
    expect((await accuse(db, 'me', run.row.id, 1, { ...ans, culprit: 7 })).result).toBe('bad');
    expect((await accuse(db, 'me', run.row.id, 1, ans)).result).toBe('done');
    expect((await accuse(db, 'me', run.row.id, 1, ans)).result).toBe('none');
  });

  it('다른 탭의 옛 사건 화면은 새 사건에 반영하지 않고, 사건 덮기도 그 사건만 덮어요', async () => {
    const { db } = setup();
    await startCase(db, 'me', 'jelly');
    const old = (await currentCase(db, 'me'))!.row.id;
    await startCase(db, 'me', 'karaoke');
    expect((await lookAt(db, 'me', old, 0, 0)).result).toBe('stale');
    expect(await quitCase(db, 'me', old)).toBe(false);
    expect((await currentCase(db, 'me'))!.def.id).toBe('karaoke');
    expect(await startCase(db, 'me', 'nope')).toBe('bad_case');
  });
});
