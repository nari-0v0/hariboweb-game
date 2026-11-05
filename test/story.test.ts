import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceStory, optionReason, startLegacyStory as startStory, type StoryState } from '../src/story';
import { REGIONS, STORY_CASES, STORY_EVENTS, meets, storyEvent, type Mark } from '../src/story-content';
import { actStory, activeStory, beginStory, decodeStory, getStory, storyMarks } from '../src/story-db';
import { accuse, currentCase, lookAt, startCase, caseRecord } from '../src/cases-db';
import { act, currentRun, startRun, myRecord } from '../src/expedition-db';
import { visibleOptions, eventById } from '../src/expedition';

function database() {
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(process.cwd(), 'migrations')).filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(join(process.cwd(), 'migrations', f), 'utf8'));
  let failAt = -1;
  const statement = (query: string, args: unknown[] = []) => ({ query, args,
    bind: (...a: unknown[]) => statement(query, a),
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    first: async () => sql.prepare(query).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
  });
  const db = { prepare: (q: string) => statement(q), batch: async (list: ReturnType<typeof statement>[]) => {
    sql.exec('BEGIN');
    try {
      const out = list.map((s, i) => {
        if (i === failAt) throw new Error('injected_failure');
        return /^\s*SELECT/i.test(s.query) ? { results: sql.prepare(s.query).all(...s.args), meta: { changes: 0 } } : { results: [], meta: { changes: Number(sql.prepare(s.query).run(...s.args).changes) } };
      });
      sql.exec('COMMIT'); return out;
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
  } } as unknown as D1Database;
  for (const u of ['me', 'friend', 'stranger', 'gone']) sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, ?, 'x')").run(u, u, u === 'gone' ? 0 : 1);
  sql.exec("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES ('me', 'friend', 50, 'x', 'x')");
  return { sql, db, fail: (n: number) => { failAt = n; } };
}
const now = new Date('2026-11-05T03:00:00.000Z');
async function begin(db: D1Database, content = 'jelly500', kind: 'case' | 'expedition' = 'case') {
  const id = crypto.randomUUID();
  expect(await beginStory(db, 'me', kind, content, ['friend'], id)).toBe(id);
  // v1 저장 기록의 회귀 검사. 새 시작 화면은 별도 tactile.test에서 v2로 검증합니다.
  const run = (await getStory(db, 'me', id))!;
  await db.prepare('UPDATE story_runs SET state = ? WHERE id = ?').bind(JSON.stringify(startStory(kind, content, run.state.crew, run.state.marks)), id).run();
  return id;
}
async function take(db: D1Database, id: string, action: 'look' | 'answer' | 'promise' | 'choose' | 'quit', choice: string, date = now) {
  const r = (await getStory(db, 'me', id))!;
  expect(await actStory(db, 'me', id, r.row.revision, { action, choice }, date)).toBe('ok');
  return (await getStory(db, 'me', id))!;
}
async function investigate(db: D1Database, id: string) {
  const r = (await getStory(db, 'me', id))!;
  const def = STORY_CASES.find(c => c.id === r.state.content)!;
  for (const clue of def.clues.filter(c => meets(r.state.marks, c.need))) await take(db, id, 'look', clue.id);
  return def;
}
describe('완성 원고의 논리와 실제 분기', () => {
  it('요청한 6사건과 3지역/18이벤트가 중복 없이 존재하고 기본 경로가 모두 완결된다', () => {
    expect(STORY_CASES).toHaveLength(6); expect(REGIONS).toHaveLength(3); expect(STORY_EVENTS).toHaveLength(18);
    expect(new Set(STORY_EVENTS.map(e => e.id)).size).toBe(18);
    const reached = new Set<string>();
    const walk = (s: StoryState) => {
      if (s.phase === 'done') { expect(s.ending).toBeTruthy(); return; }
      const ev = storyEvent(s.route[s.position]!)!; expect(ev).toBeTruthy(); reached.add(ev.id);
      const allowed = ev.options.map((o, i) => ({ o, i })).filter(({ o }) => !optionReason(s, o));
      expect(allowed.length).toBeGreaterThan(0);
      for (const { i } of allowed) {
        const out = advanceStory(s, { action: 'choose', choice: String(i) }); expect(out).toBeTruthy();
        expect(out!.state.hp).toBeGreaterThanOrEqual(0); expect(out!.state.tools).toBeGreaterThanOrEqual(0);
        expect(out!.state.time).toBeGreaterThan(s.time); walk(out!.state);
      }
    };
    for (const r of REGIONS) walk(startStory('expedition', r.id, [], {}));
    expect(reached.size).toBe(18);
  });
  it('암호는 기준 △○□와 지시 231로 ○□△만 정답이며 현장과 사건의 근거가 같다', () => {
    const c = STORY_CASES.find(c => c.id === 'explorer')!;
    expect(c.answers[c.correct]).toBe('○ → □ → △');
    expect(c.clues.find(c => c.id === 'note')!.text).toContain('○→□→△');
    expect(storyEvent('symbols')!.intro).toContain('△ ○ □');
    let s = startStory('case', c.id, [], {});
    expect(advanceStory(s, { action: 'answer', choice: '1' })).toBeNull();
    for (const id of c.evidence) s = advanceStory(s, { action: 'look', choice: id })!.state;
    const wrong = advanceStory(s, { action: 'answer', choice: '0' })!;
    expect(wrong.state.phase).toBe('play'); expect(wrong.grants).toEqual({});
    const right = advanceStory(wrong.state, { action: 'answer', choice: '1' })!;
    expect(right.state.ending).toBe('solved'); expect(right.grants.starCode).toBe('1');
  });
  it('최초 조사 순서·열쇠·편지·지도·정령 선택이 플레이 내용에 반영된다', () => {
    let s = startStory('case', 'crown027', [], {});
    expect(advanceStory(s, { action: 'look', choice: 'history' })).toBeNull();
    s = advanceStory(s, { action: 'look', choice: 'serial' })!.state;
    expect(advanceStory(s, { action: 'look', choice: 'history' })!.grants.crownHistory).toBe('1');
    expect(optionReason(startStory('expedition', 'mist', [], {}), storyEvent('chest')!.options[3]!)).toBeTruthy();
    expect(optionReason(startStory('expedition', 'mist', [], { rustyKey: '1' }), storyEvent('chest')!.options[3]!)).toBeNull();
    s = startStory('case', 'explorer', [], { sealedLetter: '1', fakeMap: '1' });
    expect(advanceStory(s, { action: 'look', choice: 'letter' })!.grants.explorerTruth).toBe('1');
    expect(advanceStory(s, { action: 'look', choice: 'map' })!.grants.mapTruth).toBe('1');
    s = startStory('expedition', 'village', [], { starCrystal: '1', spiritHelp: '1' });
    s.position = 5;
    // 지난 원정의 동행 효과는 초기화되고 이번 원정에서 도움이나 밧줄이 필요해요.
    expect(optionReason(s, storyEvent('stargate')!.options[2]!)).toBeTruthy();
    s.marks.rescueRope = '1';
    expect(advanceStory(s, { action: 'choose', choice: '2' })!.state.ending).toBe('hidden');
  });
  it('지름길과 석상 경보는 다음 장면 자원에 반영되고 다음 판에는 초기화된다', () => {
    let s = startStory('expedition', 'mist', [], {});
    s = advanceStory(s, { action: 'choose', choice: '2' })!.state;
    s = advanceStory(s, { action: 'choose', choice: '0' })!.state;
    expect(s.hp).toBe(7);
    expect(startStory('expedition', 'mist', [], s.marks).marks.shortcut).toBeUndefined();
    s = startStory('expedition', 'ruins', [], {}); s.position = 2;
    s = advanceStory(s, { action: 'choose', choice: '1' })!.state;
    s = advanceStory(s, { action: 'choose', choice: '0' })!.state;
    expect(s.time).toBe(3); expect(s.hp).toBe(6);
  });
  it('모래시계는 다음 장면만 바꾸며 시간·도구 부족·역할 조건은 서버에서도 거부한다', () => {
    let s = startStory('expedition', 'ruins', [], {}); s.position = 4; s.journal = ['이전 기록'];
    const next = advanceStory(s, { action: 'choose', choice: '0' })!.state;
    expect(next.route[5]).toBe('signal'); expect(next.journal[0]).toBe('이전 기록');
    s.tools = 0; s.position = 3;
    expect(advanceStory(s, { action: 'choose', choice: '2' })).toBeNull();
    s = startStory('expedition', 'mist', [], {}); s.position = 4;
    expect(advanceStory(s, { action: 'choose', choice: '1' })).toBeNull();
    s.time = 9;
    const end = advanceStory(s, { action: 'choose', choice: '2' })!;
    expect(end.state.ending).toBe('escape'); expect(end.state.correct).toBe(false);
    s = startStory('expedition', 'village', [], { timeShard: '1', rescueRope: '1' }); s.position = 5; s.time = 8;
    expect(advanceStory(s, { action: 'choose', choice: '3' })!.state.ending).toBe('escape');
    s.time = 7;
    expect(advanceStory(s, { action: 'choose', choice: '3' })!.grants.nextDestination).toBe('1');
  });
});

describe('D1 원자성·한도·인증 범위', () => {
  it('수집한 현재 멤버와 견습으로만 시작하며 시작 재전송·동시 시작은 한 판이다', async () => {
    const { db, sql } = database();
    for (const ids of [['stranger'], ['gone'], ['friend', 'friend'], ['me', 'friend', 'stranger', 'gone']]) expect(await beginStory(db, 'me', 'case', 'jelly500', ids, crypto.randomUUID())).toBeNull();
    const request = crypto.randomUUID();
    const both = await Promise.all([beginStory(db, 'me', 'case', 'jelly500', ['friend'], request), beginStory(db, 'me', 'case', 'jelly500', [], crypto.randomUUID())]);
    expect(new Set(both).size).toBe(1);
    expect(await beginStory(db, 'me', 'case', 'jelly500', ['friend'], request)).toBe(both[0]);
    expect(sql.prepare('SELECT COUNT(*) n FROM story_runs').get()).toEqual({ n: 1 });
    const r = (await activeStory(db, 'me', 'case'))!;
    expect(r.state.crew.filter(c => c.id).map(c => c.id)).toEqual(['friend']);
    expect(r.state.crew).toHaveLength(3);
    expect(await getStory(db, 'stranger', r.row.id)).toBeNull();
    expect(await actStory(db, 'stranger', r.row.id, 0, { action: 'look', choice: 'receipt' })).toBe('stale');
  });
  it('동시 최종 선택과 응답 유실 재전송은 경험치/젤리/최초 보상을 한 번만 준다', async () => {
    const { db, sql } = database(); const id = await begin(db); await investigate(db, id);
    const r = (await getStory(db, 'me', id))!;
    const args = { action: 'answer', choice: '1' } as const;
    const responses = await Promise.all([actStory(db, 'me', id, r.row.revision, args, now), actStory(db, 'me', id, r.row.revision, args, now)]);
    expect(responses.sort()).toEqual(['ok', 'stale']);
    expect(await actStory(db, 'me', id, r.row.revision, args, now)).toBe('stale');
    expect(sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get('me')).toEqual({ solo_xp: 10, dogam_jelly: 1 });
    expect(sql.prepare('SELECT COUNT(*) n FROM story_rewards').get()).toEqual({ n: 1 });
    const second = await begin(db); await investigate(db, second); await take(db, second, 'answer', '1');
    expect((await getStory(db, 'me', second))!.row.xp).toBe(0);
    expect(sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get('me')).toEqual({ solo_xp: 10, dogam_jelly: 1 });
  });
  it('중간 저장·보상 지급 실패는 모두 롤백되고 같은 화면에서 재시도할 수 있다', async () => {
    const { db, sql, fail } = database(); const id = await begin(db);
    fail(1); await expect(take(db, id, 'look', 'promise')).rejects.toThrow('injected_failure');
    expect((await getStory(db, 'me', id))!.row.revision).toBe(0);
    expect(await storyMarks(db, 'me')).toEqual({}); fail(-1);
    await investigate(db, id); const before = (await getStory(db, 'me', id))!.row.revision;
    fail(3); await expect(take(db, id, 'answer', '1')).rejects.toThrow('injected_failure');
    expect((await getStory(db, 'me', id))!.row.revision).toBe(before);
    expect(sql.prepare('SELECT COUNT(*) n FROM story_rewards').get()).toEqual({ n: 0 });
    expect(sql.prepare('SELECT COUNT(*) n FROM profiles').get()).toEqual({ n: 0 });
    fail(-1); await take(db, id, 'answer', '1');
    expect((await getStory(db, 'me', id))!.row.xp).toBe(10);
  });
  it('기존 추리와 새 사건은 양방향으로 하루 3판 한도를 공유하고 KST 자정에 새 한도가 열린다', async () => {
    const { db, sql } = database();
    const before = new Date('2026-11-05T14:59:59.999Z'), after = new Date('2026-11-05T15:00:00.000Z');
    const legacy = async (date: Date) => {
      await startCase(db, 'me', 'jelly'); const r = (await currentCase(db, 'me'))!;
      await lookAt(db, 'me', r.row.id, 0, 0);
      await accuse(db, 'me', r.row.id, 1, { culprit: r.puzzle.culprit, method: r.puzzle.method, motive: r.puzzle.motive }, date);
    };
    await legacy(before); await legacy(before);
    let id = await begin(db); await investigate(db, id); await take(db, id, 'answer', '1', before);
    expect((await getStory(db, 'me', id))!.row.xp).toBe(10);
    await legacy(before);
    expect(sql.prepare("SELECT xp FROM case_runs ORDER BY rowid DESC LIMIT 1").get()).toEqual({ xp: 0 });
    id = await begin(db, 'bell0213'); await investigate(db, id); await take(db, id, 'answer', '1', before);
    expect((await getStory(db, 'me', id))!.row.xp).toBe(0);
    expect(sql.prepare("SELECT COUNT(*) n FROM story_rewards WHERE content_id = 'bell0213'").get()).toEqual({ n: 0 });
    id = await begin(db, 'bell0213'); await investigate(db, id); await take(db, id, 'answer', '1', after);
    expect((await getStory(db, 'me', id))!.row.xp).toBe(10);
    expect((await caseRecord(db, 'me', after)).today).toBe(1);
    expect(sql.prepare('SELECT dogam_jelly, solo_xp FROM profiles WHERE user_id = ?').get('me')).toEqual({ dogam_jelly: 4, solo_xp: 40 });
  });
  it('원정의 한도도 기존 원정과 공유하며 종료 시각의 시즌을 반열린 구간으로 기록한다', async () => {
    const { db, sql } = database();
    sql.exec("INSERT INTO seasons VALUES ('old', '2026-10-20T15:00:00.000Z', '2026-11-05T15:00:00.000Z', 'x'), ('new', '2026-11-05T15:00:00.000Z', '2026-11-19T15:00:00.000Z', 'x')");
    const date = new Date('2026-11-05T15:00:00.000Z');
    for (let n = 0; n < 3; n++) {
      await startRun(db, 'me', []);
      for (let turn = 0; turn < 50; turn++) {
        const r = await currentRun(db, 'me'); if (!r) break;
        const opts = r.state.event ? visibleOptions(eventById(r.state.event)!, r.crew, r.state).filter(o => o.ok) : [];
        const choice = r.state.phase === 'path' ? 0 : opts.find(o => o.opt.win.end === 'retreat')?.index ?? opts[0]!.index;
        await act(db, 'me', r.row.id, r.choices.length, choice, date);
      }
    }
    expect((await myRecord(db, 'me', date)).today).toBe(3);
    const id = await begin(db, 'mist', 'expedition');
    for (const c of ['1', '0', '1', '0', '2', '1']) await take(db, id, 'choose', c, date);
    const r = (await getStory(db, 'me', id))!;
    expect(r.state.ending).toBe('rescue'); expect(r.row.xp).toBe(0); expect(r.row.season_id).toBe('new');
    expect((await storyMarks(db, 'me')).rescued).toBe('1');
  });
  it('정령 선택·발견은 다음 판과 시즌에도 남고 종료·탈퇴·손상 데이터는 안전하게 처리한다', async () => {
    const { db, sql } = database(); const id = await begin(db, 'mirror'); await investigate(db, id);
    await take(db, id, 'answer', '1'); expect((await getStory(db, 'me', id))!.state.phase).toBe('epilogue');
    await take(db, id, 'promise', 'befriend'); expect((await storyMarks(db, 'me')).spirit).toBe('befriend');
    const next = await begin(db, 'village', 'expedition');
    expect((await getStory(db, 'me', next))!.state.marks.spirit).toBe('befriend');
    sql.exec("UPDATE members SET active = 0 WHERE user_id = 'me'");
    expect(await actStory(db, 'me', next, 0, { action: 'choose', choice: '1' })).toBe('stale');
    sql.exec("UPDATE members SET active = 1 WHERE user_id = 'me'");
    await take(db, next, 'quit', ''); expect((await getStory(db, 'me', next))!.row.xp).toBe(0);
    expect(decodeStory({ ...(await getStory(db, 'me', next))!.row, state: '{}' })).toBeNull();
    expect(decodeStory({ ...(await getStory(db, 'me', next))!.row, state: 'bad json' })).toBeNull();
  });
  it('새 원정도 안전 귀환에서는 기존 원정과 같이 경험치만 지급하고 젤리는 지급하지 않는다', async () => {
    const { db, sql } = database(); const id = await begin(db, 'mist', 'expedition');
    for (const c of ['1', '0', '1', '0', '2', '2']) await take(db, id, 'choose', c);
    expect((await getStory(db, 'me', id))!.state.ending).toBe('return');
    expect(sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get('me')).toEqual({ solo_xp: 10, dogam_jelly: 0 });
  });
});
