import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASE_PLAY, connected, newMap, skillReason } from '../src/tactile';
import { advanceStory, startStory, startLegacyStory, type StoryAction, type StoryState } from '../src/story';
import { STORY_CASES, REGIONS, meets } from '../src/story-content';
import type { Crew } from '../src/expedition';
import { actStory, activeStory, beginStory, decodeStory, getStory } from '../src/story-db';
const crew: Crew[] = ['guard', 'scout', 'healer'].map((role, i) => ({ id: null, name: `견습${i}`, art: '/char/deco/explorer.png', role, bonus: 0, cond: 'plain' })) as Crew[];
const go = (s: StoryState, action: StoryAction['action'], choice: string) => {
  const next = advanceStory(s, { action, choice }); expect(next, `${action}: ${choice}`).not.toBeNull(); return next!.state;
};
function prepareCase(id: string) {
  const def = STORY_CASES.find(d => d.id === id)!;
  let s = startStory('case', id, crew, {});
  for (const o of CASE_PLAY[id]!.objects) if (meets(s.marks, def.clues.find(c => c.id === o.clue)!.need)) s = go(s, 'inspect', `${o.clue}|${o.task.solution}`);
  for (let i = 1; i < def.evidence.length; i++) s = go(s, 'connect', `${def.evidence[i - 1]}>${def.evidence[i]}`);
  return s;
}
describe('직접 탐색·복원하는 사건파일', () => {
  it('6개 사건 모두 물건 조사·도구 조작·증거 연결·흐름 복원으로 끝낼 수 있다', () => {
    for (const def of STORY_CASES) {
      let s = prepareCase(def.id);
      expect(s.version).toBe(2);
      s = go(s, 'reconstruct', CASE_PLAY[def.id]!.path.map(p => p.id).join(','));
      if (def.id === 'mirror') { expect(s.phase).toBe('epilogue'); s = go(s, 'promise', 'befriend'); expect(s.marks.spirit).toBe('befriend'); }
      expect(s.phase).toBe('done'); expect(s.ending).toBe('solved');
    }
  });
  it('옛 정답/선택 API로 우회할 수 없고, 조립 오류·미수집 증거·잘못된 연결을 거부한다', () => {
    let s = startStory('case', 'jelly500', crew, {});
    for (const action of ['look', 'answer', 'choose'] as const) expect(advanceStory(s, { action, choice: '1' })).toBeNull();
    expect(advanceStory(s, { action: 'reconstruct', choice: 'warehouse,cart,party' })).toBeNull();
    const untouched = structuredClone(s);
    s = go(s, 'inspect', 'receipt|destination,amount,porter,time'); expect(s.seen).toEqual([]);
    expect(untouched.journal).toEqual([]);
    expect(advanceStory(s, { action: 'connect', choice: 'receipt>boxes' })).toBeNull();
    s = go(s, 'inspect', 'receipt|time,porter,amount,destination'); s = go(s, 'inspect', 'boxes|500');
    expect(advanceStory(s, { action: 'reconstruct', choice: 'warehouse,cart,party' })).toBeNull();
    s = go(s, 'connect', 'boxes>receipt');
    expect(advanceStory(s, { action: 'connect', choice: 'receipt>boxes' })).toBeNull();
    s = go(s, 'reconstruct', 'party,cart,warehouse'); expect(s.phase).toBe('play');
  });
  it('시계 눈금·파형·일련번호·문양은 서버에서 실제 값으로 검증한다', () => {
    let s = startStory('case', 'bell0213', crew, {});
    s = go(s, 'inspect', 'alarm|02:12'); expect(s.seen).not.toContain('alarm');
    s = go(s, 'inspect', 'alarm|02:13'); expect(s.seen).toContain('alarm');
    s = go(s, 'inspect', 'sound|4'); expect(s.seen).not.toContain('sound');
    s = go(s, 'inspect', 'sound|3'); expect(s.seen).toContain('sound');
    s = startStory('case', 'explorer', crew, {});
    s = go(s, 'inspect', 'door|triangle,circle,square'); expect(s.seen).toEqual([]);
    s = go(s, 'inspect', 'door|circle,square,triangle'); expect(s.seen).toContain('door');
  });
});
describe('안개 지도·대원 배치·길 회전', () => {
  const finishMap = (content: string, marks = {}) => {
    let s = startStory('expedition', content, crew, marks);
    const route = content === 'ruins' ? [21, 16, 11, 6, 7, 2] : content === 'village' ? [15, 16, 17, 12, 13, 14] : [15, 10, 11, 12, 7, 2];
    for (const n of route) {
      s = go(s, 'scout', `${n}:0`);
      while (s.interaction?.mode === 'map' && s.interaction.cells[n]!.rotation !== 0) s = go(s, 'rotate', String(n));
      s = go(s, 'survey', String(n));
    }
    return s;
  };
  it('3지역의 18현장을 실제 연결한 길로 발견하고 서로 다른 결말과 기록을 얻는다', () => {
    for (const r of REGIONS) {
      const s = finishMap(r.id, { starCrystal: '1' });
      expect(s.seen).toEqual([...r.events]); expect(s.phase).toBe('done'); expect(s.time).toBe(6);
      expect(s.ending).toBe(r.id === 'mist' ? 'rescue' : r.id === 'village' ? 'hidden' : 'discovery');
    }
    expect(finishMap('mist', { rustyKey: '1' }).marks.mapFragment).toBe('1');
    expect(finishMap('village', { oldInvitation: '1' }).marks.forgottenGift).toBe('1');
    expect(finishMap('ruins').marks.sealedLetter).toBe('1');
  });
  it('고립된 안개·미탐색 회전·미연결 현장·없는 대원으로 진행할 수 없다', () => {
    let s = startStory('expedition', 'mist', crew, {});
    expect(advanceStory(s, { action: 'scout', choice: '0:0' })).toBeNull();
    expect(advanceStory(s, { action: 'scout', choice: '15:4' })).toBeNull();
    expect(advanceStory(s, { action: 'rotate', choice: '15' })).toBeNull();
    expect(advanceStory(s, { action: 'survey', choice: '15' })).toBeNull();
    s = go(s, 'scout', '15:0'); s = go(s, 'survey', '15');
    s = go(s, 'scout', '10:0');
    expect(advanceStory(s, { action: 'survey', choice: '10' })).toBeNull();
    expect(connected(s.interaction as ReturnType<typeof newMap>).has(10)).toBe(false);
    while (s.interaction?.mode === 'map' && s.interaction.cells[10]!.rotation !== 0) s = go(s, 'rotate', '10');
    expect(connected(s.interaction as ReturnType<typeof newMap>).has(10)).toBe(true);
    s = go(s, 'survey', '10'); expect(s.seen).toContain('bag');
  });
  it('회전·재배치는 자원을 반복 지급하지 않고 수집 전 마지막 현장을 완료할 수 없다', () => {
    let s = startStory('expedition', 'mist', crew, {});
    for (const n of [15, 10, 11, 12, 7, 2]) {
      s = go(s, 'scout', `${n}:0`);
      while (s.interaction?.mode === 'map' && s.interaction.cells[n]!.rotation !== 0) s = go(s, 'rotate', String(n));
    }
    s = go(s, 'survey', '2'); expect(s.phase).toBe('play'); expect(s.marks.rescued).toBeUndefined();
    const time = s.time;
    s = go(s, 'scout', '2:1'); expect(s.time).toBe(time);
    s = go(s, 'return', ''); expect(s.ending).toBe('return');
  });
});

function dbFixture() {
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(process.cwd(), 'migrations')).filter(n => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(process.cwd(), 'migrations', f), 'utf8'));
  const stmt = (q: string, args: unknown[] = []) => ({ q, args, bind: (...a: unknown[]) => stmt(q, a), first: async () => sql.prepare(q).get(...args) ?? null, all: async () => ({ results: sql.prepare(q).all(...args) }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...args).changes) } }) });
  let fail = false;
  const db = { prepare: (q: string) => stmt(q), batch: async (list: ReturnType<typeof stmt>[]) => {
    sql.exec('BEGIN'); try {
      const out = list.map((s, i) => { if (fail && i === list.length - 1) throw new Error('fail'); return { meta: { changes: Number(sql.prepare(s.q).run(...s.args).changes) }, results: [] }; }); sql.exec('COMMIT'); return out;
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
  } } as unknown as D1Database;
  sql.exec("INSERT INTO members (user_id, display_name, active, updated_at) VALUES ('me', 'QA', 1, 'x')");
  return { db, sql, inject: (v: boolean) => { fail = v; } };
}
describe('조작형 저장과 보상 보호', () => {
  it('새 판은 v2이며 v1 진행 판을 보상 없이 보존하고 손상된 지도는 거부한다', async () => {
    const { db, sql } = dbFixture(), id = crypto.randomUUID();
    await beginStory(db, 'me', 'expedition', 'mist', [], id);
    const run = (await getStory(db, 'me', id))!; expect(run.state.version).toBe(2);
    const broken = structuredClone(run.state); broken.interaction = { mode: 'map', cells: [], camp: 20, crewAt: [] };
    expect(decodeStory({ ...run.row, state: JSON.stringify(broken) })).toBeNull();
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(startLegacyStory('expedition', 'mist', crew, {})), id);
    expect(await activeStory(db, 'me', 'expedition')).toBeNull();
    expect(sql.prepare('SELECT status, xp FROM story_runs WHERE id = ?').get(id)).toEqual({ status: 'quit', xp: 0 });
  });
  it('최종 복원 동시 제출·유실 응답 재시도·지급 실패에서도 보상은 한 번만 기록된다', async () => {
    const { db, sql, inject } = dbFixture(), id = crypto.randomUUID();
    await beginStory(db, 'me', 'case', 'jelly500', [], id);
    let s = prepareCase('jelly500');
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(s), id);
    const action = { action: 'reconstruct', choice: 'warehouse,cart,party' } as const;
    inject(true); await expect(actStory(db, 'me', id, 0, action)).rejects.toThrow('fail'); inject(false);
    expect((await getStory(db, 'me', id))!.row.revision).toBe(0);
    expect(sql.prepare('SELECT COUNT(*) n FROM story_rewards').get()).toEqual({ n: 0 });
    expect((await Promise.all([actStory(db, 'me', id, 0, action), actStory(db, 'me', id, 0, action)])).sort()).toEqual(['ok', 'stale']);
    expect(await actStory(db, 'me', id, 0, action)).toBe('stale');
    expect(sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get('me')).toEqual({ solo_xp: 10, dogam_jelly: 1 });
    s = (await getStory(db, 'me', id))!.state; expect(s.ending).toBe('solved');
  });
});

describe('대원 특기와 저장 호환성', () => {
  const special = (role: Crew['role']) => startStory('expedition', 'mist', [{ ...crew[0]! }, { ...crew[1]!, role }, { ...crew[2]!, role }], {});
  it('탐색가는 안개를 열지 않고 이웃 지형만 미리 보고 같은 역할의 재사용은 막힌다', () => {
    let s = go(special('scout'), 'scout', '15:0');
    const original = structuredClone(s);
    s = go(s, 'skill', '15:1');
    if (s.interaction?.mode !== 'map' || original.interaction?.mode !== 'map') throw new Error('map');
    expect(s.interaction.cells[10]!.peeked).toBe(true); expect(s.interaction.cells[10]!.revealed).toBe(false);
    expect(original.interaction.cells[10]!.peeked).toBeUndefined();
    expect(s.time).toBe(1); expect(s.seen).toEqual([]);
    expect(advanceStory(s, { action: 'skill', choice: '15:2' })).toBeNull();
  });
  it('기록가는 원형 방향을 남기고 마법사는 실제 길을 정렬한다', () => {
    let s = go(special('scribe'), 'scout', '15:0'); s = go(s, 'scout', '10:0');
    s = go(s, 'skill', '10:1');
    if (s.interaction?.mode !== 'map') throw new Error('map');
    expect(s.interaction.cells[10]!.traced).toBe(true); expect(s.interaction.cells[10]!.rotation).toBe(3);
    s = go(special('mage'), 'scout', '15:0'); s = go(s, 'scout', '10:0');
    expect(connected(s.interaction as ReturnType<typeof newMap>).has(10)).toBe(false);
    s = go(s, 'skill', '10:1');
    expect(connected(s.interaction as ReturnType<typeof newMap>).has(10)).toBe(true);
    expect(s.time).toBe(2); expect(s.marks).toEqual({});
  });
  it('협상가는 한 칸을 무료 탐사하고 치유사는 부상 때만 치료하며 수호자는 탐사 피해를 막는다', () => {
    let s = go(special('talker'), 'skill', '15:1');
    expect(s.time).toBe(0); expect(s.hp).toBe(8);
    expect((s.interaction as ReturnType<typeof newMap>).cells[15]!.revealed).toBe(true);
    s = special('healer'); expect(skillReason(s, 20, 1)).toBeTruthy(); s.hp = 5;
    s = go(s, 'skill', '20:1'); expect(s.hp).toBe(7);
    expect(advanceStory(s, { action: 'skill', choice: '20:2' })).toBeNull();
    s = go(special('scout'), 'scout', '15:0');
    expect(go(s, 'scout', '16:0').hp).toBe(8);
    expect(go(s, 'scout', '16:1').hp).toBe(7);
  });
  it('고립된 칸·잘못된 대원·패시브 특기 요청은 서버가 차단한다', () => {
    const s = special('talker');
    for (const choice of ['0:1', '15:4', '15', '20:0']) expect(advanceStory(s, { action: 'skill', choice })).toBeNull();
  });
  it('동시 특기 요청은 한 번만 저장되며 특기로 화폐·경험치가 생기지 않는다', async () => {
    const { db, sql } = dbFixture(), id = crypto.randomUUID();
    await beginStory(db, 'me', 'expedition', 'mist', [], id);
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(special('talker')), id);
    const action = { action: 'skill', choice: '15:1' } as const;
    expect((await Promise.all([actStory(db, 'me', id, 0, action), actStory(db, 'me', id, 0, action)])).sort()).toEqual(['ok', 'stale']);
    const run = (await getStory(db, 'me', id))!;
    expect((run.state.interaction as ReturnType<typeof newMap>).skillsUsed).toEqual(['talker']);
    expect(run.row.xp).toBe(0); expect(run.row.jelly).toBe(0);
    expect(sql.prepare('SELECT COUNT(*) n FROM story_rewards').get()).toEqual({ n: 0 });
    const bad = structuredClone(run.state);
    (bad.interaction as ReturnType<typeof newMap>).skillsUsed = ['forged-role'];
    expect(decodeStory({ ...run.row, state: JSON.stringify(bad) })).toBeNull();
  });
});
