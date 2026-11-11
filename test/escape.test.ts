import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESCAPE_CASES, escCase, actEscape, canAnswer, escGrade, isLocked, startEscape, visible, type EscAction, type EscCase, type EscState } from '../src/escape';
import { actEscapeRun, activeEscape, beginEscape, escapeRecord, getEscape, quitEscape } from '../src/escape-db';
import { checkUi } from '../src/escape-ui';

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
  it("사건이 51개예요", () => {
    expect(ESCAPE_CASES).toHaveLength(51);
    expect(new Set(ESCAPE_CASES.map((c) => c.id)).size).toBe(51);
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
    for (const c of ESCAPE_CASES.filter((x) => x.solution && !x.id.endsWith("-talk"))) {
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
  it('만든 사건: 은행 235문제를 한 번씩만 쓰고, 한 사건 안에서는 조작·내는 방식이 겹치지 않아요', async () => {
    const { BANK } = await import('../src/escape-bank');
    const made = ESCAPE_CASES.filter((c) => (c.level ?? 1) > 1 && !c.id.includes('-talk'));
    expect(made.length).toBe(47);
    expect(BANK.length).toBe(235);
    expect(new Set(BANK.map((b) => b.idea)).size).toBe(BANK.length);
    const nos = made.flatMap((c) => c.objects.flatMap((o) => o.ref ?? []));
    expect(nos.length).toBe(235);
    expect(new Set(nos).size).toBe(235);
    const cards = made.flatMap((c) => c.objects.filter((o) => o.id.startsWith('rdn')).map((o) => o.look.split('\n')[1]));
    expect(new Set(cards).size).toBe(cards.length);
    for (const c of made) expect(new Set(c.formats).size, `${c.id} ${c.formats}`).toBe(5);
    const all = new Set(made.flatMap((c) => c.formats!));
    expect(all.size).toBeGreaterThanOrEqual(20);
  });
  it('수수께끼 은행: 장치는 모범 풀이로 풀리고, 고르기 답은 보기 안에 있어요', async () => {
    const { BANK } = await import('../src/escape-bank');
    for (const b of BANK) {
      if (b.kind === 'ui') expect(checkUi(b.ui!, b.a!), b.idea).toBe(true);
      if (b.kind === 'ui') expect(checkUi(b.ui!, ''), b.idea).toBe(false);
      if (b.kind === 'order') expect([...b.a!].sort().join(''), b.idea).toBe(b.names!.map((_, i) => i + 1).join(''));
      if (b.kind !== 'text') continue;
      if (b.choices) expect(b.choices, b.idea).toContain(b.a);
      else expect(b.a!.replace(/\s/g, '').length, b.idea).toBeLessThanOrEqual(/^[0-9]+$/.test(b.a!) ? 8 : 12);
    }
  });
  it('장치 답: 규칙에 안 맞는 움직임은 실수, 맞으면 열려요', () => {
    const c = ESCAPE_CASES.find((x) => x.objects.some((o) => o.lock?.kind === 'code' && o.lock.ui?.t === 'pour'))!;
    const o = c.objects.find((x) => x.lock?.kind === 'code' && x.lock.ui?.t === 'pour')!;
    const lk = o.lock as { code: string };
    let s = startEscape(c);
    for (const a of c.solution!) {
      if (a.a === 'code' && a.o === o.id) break;
      s = actEscape(c, s, a)!;
    }
    expect(actEscape(c, s, { a: 'code', o: o.id, v: '01' })!.mistakes).toBe(s.mistakes + 1);
    expect(actEscape(c, s, { a: 'code', o: o.id, v: lk.code })!.opened).toContain(o.id);
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
  const c = escCase('jellyjar')!;
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
  const c = escCase('jellyjar')!;
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

describe('사건파일 퍼즐 게임 방식', () => {
  it('방마다 숨은 힌트 동전 2개는 물건과 겹치지 않고, 한 번만 주워요', async () => {
    const { coinSpots, coinsLeft } = await import('../src/escape');
    const { ROOMS } = await import('../src/case-rooms');
    for (const c of ESCAPE_CASES)
      for (const sc of c.scenes) {
        const spots = coinSpots(c, sc.id);
        expect(spots.length, `${c.id}/${sc.id}`).toBe(2);
        for (const p of spots) for (const o of c.objects.filter((x) => x.scene === sc.id)) expect(Math.abs(o.x - p.x) >= 13 || Math.abs(o.y - p.y) >= 17).toBe(true);
        const room = ROOMS[sc.bg ?? 'office'];
        for (const p of spots) for (const h of room.spots) expect(Math.abs(h.x - p.x) >= h.w / 2 || Math.abs(h.y - p.y) >= h.h / 2, `${c.id}/${sc.id} 동전이 ${h.id} 위`).toBe(true);
      }
    const c = escCase('jellyjar')!;
    const s1 = actEscape(c, startEscape(c), { a: 'coin', k: 0 })!;
    expect(s1.fx).toBe('coin');
    expect(coinsLeft(s1)).toBe(1);
    expect(actEscape(c, s1, { a: 'coin', k: 0 })).toBeNull();
    expect(actEscape(c, s1, { a: 'coin', k: 5 })).toBeNull();
    // 동전으로 본 힌트는 등급에 안 들어가요
    const s2 = actEscape(c, s1, { a: 'hint' })!;
    expect([s2.hints, s2.spent, coinsLeft(s2)]).toEqual([0, 1, 0]);
    // 같은 힌트를 다시 보면 감점 없어요(이미 본 힌트는 계속 보여요)
    const s3 = actEscape(c, s2, { a: 'hint' })!;
    expect(s3.hints).toBe(0);
    expect(s3.fx).toBeUndefined();
  });
  it('비밀번호 정답·오답과 여는 순간을 화면에 알려 줘요', async () => {
    const { puzzleNo } = await import('../src/escape');
    const c = ESCAPE_CASES.find((x) => x.id === 'jellyjar')!;
    expect(puzzleNo(c, 'fridge')).toBe(1);
    const s0 = startEscape(c);
    expect(actEscape(c, s0, { a: 'code', o: 'fridge', v: '1111' })!.fx).toBe('wrong');
    expect(actEscape(c, s0, { a: 'code', o: 'fridge', v: '0340' })!.fx).toBe('right');
    const withKey = actEscape(c, s0, { a: 'tap', o: 'plant' })!;
    expect(withKey.fx).toBe('gain');
    expect(actEscape(c, withKey, { a: 'use', o: 'drawer', i: 'smallkey' })!.fx).toBe('open');
  });
});

describe('사건파일 그림', () => {
  it('모든 물건이 방 그림 속 자리에 있고, 한 자리엔 하나만 있어요', async () => {
    const { casePics, itemPic } = await import('../src/case-art');
    const { ROOMS } = await import('../src/case-rooms');
    for (const c of ESCAPE_CASES) {
      for (const sc of c.scenes) {
        expect(sc.bg, `${c.id}/${sc.id}`).toBeTruthy();
        const ats = c.objects.filter((o) => o.scene === sc.id && o.at).map((o) => o.at!);
        expect(new Set(ats).size, `${c.id}/${sc.id} 겹침`).toBe(ats.length);
        for (const at of ats) expect(ROOMS[sc.bg!].spots.some((h) => h.id === at), `${c.id}/${sc.id} ${at}`).toBe(true);
      }
      // 자리가 없는 건 돌아가는 문, 사람, 또는 그림이 따로 있는 물건(고양이·오르골)뿐이에요.
      for (const o of c.objects.filter((x) => !x.at && !x.face && !x.goto)) expect(casePics(o.emoji, false, false), `${c.id}/${o.id} ${o.emoji}`).not.toBeNull();
      for (const [k, it] of Object.entries(c.items)) expect(itemPic(it.emoji), `${c.id}/${k} ${it.emoji}`).not.toBeNull();
    }
  });
});

import { zoomTag } from '../src/views/escape';
describe('확대 화면 쪽지', () => {
  it('시각과 적힌 글씨를 뽑아요', () => {
    expect(zoomTag('벽시계가 3시 40분에 멈춰 있어요.')).toBe('3:40');
    expect(zoomTag('시계가 오후 7시 정각에 멈춰 있어요.')).toBe('오후 7:00');
    expect(zoomTag('쪽지에 「냉장고 = 0340」')).toBe('냉장고 = 0340');
    expect(zoomTag('그냥 빗자루예요.')).toBeNull();
  });
});

describe('인물 수수께끼 사건', () => {
  it('모범 풀이로 S 등급, 객관식 오답은 실수로 세요', async () => {
    const { TALK_CASES } = await import('../src/escape-talk');
    const c = TALK_CASES[0]!;
    let s = startEscape(c);
    s = actEscape(c, s, { a: 'code', o: 'door1', v: '목요일' })!;
    expect(s.fx).toBe('wrong');
    let t = startEscape(c);
    for (const a of c.solution!) { const n = actEscape(c, t, a); expect(n, JSON.stringify(a)).not.toBeNull(); t = n!; }
    expect(t.done).toBeTruthy();
    expect(escGrade(t)).toBe('S');
  });
});

describe('힌트 기록', () => {
  it('수수께끼 카드에서 본 힌트는 그 문제 힌트이고, 다시 봐도 감점 없이 계속 남아요', async () => {
    const { TALK_CASES } = await import('../src/escape-talk');
    const c = TALK_CASES[0]!;
    let s = actEscape(c, startEscape(c), { a: 'tap', o: 'door1' })!;
    s = actEscape(c, s, { a: 'hint' })!;
    const k = c.hints.findIndex((h) => h.until === 'door1');
    expect(s.seenHints).toEqual([k]);
    expect(s.focus).toBe('door1');
    expect(s.hints).toBe(1);
    s = actEscape(c, s, { a: 'hint' })!;
    expect(s.hints).toBe(1);
    expect(s.seenHints).toEqual([k]);
  });
});

describe('방 그림 확대', () => {
  it('시계는 멈춘 시각으로 바늘을 돌려요', async () => {
    const { clockTime } = await import('../src/views/escape');
    expect(clockTime('벽시계가 오후 3시 40분에 멈춰 있어요.')).toEqual([3, 40]);
    expect(clockTime('괘종시계가 오후 6시 정각을 가리켜요.')).toEqual([6, 0]);
    expect(clockTime('시계가 오전 12시 5분')).toEqual([0, 5]);
    expect(clockTime('특별한 건 없어요.')).toBeNull();
  });
  it('시계 자리가 있는 방은 시계 판 위치가 그 자리 안에 있어요', async () => {
    const { ROOMS } = await import('../src/case-rooms');
    for (const r of Object.values(ROOMS))
      for (const h of r.spots.filter((x) => x.face)) {
        expect(Math.abs(h.face![0] - h.x), `${r.key}/${h.id}`).toBeLessThan(h.w / 2);
        expect(Math.abs(h.face![1] - h.y), `${r.key}/${h.id}`).toBeLessThan(h.h / 2);
      }
  });
});

describe('방 그림 56장', () => {
  it('그림 파일이 다 있고, 방마다 문·잠긴 곳·서로 다른 수수께끼가 있어요', async () => {
    const { readdirSync } = await import('node:fs');
    const files = new Set(readdirSync('public/case/room'));
    const { ROOMS, ROOM_KEYS, roomByName } = await import('../src/case-rooms');
    expect(ROOM_KEYS.length).toBe(56);
    for (const k of ROOM_KEYS) {
      const r = ROOMS[k];
      expect(files.has(`${k}.webp`), k).toBe(true);
      expect(r.spots.filter((h) => h.tag?.includes('door')).length, `${k} 문`).toBe(1);
      expect(r.spots.filter((h) => h.tag?.includes('lock')).length, `${k} 잠긴 곳`).toBeGreaterThanOrEqual(2);
      const rids = r.spots.flatMap((h) => (h.rid && !h.tag?.includes('lock') ? [h.rid] : []));
      expect(rids.length, `${k} 수수께끼`).toBeGreaterThanOrEqual(3);
      expect(new Set(rids).size, `${k} 같은 답`).toBe(rids.length);
      expect(new Set(r.spots.map((h) => h.id)).size, `${k} 같은 id`).toBe(r.spots.length);
      for (const h of r.spots) {
        expect(h.x - h.w / 2, `${k}/${h.id}`).toBeGreaterThanOrEqual(-1);
        expect(h.x + h.w / 2, `${k}/${h.id}`).toBeLessThanOrEqual(101);
      }
    }
    // 모든 그림이 적어도 한 사건 방 이름에 쓰여요.
    const used = new Set(ESCAPE_CASES.flatMap((c) => c.scenes.map((s) => s.bg)));
    for (const k of ROOM_KEYS) expect(used.has(k), `${k} 안 쓰임`).toBe(true);
    expect(roomByName('편집실')).toBe('newsroom');
  });
});

describe('사건파일 장치 검증(코덱스 검토 반영)', () => {
  it('화면에 보내는 장치 정보에는 정답이 없어요', async () => {
    const { uiForClient } = await import('../src/escape-ui');
    for (const c of ESCAPE_CASES)
      for (const o of c.objects)
        if (o.lock?.kind === 'code' && o.lock.ui) {
          const s = JSON.stringify(uiForClient(o.lock.ui));
          expect(s).not.toContain('"answer"');
          expect(s).not.toContain('"answers"');
        }
  });
  it('답이 둘인 세모 문제는 둘 다 맞고, 왕 길 문제는 대각선 4번 미만이면 틀려요', async () => {
    const { BANK } = await import('../src/escape-bank');
    const tri = BANK.find((b) => b.idea === 'num-triangle')!;
    expect(checkUi(tri.ui!, '531426')).toBe(true);
    expect(checkUi(tri.ui!, '432516')).toBe(true);
    const king = BANK.find((b) => b.idea === 'path-kingcross')!;
    expect(checkUi(king.ui!, '0.1.2.3.6.7.11.10.9.5.4.8.12.13.14.15')).toBe(false);
    expect(checkUi(king.ui!, king.a!)).toBe(true);
  });
});

describe('더 쉬운 힌트', () => {
  it('보통 힌트를 본 수수께끼만, 한 번 값을 내고 정답 일부를 알려 줘요', async () => {
    const { bigHint, coinsLeft } = await import('../src/escape');
    for (const c of ESCAPE_CASES) {
      const o = c.objects.find((x) => x.lock?.kind === 'code' && !x.lock.ui && bigHint(x) && c.hints.some((h) => h.until === x.id) && x.scene === c.scenes[0]!.id && !x.hidden);
      if (!o) continue;
      let s = startEscape(c);
      expect(actEscape(c, s, { a: 'hint2', o: o.id })).toBeNull();
      s = actEscape(c, s, { a: 'tap', o: o.id })!;
      s = actEscape(c, s, { a: 'hint' })!;
      const before = s.hints + (s.spent ?? 0);
      const s2 = actEscape(c, s, { a: 'hint2', o: o.id })!;
      expect(s2.bigHints).toEqual([o.id]);
      expect(s2.hints + (s2.spent ?? 0)).toBe(before + 1);
      const s3 = actEscape(c, s2, { a: 'hint2', o: o.id })!;
      expect(s3.hints + (s3.spent ?? 0)).toBe(before + 1);
      expect(coinsLeft(s3)).toBeGreaterThanOrEqual(0);
      return;
    }
    throw new Error('no case');
  });
  it('보기는 정답을 지우지 않고, 줄 세우기는 진짜 앞자리를 알려 줘요', async () => {
    const { bigHint } = await import('../src/escape');
    for (const c of ESCAPE_CASES)
      for (const o of c.objects) {
        const l = o.lock;
        if (!l || l.kind !== 'code' || l.ui) continue;
        const t = bigHint(o);
        if (l.choices && t) expect(t.includes(`「${l.code}」`), `${c.id}/${o.id}`).toBe(false);
        if (l.order && t) expect(t).toContain(l.order[Number(l.code[0]) - 1]!);
        if (!l.choices && !l.order && t && l.code.length > 1) expect(t).toContain(`「${[...l.code].slice(0, Math.floor([...l.code].length / 2)).join('')}」`);
      }
  });
});
