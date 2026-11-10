import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESCAPE_CASES, actEscape, canAnswer, escGrade, isLocked, startEscape, visible, type EscAction, type EscCase, type EscState } from '../src/escape';
import { actEscapeRun, activeEscape, beginEscape, escapeRecord, getEscape, quitEscape } from '../src/escape-db';

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

describe('사건파일 방탈출 내용', () => {
  it.each(ESCAPE_CASES.map((c) => [c.id, c] as const))('%s: 실수 없이 끝까지 풀리고 S등급', (_, c) => {
    const { s } = solve(c);
    expect(s.done).toBe(true);
    expect(s.mistakes).toBe(0);
    expect(escGrade(s)).toBe('S');
    expect(s.msg).toBe(c.ending);
  });
  it('물건·단서·잠금 참조가 모두 실제로 있어요', () => {
    for (const c of ESCAPE_CASES) {
      const ids = new Set(c.objects.map((o) => o.id));
      expect(ids.size).toBe(c.objects.length);
      for (const o of c.objects) {
        for (const t of o.take ?? []) expect(c.items[t], `${c.id}.${o.id}.take`).toBeTruthy();
        if (o.clue) expect(c.clues[o.clue], `${c.id}.${o.id}.clue`).toBeTruthy();
        if (o.lock?.kind === 'item') expect(c.items[o.lock.item]).toBeTruthy();
        if (o.lock) expect(o.openText).toBeTruthy();
        for (const r of o.reveals ?? []) expect(ids.has(r)).toBe(true);
        if (o.goto) expect(c.scenes.some((x) => x.id === o.goto)).toBe(true);
        expect(c.scenes.some((x) => x.id === o.scene)).toBe(true);
      }
      for (const n of c.question.needs) expect(c.clues[n]).toBeTruthy();
      expect(c.question.options[c.question.correct]).toBeTruthy();
    }
  });
});

describe('사건파일 방탈출 규칙', () => {
  const c = ESCAPE_CASES[0]!;
  it('잠긴 곳은 눌러도 안 열리고, 틀린 비밀번호·물건은 실수로 세요', () => {
    let s = startEscape(c);
    s = actEscape(c, s, { a: 'tap', o: 'fridge' })!;
    expect(s.opened).not.toContain('fridge');
    expect(s.clues).toEqual([]);
    s = actEscape(c, s, { a: 'code', o: 'fridge', v: '1234' })!;
    expect(s.mistakes).toBe(1);
    expect(s.tone).toBe('bad');
    s = actEscape(c, s, { a: 'code', o: 'fridge', v: '0340' })!;
    expect(s.opened).toContain('fridge');
    expect(s.clues).toContain('jar');
    // 가방에 없는 물건은 쓸 수 없어요
    expect(actEscape(c, s, { a: 'use', o: 'drawer', i: 'smallkey' })).toBeNull();
    s = actEscape(c, s, { a: 'tap', o: 'plant' })!;
    expect(s.inv).toEqual(['smallkey']);
    // 같은 물건을 또 눌러도 두 번 얻지 않아요
    s = actEscape(c, s, { a: 'tap', o: 'plant' })!;
    expect(s.inv).toEqual(['smallkey']);
    s = actEscape(c, s, { a: 'use', o: 'drawer', i: 'smallkey' })!;
    expect(s.inv).toEqual(['storagekey', 'flashlight']);
  });
  it('다른 방 물건, 숨은 물건, 이상한 입력은 거절해요', () => {
    const s = startEscape(c);
    expect(actEscape(c, s, { a: 'tap', o: 'boxes' })).toBeNull();
    expect(actEscape(c, s, { a: 'tap', o: 'cat' })).toBeNull();
    expect(actEscape(c, s, { a: 'tap', o: 'nope' })).toBeNull();
    expect(actEscape(c, s, { a: 'code', o: 'fridge', v: 'abc' })).toBeNull();
    expect(actEscape(c, s, { a: 'answer', n: 2 })).toBeNull(); // 단서가 모이기 전에는 답할 수 없어요
  });
  it('잠긴 문은 열기 전엔 못 지나가요', () => {
    let s = startEscape(c);
    s = actEscape(c, s, { a: 'tap', o: 'door1' })!;
    expect(s.scene).toBe('pantry');
  });
  it('힌트는 다음 할 일을 알려 주고 등급에 반영돼요', () => {
    let s = startEscape(c);
    s = actEscape(c, s, { a: 'hint' })!;
    expect(s.msg).toContain('바닥');
    s = actEscape(c, s, { a: 'tap', o: 'plant' })!;
    s = actEscape(c, s, { a: 'hint' })!;
    expect(s.msg).toContain('작은 열쇠');
    expect(s.hints).toBe(2);
    expect(escGrade(s)).toBe('A');
  });
  it('틀린 답은 실수로 세고 다시 고를 수 있어요', () => {
    const { steps } = solve(c);
    let s = startEscape(c);
    for (const a of steps.slice(0, -1)) s = actEscape(c, s, a)!;
    s = actEscape(c, s, { a: 'answer', n: 0 })!;
    expect(s.done).toBe(false);
    expect(s.mistakes).toBe(1);
    s = actEscape(c, s, { a: 'answer', n: c.question.correct })!;
    expect(s.done).toBe(true);
    expect(actEscape(c, s, { a: 'hint' })).toBeNull();
  });
});

describe('사건파일 방탈출 저장과 보상', () => {
  const c = ESCAPE_CASES[0]!;
  async function play(db: D1Database) {
    const id = (await beginEscape(db, 'me', c.id))!;
    const { steps } = solve(c);
    for (const [i, a] of steps.entries()) expect(await actEscapeRun(db, 'me', id, i, a)).toBe('ok');
    return id;
  }
  it('처음 해결하면 한 번만 경험치·젤리, 다시 풀면 보상 없음', async () => {
    const { db, sql } = database();
    const first = await play(db);
    const row = (await getEscape(db, 'me', first))!.row;
    expect(row.status).toBe('done');
    expect(row.grade).toBe('S');
    expect([row.xp, row.jelly]).toEqual([10, 1]);
    expect(sql.prepare("SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = 'me'").get()).toEqual({ solo_xp: 10, dogam_jelly: 1 });
    const again = await play(db);
    expect((await getEscape(db, 'me', again))!.row.xp).toBe(0);
    expect(sql.prepare("SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = 'me'").get()).toEqual({ solo_xp: 10, dogam_jelly: 1 });
    expect((await escapeRecord(db, 'me')).get(c.id)).toBe('S');
  });
  it('옛 화면(순번이 다른 요청)은 반영하지 않아요', async () => {
    const { db } = database();
    const id = (await beginEscape(db, 'me', c.id))!;
    expect(await actEscapeRun(db, 'me', id, 0, { a: 'tap', o: 'plant' })).toBe('ok');
    expect(await actEscapeRun(db, 'me', id, 0, { a: 'tap', o: 'clock' })).toBe('stale');
    expect((await activeEscape(db, 'me'))!.state.seen).toEqual(['plant']);
  });
  it('하던 사건이 있으면 새로 시작하지 않고, 덮으면 새로 시작돼요', async () => {
    const { db } = database();
    const a = await beginEscape(db, 'me', c.id);
    expect(await beginEscape(db, 'me', ESCAPE_CASES[1]!.id)).toBe(a);
    expect(await quitEscape(db, 'me', a!)).toBe(true);
    const b = await beginEscape(db, 'me', ESCAPE_CASES[1]!.id);
    expect(b).not.toBe(a);
    expect((await activeEscape(db, 'me'))!.def.id).toBe(ESCAPE_CASES[1]!.id);
  });
  it('떠난 멤버와 없는 사건은 시작할 수 없어요', async () => {
    const { db } = database();
    expect(await beginEscape(db, 'gone', c.id)).toBeNull();
    expect(await beginEscape(db, 'me', 'nope')).toBeNull();
  });
});
