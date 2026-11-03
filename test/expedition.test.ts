import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EVENTS,
  STEPS,
  applyChoice,
  defaultRole,
  eventById,
  replay,
  rng,
  startState,
  visibleOptions,
  type Crew,
  type RunState,
} from '../src/expedition';
import { act, buildCrew, currentRun, listCandidates, myRecord, quitRun, setRole, startRun } from '../src/expedition-db';

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

const crewOf = (roles: Crew['role'][]): Crew[] =>
  roles.map((role, i) => ({ id: `u${i}`, name: `대원${i}`, art: '/x.png', role, bonus: 0, cond: 'plain' }));

function legal(crew: Crew[], s: RunState): number[] {
  if (s.phase === 'path') return s.paths.map((_, i) => i);
  if (s.phase === 'event') return visibleOptions(eventById(s.event!)!, crew, s).filter((v) => v.ok).map((v) => v.index);
  return [];
}

// 무작위로 끝까지 플레이해요
function playRandom(seed: string, crew: Crew[], pickSeed: string) {
  const r = rng(pickSeed);
  const s = startState(seed, crew);
  const choices: number[] = [];
  while (s.phase !== 'done') {
    const opts = legal(crew, s);
    expect(opts.length).toBeGreaterThan(0);
    const c = opts[Math.floor(r() * opts.length)]!;
    expect(applyChoice(seed, crew, s, c, choices.length)).toBe(true);
    choices.push(c);
    expect(choices.length).toBeLessThan(200);
  }
  return { s, choices };
}

describe('원정대 규칙', () => {
  it('사건 12개와 모든 선택지 문장이 있어요', () => {
    expect(EVENTS).toHaveLength(12);
    for (const e of EVENTS) {
      expect(e.intros.length).toBeGreaterThan(0);
      expect(e.options.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('같은 씨앗과 선택이면 늘 같은 결과예요(새로고침해도 그대로)', () => {
    const crew = crewOf(['scout', 'guard', 'mage']);
    const { s, choices } = playRandom('seed-a', crew, 'p1');
    const again = replay('seed-a', crew, choices);
    expect(again).toEqual(s);
  });

  it('어떻게 골라도 막히지 않고 끝나요', () => {
    const roleSets: Crew['role'][][] = [
      ['scout', 'guard', 'mage'],
      ['healer', 'talker', 'scribe'],
      ['guard', 'guard', 'guard'],
      ['scribe', 'healer', 'scout'],
    ];
    const endings = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const crew = crewOf(roleSets[i % roleSets.length]!);
      const { s } = playRandom(`seed-${i}`, crew, `pick-${i}`);
      expect(s.ending).not.toBeNull();
      expect(s.step).toBeLessThanOrEqual(STEPS);
      endings.add(s.ending!);
    }
    expect(endings.has('treasure')).toBe(true);
    expect(endings.has('retreat')).toBe(true);
  });

  it('비석을 읽고 여우를 도우면 숨은 결말에 갈 수 있어요', () => {
    const crew = crewOf(['scribe', 'healer', 'guard']);
    let found = 0;
    for (let i = 0; i < 200 && !found; i++) {
      const seed = `hidden-${i}`;
      const s = startState(seed, crew);
      let t = 0;
      while (s.phase !== 'done') {
        let c: number;
        if (s.phase === 'path') {
          const u = s.paths.indexOf('unknown');
          c = u >= 0 ? u : 0;
        } else {
          const ev = eventById(s.event!)!;
          const opts = visibleOptions(ev, crew, s).filter((v) => v.ok);
          const want = opts.find((v) => v.opt.win.flag || v.opt.win.end === 'hidden');
          c = (want ?? opts.find((v) => !v.opt.check) ?? opts[0]!).index;
        }
        applyChoice(seed, crew, s, c, t++);
      }
      if (s.ending === 'hidden') found++;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('마지막 칸은 늘 숲의 주인이에요', () => {
    const crew = crewOf(['scout', 'guard', 'mage']);
    const s = startState('seed-boss', crew);
    let turn = 0;
    while (!(s.phase === 'path' && s.step === STEPS - 1) && s.phase !== 'done') {
      // 가장 안전한 선택(판정 없는 것)부터
      const opts = legal(crew, s);
      applyChoice('seed-boss', crew, s, opts[opts.length - 1]!, turn++);
    }
    if (s.phase === 'done') return;
    expect(s.paths).toEqual(['boss']);
    applyChoice('seed-boss', crew, s, 0, turn++);
    expect(s.event).toBe('boss');
  });

  it('모든 사건에 비용 없이 고를 수 있는 선택지가 있어요(막히지 않게)', () => {
    for (const e of EVENTS) expect(e.options.some((o) => !o.role && !o.need && !o.cost && !o.heal)).toBe(true);
  });

  it('역할 선택지는 그 역할 대원이 있을 때만 보여요', () => {
    const ev = eventById('chest')!;
    const s = startState('x', crewOf(['guard', 'guard', 'guard']));
    const labels = visibleOptions(ev, crewOf(['guard', 'guard', 'guard']), s).map((v) => v.opt.label);
    expect(labels).toContain('상자를 부순다');
    expect(labels).not.toContain('함정부터 살핀다');
  });

  it('잘못된 선택은 받지 않아요', () => {
    const crew = crewOf(['scout', 'guard', 'mage']);
    const s = startState('x', crew);
    expect(applyChoice('x', crew, s, 9, 0)).toBe(false);
    expect(() => replay('x', crew, [9])).toThrow();
  });

  it('견습 대원은 대원에 없는 역할로 채워요', () => {
    const crew = buildCrew([{ id: 'a', name: '가', art: '/a.png', role: 'scout', xp: 0, me: true }], 'seed');
    expect(crew).toHaveLength(3);
    expect(crew.filter((c) => c.id === null)).toHaveLength(2);
    expect(new Set(crew.map((c) => c.role)).size).toBe(3);
    expect(defaultRole('123')).toBe(defaultRole('123'));
  });
});

describe('원정대 기록과 보상', () => {
  function setup() {
    const { sql, db } = fakeD1();
    const t = '2026-11-03T00:00:00Z';
    for (const id of ['me', 'f1', 'f2', 'gone'])
      sql.prepare('INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, ?, ?)').run(id, id, id === 'gone' ? 0 : 1, t);
    for (const id of ['f1', 'gone'])
      sql.prepare('INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, ?, ?, ?)').run('me', id, 5000, t, t);
    return { sql, db };
  }

  async function finish(db: D1Database, now: Date) {
    for (let i = 0; i < 200; i++) {
      const run = (await currentRun(db, 'me'))!;
      const opts = legal(run.crew, run.state);
      // 돌아가기가 있으면 바로 돌아가요(빨리 끝내려고)
      const ev = run.state.event ? eventById(run.state.event) : null;
      const back = ev?.options.findIndex((o) => o.win.end === 'retreat') ?? -1;
      const c = back >= 0 ? back : opts[opts.length - 1]!;
      const r = await act(db, 'me', run.row.id, run.choices.length, c, now);
      if (r.result === 'done') return r.runId!;
      expect(r.result).toBe('ok');
    }
    throw new Error('끝나지 않았어요');
  }

  it('데려갈 수 있는 사람은 나와 내가 카드를 가진 지금 멤버뿐이에요', async () => {
    const { db } = setup();
    const ids = (await listCandidates(db, 'me')).map((c) => c.id);
    expect(ids).toEqual(['me', 'f1']);
    expect(await startRun(db, 'me', ['f2'])).toBe('bad_pick');
    expect(await startRun(db, 'me', ['gone'])).toBe('bad_pick');
    expect(await startRun(db, 'me', ['me', 'f1', 'a', 'b'])).toBe('too_many');
  });

  it('내 역할을 바꾸면 대원 목록에 반영돼요', async () => {
    const { db } = setup();
    await setRole(db, 'me', 'scribe');
    expect((await listCandidates(db, 'me'))[0]!.role).toBe('scribe');
  });

  it('하루 첫 3판만 보상을 주고, 발견품은 늘 모아요', async () => {
    const { sql, db } = setup();
    const now = new Date('2026-11-03T03:00:00Z');
    for (let i = 0; i < 4; i++) {
      expect(await startRun(db, 'me', ['me', 'f1'])).toBe('started');
      await finish(db, now);
    }
    const rows = sql.prepare(`SELECT xp FROM exp_runs WHERE status = 'done' ORDER BY rowid`).all() as { xp: number }[];
    expect(rows.map((r) => r.xp)).toEqual([10, 10, 10, 0]);
    const p = sql.prepare('SELECT solo_xp FROM profiles WHERE user_id = ?').get('me') as { solo_xp: number };
    expect(p.solo_xp).toBe(30);
    const rec = await myRecord(db, 'me', now);
    expect(rec.today).toBe(4);
    expect(rec.runs).toBe(4);
    // 다음 날은 다시 받아요
    await startRun(db, 'me', ['me']);
    await finish(db, new Date('2026-11-04T03:00:00Z'));
    const p2 = sql.prepare('SELECT solo_xp FROM profiles WHERE user_id = ?').get('me') as { solo_xp: number };
    expect(p2.solo_xp).toBe(40);
  });

  it('옛 차례로 다시 누르면 반영하지 않아요', async () => {
    const { db } = setup();
    await startRun(db, 'me', ['me']);
    const id = (await currentRun(db, 'me'))!.row.id;
    expect((await act(db, 'me', id, 0, 0)).result).toBe('ok');
    expect((await act(db, 'me', id, 0, 0)).result).toBe('stale');
    expect((await currentRun(db, 'me'))!.choices).toEqual([0]);
  });

  it('다른 탭의 옛 원정 화면에서 누른 건 새 원정에 반영하지 않아요', async () => {
    const { db } = setup();
    await startRun(db, 'me', ['me']);
    const old = (await currentRun(db, 'me'))!.row.id;
    await startRun(db, 'me', ['f1']);
    expect((await act(db, 'me', old, 0, 0)).result).toBe('stale');
    expect((await currentRun(db, 'me'))!.choices).toEqual([]);
  });

  it('그만두면 진행 중인 원정이 없어지고 보상도 없어요', async () => {
    const { sql, db } = setup();
    await startRun(db, 'me', ['me']);
    await quitRun(db, 'me');
    expect(await currentRun(db, 'me')).toBeNull();
    expect(sql.prepare('SELECT COUNT(*) AS n FROM profiles').get()).toEqual({ n: 0 });
  });

  it('새로 시작하면 하던 원정은 그만둔 것으로 해요', async () => {
    const { sql, db } = setup();
    await startRun(db, 'me', ['me']);
    await startRun(db, 'me', ['f1']);
    expect(sql.prepare(`SELECT status, COUNT(*) AS n FROM exp_runs GROUP BY status ORDER BY status`).all()).toEqual([
      { status: 'going', n: 1 },
      { status: 'quit', n: 1 },
    ]);
  });
});
