import { JELLY_RECORDS, checkMystery } from '../src/jelly-mystery';
import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { advanceStory, startStory, type StoryState } from '../src/story';
import { JELLY_CASE, isJellyState, newJellyInvestigation } from '../src/jelly-investigation';
import { activeStory, actStory, beginStory, decodeStory, getStory } from '../src/story-db';
const act = (s: StoryState, choice: string) => { const r = advanceStory(s, { action: 'jelly', choice }); expect(r, choice).toBeTruthy(); return r!.state; };
const fresh = () => { const s = startStory('case', 'jelly500', [], {}); s.version = 3; if (s.interaction?.mode === 'case') s.interaction.jelly = newJellyInvestigation(); return s; };
const ready = () => {
  let s = fresh();
  for (const c of ['move:right', 'trace', 'collect', 'test:sugar', 'test:flour', 'match:sugar', 'cart:S17', 'seal:3', 'count:b1,b2,b3,b4,b5:500']) s = act(s, c);
  s = advanceStory(s, { action: 'inspect', choice: 'receipt|time,porter,amount,destination' })!.state;
  for (const c of ['trail>match', 'match>boxes', 'boxes>receipt']) s = advanceStory(s, { action: 'connect', choice: c })!.state;
  return s;
};
describe('장소를 잇는 젤리 사건', () => {
  it('이동→흔적→채집→두 표본 비교→수레→봉인→실물 수량→증거 연결로만 해결된다', () => {
    let s = ready();
    expect(s.version).toBe(3); expect(s.seen).toEqual(expect.arrayContaining(JELLY_CASE.evidence));
    expect(s.phase).toBe('play');
    const done = advanceStory(s, { action: 'reconstruct', choice: 'warehouse,cart,party' })!;
    expect(done.state.phase).toBe('done'); expect(done.state.ending).toBe('solved'); expect(done.grants.inventory).toBe('1');
    expect(done.state.log.join()).toContain('온전한 봉인');
  });
  it('상자 이동 전 채집·표본 없이 비교·비교 없이 수레·봉인 없이 수량 확인을 막는다', () => {
    const s = fresh();
    for (const c of ['trace', 'collect', 'test:sugar', 'match:sugar', 'cart:S17', 'seal:3', 'count:b1,b2,b3,b4,b5:500']) expect(advanceStory(s, { action: 'jelly', choice: c })).toBeNull();
    for (const choice of ['powder|', 'boxes|500']) expect(advanceStory(s, { action: 'inspect', choice })).toBeNull();
    const next = act(s, 'move:left'); expect(s.interaction).not.toEqual(next.interaction);
    expect(s.seen).toEqual([]); expect(next.seen).toEqual([]);
    expect(advanceStory(next, { action: 'jelly', choice: 'move:right' })).toBeNull();
  });
  it('표본 둘 다 비교해야 판단할 수 있고 잘못된 가루·수레·봉인·수량은 단서를 지급하지 않는다', () => {
    let s = act(act(fresh(), 'move:right'), 'collect'); s = act(s, 'test:sugar');
    expect(advanceStory(s, { action: 'jelly', choice: 'match:sugar' })).toBeNull();
    s = act(s, 'test:flour'); s = act(s, 'match:flour'); expect(s.seen).not.toContain('match');
    s = act(s, 'match:sugar'); expect(advanceStory(s, { action: 'jelly', choice: 'cart:S17' })).toBeNull();
    s = act(s, 'trace'); s = act(s, 'cart:F04'); expect(s.seen).not.toContain('cart');
    s = act(s, 'cart:S17'); s = act(s, 'seal:2'); expect(s.seen).not.toContain('seal');
    s = act(s, 'seal:3');
    expect(advanceStory(s, { action: 'jelly', choice: 'count:b1,b1,b3,b4,b5:500' })).toBeNull();
    expect(advanceStory(s, { action: 'jelly', choice: 'count:b1,b2,b3,b4,b6:500' })).toBeNull();
    s = act(s, 'count:b5,b4,b3,b2,b1:400'); expect(s.seen).not.toContain('boxes');
    s = act(s, 'count:b5,b4,b3,b2,b1:500'); expect(s.seen).toContain('boxes');
  });
  it('누락되거나 앞뒤가 맞지 않는 조사 상태를 로드하지 않으며 증거 목록만으로 우회할 수 없다', () => {
    let s = fresh();
    if (s.interaction?.mode !== 'case') throw new Error('case');
    expect(isJellyState(s.interaction.jelly)).toBe(true);
    expect(isJellyState({ ...s.interaction.jelly, matched: true })).toBe(false);
    expect(isJellyState({ ...s.interaction.jelly, tested: ['sugar', 'sugar'] })).toBe(false);
    s.seen = [...JELLY_CASE.evidence]; s.interaction.links = ['match>trail', 'boxes>match', 'boxes>receipt'];
    expect(advanceStory(s, { action: 'reconstruct', choice: 'warehouse,cart,party' })).toBeNull();
  });
});
function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(process.cwd(), 'migrations')).filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(join(process.cwd(), 'migrations', f), 'utf8'));
  let fail = false;
  const stmt = (q: string, args: unknown[] = []) => ({ q, args, bind: (...a: unknown[]) => stmt(q, a), first: async () => sql.prepare(q).get(...args) ?? null, all: async () => ({ results: sql.prepare(q).all(...args) }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...args).changes) } }) });
  const db = { prepare: (q: string) => stmt(q), batch: async (list: ReturnType<typeof stmt>[]) => {
    sql.exec('BEGIN'); try { const result = list.map((s, i) => { if (fail && i === list.length - 1) throw new Error('injected'); return { meta: { changes: Number(sql.prepare(s.q).run(...s.args).changes) }, results: [] }; }); sql.exec('COMMIT'); return result; } catch (e) { sql.exec('ROLLBACK'); throw e; }
  } } as unknown as D1Database;
  sql.exec("INSERT INTO members (user_id, display_name, active, updated_at) VALUES ('me', 'QA', 1, 'x')");
  return { db, sql, inject: (v: boolean) => { fail = v; } };
}

const theory = 'a,x,p;b,y,k;c,z,p;2,AG;3,DE;1,CG;2,IJ;1,FH';
function mysteryReady() {
  let s = startStory('case', 'jelly500', [], {});
  for (const r of [...JELLY_RECORDS].reverse()) s = act(s, `read:${r.id}`);
  return s;
}
describe('모순을 풀어 복원하는 사건 v4', () => {
  it('순서 없이 조사하고 세 이동·다섯 해석·근거를 모두 맞춰야 해결한다', () => {
    const s = mysteryReady(); expect(s.version).toBe(4);
    const r = advanceStory(s, { action: 'reconstruct', choice: theory })!;
    expect(r.state.phase).toBe('done'); expect(r.grants).toMatchObject({ inventory: '1', ribbon: '1' });
    expect(r.state.log.join()).toContain('300+200=500');
    expect(s.phase).toBe('play');
  });
  it('근거 순서는 허용하지만 미조사·중복·알 수 없는 근거와 옛 정답 우회는 거절한다', () => {
    const s = mysteryReady();
    expect(checkMystery(s, theory.replace('AG', 'GA')).solved).toBe(true);
    expect(checkMystery(s, theory.replace('AG', 'AB')).solved).toBe(true);
    for (const bad of [theory + ';', theory.replace('AG', 'AA'), theory.replace('AG', 'AZ'), theory.replace('a,x,p', 'a,x,p,q'), 'warehouse,cart,party']) expect(advanceStory(s, { action: 'reconstruct', choice: bad })).toBeNull();
    for (const action of [{ action: 'jelly', choice: 'read:A' }, { action: 'inspect', choice: 'boxes|500' }, { action: 'connect', choice: 'A>G' }, { action: 'jelly', choice: 'count:b1,b2,b3,b4,b5:500' }] as const) expect(advanceStory(s, action)).toBeNull();
    const empty = startStory('case', 'jelly500', [], {});
    expect(advanceStory(empty, { action: 'reconstruct', choice: theory })).toBeNull();
  });
  it('한 가지라도 다른 시간·물품·장소·해석·근거는 완료되지 않고 구체적인 모순을 돌려준다', () => {
    const s = mysteryReady(), parts = theory.split(';');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const row = parts[i]!.split(',');
      for (const value of ['abc', 'xyz', 'pk'][j]!) {
        if (value === row[j]) continue;
        const wrong = [...parts], copy = [...row]; copy[j] = value; wrong[i] = copy.join(',');
        const r = advanceStory(s, { action: 'reconstruct', choice: wrong.join(';') })!;
        expect(r.state.phase).toBe('play'); expect(r.grants).toEqual({}); expect(r.state.log.length).toBeGreaterThan(0);
      }
    }
    for (let i = 3; i < 8; i++) {
      const wrong = [...parts]; wrong[i] = '3,' + parts[i]!.slice(2); if (wrong[i] === parts[i]) wrong[i] = '1,' + parts[i]!.slice(2);
      expect(checkMystery(s, wrong.join(';')).solved).toBe(false);
      wrong[i] = parts[i]![0] + ',BL'; expect(checkMystery(s, wrong.join(';')).solved).toBe(false);
    }
  });
  it('해석의 근거만 모아도 사진 뒷면 등 원기록을 놓치면 완료할 수 없다', () => {
    const s = mysteryReady(); s.seen = s.seen.filter(id => id !== 'K');
    const result = checkMystery(s, theory); expect(result.valid).toBe(true); expect(result.solved).toBe(false);
    expect(result.messages.join()).toContain('사진 뒷면');
  });
  it('v3 진행을 안전하게 갱신하고 v4 동시 완료와 재플레이에 중복 보상을 지급하지 않는다', async () => {
    const { db, sql } = fixture(), id = crypto.randomUUID(); await beginStory(db, 'me', 'case', 'jelly500', [], id);
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(fresh()), id);
    const upgraded = (await activeStory(db, 'me', 'case'))!; expect(upgraded.state.version).toBe(4);
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(mysteryReady()), id);
    const action = { action: 'reconstruct', choice: theory } as const;
    expect((await Promise.all([actStory(db, 'me', id, 1, action), actStory(db, 'me', id, 1, action)])).sort()).toEqual(['ok', 'stale']);
    const replay = crypto.randomUUID(); await beginStory(db, 'me', 'case', 'jelly500', [], replay);
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(mysteryReady()), replay);
    expect(await actStory(db, 'me', replay, 0, action)).toBe('ok');
    expect(sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get('me')).toEqual({ solo_xp: 10, dogam_jelly: 1 });
  });
});
describe('연결 조사 저장과 보상', () => {
  it('기존 진행 판은 revision을 올려 전환하고 영구 기록을 유지하며 과거 화면 요청은 막힌다', async () => {
    const { db, sql } = fixture(), id = crypto.randomUUID(); await beginStory(db, 'me', 'case', 'jelly500', [], id);
    const s = fresh(); s.version = 2; if (s.interaction?.mode === 'case') delete s.interaction.jelly;
    s.seen = ['receipt', 'boxes', 'promise'];
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(s), id);
    const r = (await activeStory(db, 'me', 'case'))!;
    expect(r.state.version).toBe(4); expect(r.state.seen).toEqual([]); expect(r.row.revision).toBe(1);
    expect(await actStory(db, 'me', id, 0, { action: 'inspect', choice: 'boxes|500' })).toBe('stale');
    expect(r.row.xp).toBe(0); expect(r.row.jelly).toBe(0);
    const bad = { ...r.state, seen: ['receipt'] };
    expect(decodeStory({ ...r.row, state: JSON.stringify(bad) })).toBeNull();
  });
  it('동시 채집·최종 제출·응답 유실 재시도에도 단계와 보상은 한 번만 반영되고 지급 실패는 롤백된다', async () => {
    const { db, sql, inject } = fixture(), id = crypto.randomUUID(); await beginStory(db, 'me', 'case', 'jelly500', [], id);
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(fresh()), id);
    await actStory(db, 'me', id, 0, { action: 'jelly', choice: 'move:right' });
    expect((await Promise.all([actStory(db, 'me', id, 1, { action: 'jelly', choice: 'collect' }), actStory(db, 'me', id, 1, { action: 'jelly', choice: 'collect' })])).sort()).toEqual(['ok', 'stale']);
    sql.prepare('UPDATE story_runs SET state = ? WHERE id = ?').run(JSON.stringify(ready()), id);
    const action = { action: 'reconstruct', choice: 'warehouse,cart,party' } as const;
    inject(true); await expect(actStory(db, 'me', id, 2, action)).rejects.toThrow('injected'); inject(false);
    expect((await getStory(db, 'me', id))!.row.revision).toBe(2);
    expect(sql.prepare('SELECT COUNT(*) n FROM story_rewards').get()).toEqual({ n: 0 });
    expect((await Promise.all([actStory(db, 'me', id, 2, action), actStory(db, 'me', id, 2, action)])).sort()).toEqual(['ok', 'stale']);
    expect(await actStory(db, 'me', id, 2, action)).toBe('stale');
    expect(sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get('me')).toEqual({ solo_xp: 10, dogam_jelly: 1 });
  });
});
