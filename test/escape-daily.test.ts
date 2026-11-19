import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// 스위치(DAILY_OPEN)를 켠 상태로 시험해요. 꺼진 기본값은 escape-daily-off.test.ts에서 봐요.
vi.mock('../src/escape-daily', async (orig) => ({ ...(await orig<typeof import('../src/escape-daily')>()), DAILY_OPEN: true }));

import { ESCAPE_CASES, escCase, actEscape, canAnswer, isLocked, startEscape, visible, type EscAction, type EscCase, type EscState } from '../src/escape';
import { actEscapeRun, activeEscape, beginDaily, beginEscape, dailyInfo, getEscape, quitEscape, reRecord } from '../src/escape-db';
import { STORY_SEEDS } from '../src/escape-stories';
import { dailyPick, dailyVariant, kstDay, shownStreak } from '../src/escape-daily';

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

// 정답 풀이: 보이는 물건을 차례로 눌러 보고, 잠긴 곳은 가방 물건이나 비밀번호로 열어요(실수 없이).
function solve(c: EscCase): { s: EscState; steps: EscAction[] } {
  let s = startEscape(c);
  const steps: EscAction[] = [];
  const step = (a: EscAction) => {
    const next = actEscape(c, s, a);
    expect(next, JSON.stringify(a)).not.toBeNull();
    s = next!;
    steps.push(a);
  };
  for (let round = 0; round < 40 && !canAnswer(c, s); round++) {
    for (const scene of c.scenes) {
      const door = c.objects.find((o) => o.scene === s.scene && o.goto === scene.id && !isLocked(s, o) && s.scene !== scene.id);
      for (const o of c.objects.filter((o) => visible(c, s, o) && !o.goto)) {
        if (!isLocked(s, o)) {
          if (!s.seen.includes(o.id)) step({ a: 'tap', o: o.id });
        } else if (o.lock!.kind === 'code') step({ a: 'code', o: o.id, v: o.lock!.code });
        else if (s.inv.includes(o.lock!.item)) step({ a: 'use', o: o.id, i: o.lock!.item });
      }
      for (const o of c.objects.filter((o) => visible(c, s, o) && o.goto && isLocked(s, o) && o.lock!.kind === 'item' && s.inv.includes(o.lock!.item))) step({ a: 'use', o: o.id, i: (o.lock as { item: string }).item });
      if (door) step({ a: 'tap', o: door.id });
    }
  }
  expect(canAnswer(c, s)).toBe(true);
  step({ a: 'answer', n: c.question.correct });
  return { s, steps };
}

const STORY = new Set(STORY_SEEDS.map((x) => x.id));
// 도감 조건 없이 열리는 이야기 사건(처음 5개 안)
const FREE = ESCAPE_CASES.slice(0, 5).find((c) => STORY.has(c.id))!;
const T0 = new Date('2026-11-19T03:00:00Z'); // 한국 12시
const solvedIt = (sql: DatabaseSync, id = FREE.id) => sql.prepare("INSERT INTO escape_rewards (user_id, case_id, run_id, claimed_at) VALUES ('me', ?, 'r', 'x')").run(id);

describe('오늘의 사건 규칙', () => {
  it('한국 날짜로 바뀌고, 날마다 섞은 판 번호가 달라요', () => {
    expect(kstDay(new Date('2026-11-19T14:59:59Z'))).toBe('2026-11-19');
    expect(kstDay(new Date('2026-11-19T15:00:00Z'))).toBe('2026-11-20');
    expect(dailyVariant('2026-11-20')).toBe(dailyVariant('2026-11-19') + 1);
    expect(dailyVariant('2026-11-19')).toBeGreaterThan(1000);
  });
  it('해결한 이야기 사건 중에서만 골라요(입문·대화 사건, 안 푼 사건은 안 나와요)', () => {
    expect(dailyPick('me', '2026-11-19', [])).toBeNull();
    expect(dailyPick('me', '2026-11-19', [ESCAPE_CASES[0]!.id])).toBeNull();
    const pool = ESCAPE_CASES.filter((c) => STORY.has(c.id)).slice(0, 6).map((c) => c.id);
    const seen = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      const p = dailyPick('me', `2026-12-${String(d).padStart(2, '0')}`, pool)!;
      expect(pool).toContain(p);
      seen.add(p);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
  it('연속 해결은 마지막으로 해결한 날이 오늘이나 어제일 때만 이어져요', () => {
    expect(shownStreak(3, '2026-11-19', '2026-11-19')).toBe(3);
    expect(shownStreak(3, '2026-11-18', '2026-11-19')).toBe(3);
    expect(shownStreak(3, '2026-11-17', '2026-11-19')).toBe(0);
    expect(shownStreak(0, null, '2026-11-19')).toBe(0);
  });
  it('오늘의 판은 섞인 판이고 힌트 없이 재수사 규칙이에요', () => {
    const def = escCase(FREE.id, dailyVariant('2026-11-19'))!;
    const s = startEscape(def, true, '2026-11-19');
    expect([s.re, s.daily, s.vr]).toEqual([1, '2026-11-19', dailyVariant('2026-11-19')]);
    expect(actEscape(def, s, { a: 'hint' })).toBeNull();
  });
});

describe('오늘의 사건 DB', () => {
  it('사건을 해결하기 전에는 못 해요', async () => {
    const { db } = database();
    expect((await dailyInfo(db, 'me', T0))!.caseId).toBeNull();
    expect(await beginDaily(db, 'me', T0)).toBeNull();
  });
  it('하루 한 번: 시작하면 이어 하기만 되고, 그만두면 그날은 끝이에요. 다음 날 다시 열려요', async () => {
    const { db, sql } = database();
    solvedIt(sql);
    const id = (await beginDaily(db, 'me', T0))!;
    expect(id).toMatch(/-/);
    expect(await beginDaily(db, 'me', T0)).toBe(id);
    expect((await activeEscape(db, 'me'))!.state.daily).toBe('2026-11-19');
    await quitEscape(db, 'me', id);
    expect(await beginDaily(db, 'me', T0)).toBe('played');
    const info = (await dailyInfo(db, 'me', T0))!;
    expect([info.today?.solved, info.days, info.streak]).toEqual([0, 0, 0]);
    const next = await beginDaily(db, 'me', new Date('2026-11-19T15:00:01Z'));
    expect(next).not.toBe('played');
    expect(next).not.toBeNull();
  });
  it('하던 사건이 있으면 화면에 보이던 판일 때만 덮어요', async () => {
    const { db, sql } = database();
    solvedIt(sql);
    const other = (await beginEscape(db, 'me', ESCAPE_CASES[0]!.id))!;
    expect(await beginDaily(db, 'me', T0)).toBeNull();
    expect(await beginDaily(db, 'me', T0, { id: other, rev: 99 })).toBeNull();
    const id = (await beginDaily(db, 'me', T0, { id: other, rev: 0 }))!;
    expect(id).not.toBe(other);
    expect((await getEscape(db, 'me', other))!.row.status).toBe('quit');
  });
  it('해결하면 그날 줄에 시간·무결점이 남고, 보상·재수사 기록은 없어요', async () => {
    const { db, sql } = database();
    solvedIt(sql);
    const id = (await beginDaily(db, 'me', T0))!;
    const run = (await getEscape(db, 'me', id))!;
    expect(run.def.solution).toBeTruthy();
    const steps = run.def.solution!;
    for (const [i, a] of steps.entries()) expect(await actEscapeRun(db, 'me', id, i, a, new Date(T0.getTime() + 125_000))).toBe('ok');
    const row = (await getEscape(db, 'me', id))!.row;
    expect([row.status, row.grade, row.xp, row.jelly]).toEqual(['done', null, 0, 0]);
    const info = (await dailyInfo(db, 'me', T0))!;
    expect(info.today).toMatchObject({ solved: 1, secs: 125, flawless: 1 });
    expect((await getEscape(db, 'me', id))!.state.daily).toBe('2026-11-19');
    expect([info.days, info.streak]).toEqual([1, 1]);
    expect((await reRecord(db, 'me')).size).toBe(0);
    expect(await beginDaily(db, 'me', T0)).toBe('played');
  });
  it('해결한 날 수와 연속은 날마다 쌓이고, 하루 건너뛰면 연속이 1부터 다시예요', async () => {
    const { db, sql } = database();
    solvedIt(sql);
    const clear = async (at: Date) => {
      const id = (await beginDaily(db, 'me', at)) as string;
      const run = (await getEscape(db, 'me', id))!;
      for (const [i, a] of run.def.solution!.entries()) expect(await actEscapeRun(db, 'me', id, i, a, at)).toBe('ok');
    };
    const day = (n: number) => new Date(Date.UTC(2026, 10, 19 + n, 3));
    await clear(day(0));
    await clear(day(1));
    let info = (await dailyInfo(db, 'me', day(1)))!;
    expect([info.days, info.streak]).toEqual([2, 2]);
    expect((await dailyInfo(db, 'me', day(2)))!.streak).toBe(2); // 오늘 아직 안 했어도 어제까지 이어져요
    expect((await dailyInfo(db, 'me', day(3)))!.streak).toBe(0); // 하루 건너뜀
    await clear(day(3));
    info = (await dailyInfo(db, 'me', day(3)))!;
    expect([info.days, info.streak]).toEqual([3, 1]);
  });
  it('옛 화면(어제 날짜, 다른 사건)으로는 시작하지 않아요', async () => {
    const { db, sql } = database();
    solvedIt(sql);
    expect(await beginDaily(db, 'me', T0, undefined, { day: '2026-11-18', caseId: FREE.id })).toBe('stale');
    expect(await beginDaily(db, 'me', T0, undefined, { day: '2026-11-19', caseId: 'nope' })).toBe('stale');
    expect(await activeEscape(db, 'me')).toBeNull();
    expect(await beginDaily(db, 'me', T0, undefined, { day: '2026-11-19', caseId: FREE.id })).toMatch(/-/);
  });
  it('오늘의 사건을 하다가 같은 사건 재수사를 고르면 새 재수사 판이에요', async () => {
    const { db, sql } = database();
    solvedIt(sql);
    const daily = (await beginDaily(db, 'me', T0))!;
    const going = (await activeEscape(db, 'me'))!;
    const re = (await beginEscape(db, 'me', FREE.id, T0, { id: daily, rev: going.row.rev }, true))!;
    expect(re).not.toBe(daily);
    const now = (await activeEscape(db, 'me'))!;
    expect([now.state.re, now.state.daily]).toEqual([1, undefined]);
  });
  it('떠난 멤버는 시작할 수 없어요', async () => {
    const { db, sql } = database();
    sql.prepare("INSERT INTO escape_rewards (user_id, case_id, run_id, claimed_at) VALUES ('gone', ?, 'r', 'x')").run(FREE.id);
    expect(await beginDaily(db, 'gone', T0)).toBeNull();
  });
});
