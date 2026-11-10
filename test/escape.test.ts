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

// 만든 사건은 모범 풀이로, 손으로 만든 사건은 차례로 눌러 보는 풀이로 풀어요.
function play(c: EscCase): { s: EscState; steps: EscAction[] } {
  if (!c.solution) return solve(c);
  let s = startEscape(c);
  for (const a of c.solution) {
    const next = actEscape(c, s, a);
    expect(next, `${c.id} ${JSON.stringify(a)}`).not.toBeNull();
    s = next!;
    expect(s.mistakes, `${c.id} ${JSON.stringify(a)} ${s.msg}`).toBe(0);
  }
  return { s, steps: c.solution };
}

describe('사건파일 방탈출 내용', () => {
  it('사건이 50개예요', () => {
    expect(ESCAPE_CASES).toHaveLength(50);
    expect(new Set(ESCAPE_CASES.map((c) => c.id)).size).toBe(50);
  });
  it.each(ESCAPE_CASES.map((c) => [c.id, c] as const))('%s: 실수 없이 끝까지 풀리고 S등급', (_, c) => {
    const { s } = play(c);
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
        for (const k of [o.clue ?? []].flat()) expect(c.clues[k], `${c.id}.${o.id}.clue`).toBeTruthy();
        if (o.lock?.kind === 'item') expect(c.items[o.lock.item]).toBeTruthy();
        if (o.lock) expect(o.openText).toBeTruthy();
        for (const r of o.reveals ?? []) expect(ids.has(r)).toBe(true);
        if (o.goto) expect(c.scenes.some((x) => x.id === o.goto)).toBe(true);
        expect(c.scenes.some((x) => x.id === o.scene)).toBe(true);
      }
      for (const n of c.question.needs) expect(c.clues[n]).toBeTruthy();
      expect(c.question.options[c.question.correct]).toBeTruthy();
      for (const q of c.more ?? []) expect(q.options[q.correct]).toBeTruthy();
      for (const k of c.combos ?? []) for (const i of [k.a, k.b, k.out]) expect(c.items[i], `${c.id} combo ${i}`).toBeTruthy();
      // 한 방에 물건이 너무 많으면 겹쳐 보여요
      for (const sc of c.scenes) expect(c.objects.filter((o) => o.scene === sc.id).length, `${c.id} ${sc.id}`).toBeLessThanOrEqual(15);
      // 같은 방 같은 자리에 두 물건이 겹치지 않아요
      for (const sc of c.scenes) {
        const spots = c.objects.filter((o) => o.scene === sc.id).map((o) => `${o.x},${o.y}`);
        expect(new Set(spots).size, `${c.id} ${sc.id} 겹침`).toBe(spots.length);
      }
    }
  });
  it('만든 사건: 용의자 특징 단서 세 개를 모두 맞춰야 범인이 한 명 남아요', () => {
    for (const c of ESCAPE_CASES.filter((x) => x.solution)) {
      const file = c.objects.find((o) => o.id === 'file')!.look.split('\n').slice(1);
      expect(file).toHaveLength(4);
      // 단서 문장 끝 "범인은 …다." 의 핵심어가 특징표에 있는 사람만 남겨요
      const keys = ['ev1', 'ev2', 'ev3'].map((k) => c.clues[k]!);
      const match = (line: string, ev: string) => {
        const pairs: [string, string][] = [['왼손', '왼손잡이'], ['오른손', '오른손잡이'], ['운동화를', '운동화'], ['구두를', '구두'], ['키가 크', '키가 큼'], ['키가 작', '키가 작음'], ['박하', '박하 향'], ['바닐라', '바닐라 향'], ['고양이를', '고양이를 키움'], ['강아지를', '강아지를 키움'], ['머리가 길', '긴 머리'], ['머리가 짧', '짧은 머리'], ['파란 펜', '파란 펜'], ['빨간 펜', '빨간 펜'], ['커피를', '커피파'], ['녹차를', '녹차파']];
        const p = pairs.find(([e]) => ev.split('범인은')[1]!.includes(e))!;
        expect(p, ev).toBeTruthy();
        return line.includes(p[1]);
      };
      const left = (n: number) => file.filter((l) => keys.slice(0, n).every((ev) => match(l, ev)));
      expect(left(1).length).toBeGreaterThan(1);
      expect(left(2).length).toBeGreaterThan(1);
      expect(left(3)).toHaveLength(1);
      expect(left(3)[0]).toContain(c.question.options[c.question.correct]!.split(' (')[0]);
    }
  });
  it('만든 사건: 퍼즐 종류가 사건마다 섞여 있어요', () => {
    const kinds = (c: EscCase) => new Set(c.objects.map((o) => o.id.replace(/\d+$/, '')).filter((k) => ['mm', 'cntn', 'col', 'alg', 'let', 'clkn', 'lmpn'].includes(k)));
    const all = new Set(ESCAPE_CASES.filter((c) => c.solution).flatMap((c) => [...kinds(c)]));
    expect(all.size).toBe(7);
    for (const c of ESCAPE_CASES.filter((x) => x.solution)) expect(kinds(c).size, c.id).toBeGreaterThanOrEqual(3);
  });
  it('합치기: 맞는 짝은 도구가 되고, 안 맞는 짝은 실수예요', () => {
    const c = ESCAPE_CASES.find((x) => x.combos)!;
    const s = { ...startEscape(c), inv: ['partA', 'partB', 'key12'] };
    expect(actEscape(c, s, { a: 'combine', i: 'partA', j: 'partA' })).toBeNull();
    expect(actEscape(c, s, { a: 'combine', i: 'partA', j: 'nope' })).toBeNull();
    expect(actEscape(c, s, { a: 'combine', i: 'partA', j: 'key12' })!.mistakes).toBe(1);
    expect(actEscape(c, s, { a: 'combine', i: 'partB', j: 'partA' })!.inv).toEqual(['key12', 'tool']);
  });
  it('세 질문 중 하나라도 틀리면 몇 개 맞았는지만 알려 줘요', () => {
    const c = ESCAPE_CASES.find((x) => x.solution)!;
    let s = startEscape(c);
    const sol = c.solution!;
    for (const a of sol.slice(0, -1)) s = actEscape(c, s, a)!;
    const right = sol.at(-1) as Extract<EscAction, { a: 'answer' }>;
    expect(actEscape(c, s, { a: 'answer', n: right.n })).toBeNull(); // 세 개 다 골라야 해요
    const wrong = actEscape(c, s, { a: 'answer', n: right.n, m: [right.m![0]!, (right.m![1]! + 1) % 3] })!;
    expect(wrong.done).toBe(false);
    expect(wrong.msg).toContain('3개 중 2개');
    expect(actEscape(c, wrong, right)!.done).toBe(true);
  });
  it('글자 암호는 띄어쓰기와 상관없이 맞아요', () => {
    const c = ESCAPE_CASES.find((x) => x.objects.some((o) => o.lock?.kind === 'code' && !/^\d+$/.test(o.lock.code)))!;
    const o = c.objects.find((x) => x.lock?.kind === 'code' && !/^\d+$/.test(x.lock.code))!;
    const code = (o.lock as { code: string }).code;
    const s = { ...startEscape(c), scene: o.scene, shown: [] };
    const r = actEscape(c, s, { a: 'code', o: o.id, v: ` ${[...code].join(' ')} ` })!;
    expect(r.opened).toContain(o.id);
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
