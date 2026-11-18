// 같이 배정되지 않기: 사유 검사, AI 검토, 봇 API용 함수, 팀 짤 때 떼어 놓기
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  approvedBlocks,
  blockKey,
  cancelBlock,
  decideBlock,
  flipBlock,
  isEmptyReason,
  listUnpostedBlocks,
  markBlockPosted,
  myBlocks,
  parseVerdict,
  requestBlock,
  separateBlocked,
} from '../src/assign-block';
import { joinGroup } from '../src/season';
import { seededRandom } from '../src/quests';
import { applySync, parseSync } from '../src/sync';

const ids = Array.from({ length: 6 }, (_, i) => `${i + 1}`.repeat(18));
const [A, B, C, D] = ids as [string, string, string, string];
const NOW = Date.parse('2026-11-03T03:00:00Z');

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
        for (const s of list) sql.prepare(s.query).run(...(s.args as never[]));
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
      return [];
    },
  };
  for (const id of ids) {
    sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `m${id[0]}`);
    sql.prepare('INSERT INTO profiles (user_id, solo_xp, updated_at) VALUES (?, 0, ?)').run(id, '2026-11-01T00:00:00.000Z');
  }
  return { sql, db: db as unknown as D1Database };
}

const fakeAi = (reply: string | Error) =>
  ({
    run: async () => {
      if (reply instanceof Error) throw reply;
      return { response: reply };
    },
  }) as unknown as Ai;
const REASON = '지난번 게임에서 계속 욕하고 제 말을 무시해서 같이 하기 힘들었어요';

describe('사유 검사', () => {
  it('내용 없는 답은 다시 물어요', () => {
    for (const r of ['그냥요', '몰라요', '없어요', '별로요', '싫어서', '비밀', 'ㅇㅇ', 'ㅋㅋㅋㅋ', '음', ' 그냥 ', '싫어서요!!']) expect(isEmptyReason(r)).toBe(true);
    expect(isEmptyReason(REASON)).toBe(false);
    expect(isEmptyReason('욕을 해요')).toBe(false);
  });

  it('AI 답에서 판단과 요약을 읽어요', () => {
    expect(parseVerdict('네 {"verdict":"ok","summary":"게임 중 욕설"} 끝')).toEqual({ verdict: 'ok', summary: '게임 중 욕설' });
    expect(parseVerdict('{"verdict":"maybe"}')).toBeNull();
    expect(parseVerdict('몰라')).toBeNull();
  });
});

describe('신청', () => {
  it('동시에 신청해도 같은 상대는 한 번만, 전체 세 명까지만 저장해요', async () => {
    const { db } = fakeD1();
    const send = (to: string) => requestBlock(db, undefined, A, to, REASON, false, NOW);
    expect((await Promise.all([send(B), send(B)])).sort()).toEqual(['done', 'dup']);
    expect((await Promise.all([send(C), send(D), send(ids[4]!)])).sort()).toEqual(['done', 'done', 'limit']);
    expect(await myBlocks(db, A)).toHaveLength(3);
  });
  it('AI가 괜찮다고 하면 대기, 장난이면 반려(AI), 모호하면 한 번 더 물어요', async () => {
    const { sql, db } = fakeD1();
    expect(await requestBlock(db, fakeAi('{"verdict":"ok","summary":"게임 중 욕설"}'), A, B, REASON, false, NOW)).toBe('done');
    expect(await requestBlock(db, fakeAi('{"verdict":"reject","summary":"장난"}'), A, C, '바보바보바보', false, NOW)).toBe('done');
    expect(await requestBlock(db, fakeAi('{"verdict":"vague","summary":""}'), A, D, '그때 좀 그랬어요', false, NOW)).toBe('more');
    expect(await requestBlock(db, fakeAi('{"verdict":"vague","summary":"불편"}'), A, D, '그때 좀 그랬어요 말투가', true, NOW)).toBe('done');
    const rows = sql.prepare('SELECT to_id, status, ai_summary FROM assign_blocks ORDER BY id').all();
    expect(rows).toEqual([
      { to_id: B, status: 'pending', ai_summary: '게임 중 욕설' },
      { to_id: C, status: 'ai_rejected', ai_summary: '장난' },
      { to_id: D, status: 'pending', ai_summary: '불편' },
    ]);
  });

  it('AI가 없거나 실패하면 기다리지 않고 규칙 검사만으로 넘겨요', async () => {
    const { sql, db } = fakeD1();
    expect(await requestBlock(db, undefined, A, B, REASON, false, NOW)).toBe('done');
    expect(await requestBlock(db, fakeAi(new Error('quota')), A, C, REASON, false, NOW)).toBe('done');
    expect(await requestBlock(db, undefined, A, D, '그냥요', false, NOW)).toBe('empty');
    expect((sql.prepare("SELECT COUNT(*) AS n FROM assign_blocks WHERE status = 'pending'").get() as { n: number }).n).toBe(2);
  });

  it('자기 자신·같은 상대 대기 중·대기 3개 넘게는 안 돼요', async () => {
    const { db } = fakeD1();
    expect(await requestBlock(db, undefined, A, A, REASON, false, NOW)).toBe('self');
    expect(await requestBlock(db, undefined, A, '9'.repeat(18), REASON, false, NOW)).toBe('unknown');
    for (const to of [B, C, D]) expect(await requestBlock(db, undefined, A, to, REASON, false, NOW)).toBe('done');
    expect(await requestBlock(db, undefined, A, B, REASON, false, NOW)).toBe('dup');
    expect(await requestBlock(db, undefined, A, ids[4]!, REASON, false, NOW)).toBe('limit');
  });

  it('승인된 사람도 3명 안에 세고, 풀기로 바로 지워서 다시 고를 수 있어요', async () => {
    // 나리: 최대 3명까지 제외. 잘못 눌렀거나 다시 같이 놀고 싶으면 풀 수 있어야 해요
    const { db } = fakeD1();
    for (const to of [B, C, D]) await requestBlock(db, undefined, A, to, REASON, false, NOW);
    const [first] = await listUnpostedBlocks(db);
    await decideBlock(db, first!.id, 'approved', '7'.repeat(18), NOW);
    expect(await requestBlock(db, undefined, A, ids[4]!, REASON, false, NOW)).toBe('limit');
    expect(await requestBlock(db, undefined, A, B, REASON, false, NOW)).toBe('dup');
    const mine = await myBlocks(db, A);
    expect(mine.map((b) => b.state)).toEqual(['approved', 'review', 'review']);
    // 남의 요청은 못 풀어요
    expect(await cancelBlock(db, B, mine[0]!.id)).toBe(false);
    expect(await cancelBlock(db, A, mine[0]!.id)).toBe(true);
    expect(await approvedBlocks(db)).toEqual(new Set());
    expect(await requestBlock(db, undefined, A, ids[4]!, REASON, false, NOW)).toBe('done');
    // 지운 요청을 나리가 누르면 없는 요청(봇은 "지워졌어요"로 닫아요)
    expect(await decideBlock(db, mine[0]!.id, 'approved', '7'.repeat(18), NOW)).toBeNull();
    // 나리가 반려한 요청은 목록과 3명에서 빠져요
    await decideBlock(db, mine[1]!.id, 'rejected', '7'.repeat(18), NOW);
    expect((await myBlocks(db, A)).map((b) => b.id)).not.toContain(mine[1]!.id);
  });
});

describe('봇', () => {
  it('AI가 거른 요청도 나리 채널에 올라가고, 나리가 승인하면 뒤집혀요', async () => {
    const { db } = fakeD1();
    await requestBlock(db, fakeAi('{"verdict":"reject","summary":"장난"}'), A, C, '바보바보바보', false, NOW);
    expect(await requestBlock(db, fakeAi('{"verdict":"reject","summary":"장난"}'), A, C, '바보바보바보', false, NOW)).toBe('dup');
    const [b] = await listUnpostedBlocks(db);
    expect(b).toMatchObject({ to: { id: C }, status: 'ai_rejected', ai_verdict: 'reject' });
    expect(await decideBlock(db, b!.id, 'approved', '7'.repeat(18), NOW)).toMatchObject({ applied: true, status: 'approved' });
    expect(await approvedBlocks(db)).toEqual(new Set([blockKey(A, C)]));
  });

  it('안 올린 요청 → 올림 표시 → 결정은 처음 한 번만', async () => {
    const { db } = fakeD1();
    await requestBlock(db, undefined, A, B, REASON, false, NOW);
    const [b] = await listUnpostedBlocks(db);
    expect(b).toMatchObject({ from: { id: A, name: 'm1' }, to: { id: B, name: 'm2' }, reason: REASON, status: 'pending' });
    expect(await markBlockPosted(db, b!.id, '1'.repeat(19), NOW)).toBe(true);
    expect(await markBlockPosted(db, b!.id, '2'.repeat(19), NOW)).toBe(false);
    expect(await markBlockPosted(db, b!.id, '1'.repeat(19), NOW + 1)).toBe(true); // 응답을 못 받아 다시 보내도 그대로
    expect(await listUnpostedBlocks(db)).toEqual([]);
    expect(await decideBlock(db, b!.id, 'approved', '7'.repeat(18), NOW)).toMatchObject({ applied: true, status: 'approved' });
    expect(await decideBlock(db, b!.id, 'rejected', '7'.repeat(18), NOW + 1)).toMatchObject({ applied: false, status: 'approved' });
    expect(await decideBlock(db, 999, 'rejected', '7'.repeat(18), NOW)).toBeNull();
    expect(await approvedBlocks(db)).toEqual(new Set([blockKey(A, B)]));
    // 잘못 눌렀으면 결정 바꾸기로 승인↔반려를 뒤집어요
    expect(await flipBlock(db, b!.id, '7'.repeat(18), NOW + 2)).toMatchObject({ applied: true, status: 'rejected' });
    expect(await approvedBlocks(db)).toEqual(new Set());
    expect(await flipBlock(db, b!.id, '7'.repeat(18), NOW + 3)).toMatchObject({ applied: true, status: 'approved' });
    expect(await flipBlock(db, 999, '7'.repeat(18), NOW)).toBeNull();
  });

  it('아직 결정 안 한 요청은 뒤집지 않아요', async () => {
    const { db } = fakeD1();
    await requestBlock(db, undefined, A, B, REASON, false, NOW);
    const [b] = await listUnpostedBlocks(db);
    expect(await flipBlock(db, b!.id, '7'.repeat(18), NOW)).toMatchObject({ applied: false, status: 'pending' });
  });
});

it('나간 멤버가 신청했거나 받은 요청은 지워요', async () => {
  const { sql, db } = fakeD1();
  sql.prepare("INSERT INTO assign_blocks (from_id, to_id, reason, status, created_at) VALUES (?, ?, 'x', 'pending', 'x')").run(A, B);
  sql.prepare("INSERT INTO assign_blocks (from_id, to_id, reason, status, created_at) VALUES (?, ?, 'x', 'approved', 'x')").run(C, A);
  sql.prepare("INSERT INTO assign_blocks (from_id, to_id, reason, status, created_at) VALUES (?, ?, 'x', 'pending', 'x')").run(C, D);
  const parsed = parseSync({ batch_id: `${new Date(NOW).toISOString()}-left`, removed: [A] });
  if (!parsed.ok) throw new Error(parsed.error);
  await applySync(db, parsed.value, NOW);
  expect(sql.prepare('SELECT from_id, to_id FROM assign_blocks').all()).toEqual([{ from_id: C, to_id: D }]);
  expect((await listUnpostedBlocks(db)).map((b) => b.from.id)).toEqual([C]);
});

describe('팀 짜기', () => {
  it('승인된 짝이 같은 팀이면 다른 팀 사람과 바꿔요', () => {
    const plan = new Map([
      [A, 0],
      [B, 0],
      [C, 1],
      [D, 1],
    ]);
    separateBlocked(plan, new Set([blockKey(A, B)]));
    expect(plan.get(A)).not.toBe(plan.get(B));
    expect([...plan.values()].filter((g) => g === 0)).toHaveLength(2);
  });

  it('한 팀에 막힌 짝이 둘이어도 하나씩 풀어요', () => {
    const E = ids[4]!;
    const F = ids[5]!;
    const plan = new Map([
      [A, 0],
      [B, 0],
      [C, 0],
      [D, 0],
      [E, 1],
      [F, 1],
      ['7'.repeat(18), 1],
      ['9'.repeat(18), 1],
    ]);
    separateBlocked(plan, new Set([blockKey(A, B), blockKey(C, D)]));
    expect(plan.get(A)).not.toBe(plan.get(B));
    expect(plan.get(C)).not.toBe(plan.get(D));
    expect([...plan.values()].filter((g) => g === 0)).toHaveLength(4);
  });

  it('20명을 두 팀으로 나눌 해가 있어도 한 명씩 교환하다 멈추는 경우를 풀어요', () => {
    const people = Array.from({ length: 20 }, (_, i) => String(i).padStart(18, '0'));
    const zero = new Set([3, 4, 7, 8, 9, 10, 12, 14, 15, 16]);
    const plan = new Map(people.map((id, i) => [id, zero.has(i) ? 0 : 1]));
    // 0~9가 각각 세 명씩 제외 신청한 상태예요. 0~9 / 10~19로 나누면 모두 지킬 수 있어요.
    const targets = [[10, 14, 16], [11, 14, 18], [12, 13, 16], [10, 16, 17], [14, 17, 18],
      [11, 12, 18], [13, 15, 18], [10, 13, 18], [14, 17, 19], [11, 18, 19]];
    const pairs = targets.flatMap((to, from) => to.map((t) => [people[from]!, people[t]!] as const));
    separateBlocked(plan, new Set(pairs.map(([a, b]) => blockKey(a, b))));
    expect(pairs.filter(([a, b]) => plan.get(a) === plan.get(b))).toEqual([]);
    expect([...plan.values()].filter((no) => no === 0)).toHaveLength(10);
    expect([...plan.values()].filter((no) => no === 1)).toHaveLength(10);
  });

  it('해가 있는 두 팀 배정 30가지는 인원과 모든 제외 관계를 지켜요', () => {
    const people = Array.from({ length: 20 }, (_, i) => String(i).padStart(18, '0'));
    for (let seed = 0; seed < 30; seed++) {
      const random = seededRandom(`two-teams:${seed}`);
      const order = people.map((id) => ({ id, key: random() })).sort((a, b) => a.key - b.key);
      const plan = new Map(order.map(({ id }, i) => [id, i < 10 ? 0 : 1]));
      const blocked = new Set<string>();
      for (const id of people.slice(0, 10))
        for (let n = 0; n < 3; n++) blocked.add(blockKey(id, people[10 + Math.floor(random() * 10)]!));
      separateBlocked(plan, blocked);
      for (const pair of blocked) {
        const [a, b] = pair.split('|');
        expect(plan.get(a!)).not.toBe(plan.get(b!));
      }
      expect([...plan.values()].filter((no) => no === 0)).toHaveLength(10);
      expect([...plan.values()].filter((no) => no === 1)).toHaveLength(10);
    }
  });

  it('두 팀으로 풀 수 없는 제외 관계와 추가 조건 때문에 임의로 인원을 바꾸지 않아요', () => {
    const plan = new Map([[A, 0], [B, 0], [C, 0], [D, 1]]);
    const triangle = new Set([blockKey(A, B), blockKey(B, C), blockKey(C, A)]);
    separateBlocked(plan, triangle);
    expect([...plan.values()].filter((no) => no === 0)).toHaveLength(3);
    expect([...plan.values()].filter((no) => no === 1)).toHaveLength(1);
    const guarded = new Map([[A, 0], [B, 0], [C, 1], [D, 1]]);
    const before = [...guarded];
    separateBlocked(guarded, new Set([blockKey(A, B)]), () => false);
    expect([...guarded]).toEqual(before);
  });

  it('시즌 중간에 들어오는 사람은 막힌 상대가 있는 팀을 피해요', () => {
    const groups = [
      { no: 0, size: 1, games: new Set(['롤']) },
      { no: 1, size: 5, games: new Set(['배그']) },
    ];
    expect(joinGroup(['롤'], groups, seededRandom('x'), new Set([0]))).toBe(1);
    expect(joinGroup(['롤'], groups.slice(0, 1), seededRandom('x'), new Set([0]))).toBe(0); // 다른 팀이 없으면 어쩔 수 없어요
  });

  it('새 시즌 팀을 만들 때 승인된 짝을 떼어 놓아요', async () => {
    for (const seed of ['a', 'b', 'c']) {
      const { sql, db } = fakeD1();
      // 20명 → 2팀
      for (let i = 0; i < 14; i++) {
        const id = `8${String(i).padStart(17, '0')}`;
        sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `n${i}`);
        sql.prepare('INSERT INTO profiles (user_id, solo_xp, updated_at) VALUES (?, 0, ?)').run(id, '2026-11-01T00:00:00.000Z');
      }
      sql.prepare("INSERT INTO assign_blocks (from_id, to_id, reason, status, created_at) VALUES (?, ?, 'x', 'approved', 'x')").run(A, B);
      const start = seed === 'a' ? '2026-11-02T15:00:00Z' : seed === 'b' ? '2026-11-02T16:00:00Z' : '2026-11-02T17:00:00Z';
      const parsed = parseSync({
        batch_id: `${new Date(NOW).toISOString()}-${seed}`,
        season: { start, end: '2026-11-16T15:00:00Z' },
        full_members: true,
        members: [...ids, ...Array.from({ length: 14 }, (_, i) => `8${String(i).padStart(17, '0')}`)].map((id) => ({ id, name: id, is_newbie: false, games: ['롤'] })),
      });
      if (!parsed.ok) throw new Error(parsed.error);
      await applySync(db, parsed.value, NOW);
      const g = (u: string) => (sql.prepare('SELECT group_no FROM season_members WHERE user_id = ?').get(u) as { group_no: number }).group_no;
      expect(g(A)).not.toBe(g(B));
    }
  });
});

it('반려 뒤 새로 3명을 신청했으면 옛 반려를 뒤집어 4명으로 늘리지 않아요', async () => {
  const { db } = fakeD1();
  await requestBlock(db, undefined, A, B, REASON, false, NOW);
  const [old] = await listUnpostedBlocks(db);
  await decideBlock(db, old!.id, 'rejected', ids[5]!, NOW);
  for (const to of [C, D, ids[4]!]) await requestBlock(db, undefined, A, to, REASON, false, NOW);
  expect(await myBlocks(db, A)).toHaveLength(3);
  expect(await flipBlock(db, old!.id, ids[5]!, NOW + 1)).toMatchObject({ applied: false, status: 'rejected' });
  expect(await myBlocks(db, A)).toHaveLength(3);
  const [current] = await myBlocks(db, A);
  await cancelBlock(db, A, current!.id);
  expect(await flipBlock(db, old!.id, ids[5]!, NOW + 2)).toMatchObject({ applied: true, status: 'approved' });
  expect(await myBlocks(db, A)).toHaveLength(3);
});

it('같은 상대에게 다시 신청한 뒤 옛 반려를 뒤집어 요청을 두 개로 만들지 않아요', async () => {
  const { db } = fakeD1();
  await requestBlock(db, undefined, A, B, REASON, false, NOW);
  const [old] = await listUnpostedBlocks(db);
  await decideBlock(db, old!.id, 'rejected', ids[5]!, NOW);
  await requestBlock(db, undefined, A, B, REASON, false, NOW + 1);
  expect(await flipBlock(db, old!.id, ids[5]!, NOW + 2)).toMatchObject({ applied: false, status: 'rejected' });
  expect(await myBlocks(db, A)).toHaveLength(1);
});

it('3개 팀에서 한 명씩 맞바꾸기로 막혀도 가능한 제외 배정을 찾아요', () => {
  const plan = new Map(Array.from({ length: 9 }, (_, i) => [String(i), Math.floor(i / 3)]));
  const edges = [[0, 5], [0, 6], [0, 8], [1, 3], [1, 5], [1, 8], [3, 5], [4, 6], [4, 8], [5, 6], [6, 8]];
  const blocked = new Set(edges.map(([a, b]) => blockKey(String(a), String(b))));
  // 각 팀 3명을 그대로 유지하면서 충돌이 없는 배정이 실제로 있어요.
  const possible = [[6, 2, 1], [0, 3, 4], [5, 7, 8]];
  for (const group of possible) for (const a of group) for (const b of group) expect(blocked.has(blockKey(String(a), String(b)))).toBe(false);
  separateBlocked(plan, blocked);
  for (const [a, b] of edges) expect(plan.get(String(a)), `${a}|${b}`).not.toBe(plan.get(String(b)));
  for (const no of [0, 1, 2]) expect([...plan.values()].filter((g) => g === no)).toHaveLength(3);
});

it('AI 검토 중 전체 초기화가 끝나면 초기화 전 제외 요청을 다시 만들지 않아요', async () => {
  const { db, sql } = fakeD1();
  const ai = { run: async () => {
    sql.exec(readFileSync('scripts/launch-reset.sql', 'utf8'));
    return { response: '{"verdict":"ok","summary":"검토"}' };
  } } as unknown as Ai;
  expect(await requestBlock(db, ai, A, B, REASON, false, NOW)).toBe('unknown');
  expect(await myBlocks(db, A)).toEqual([]);
  expect(await listUnpostedBlocks(db)).toEqual([]);
});


it('3·4개 팀의 가능한 제외 관계를 여럿 확인해도 인원과 제외 조건을 함께 지켜요', () => {
  for (const teamCount of [3, 4]) for (let seed = 0; seed < 40; seed++) {
    const random = seededRandom(`multi-team-${teamCount}-${seed}`);
    const ids = Array.from({ length: teamCount * 3 }, (_, i) => `p${String(i).padStart(2, '0')}`);
    const possible = [...ids];
    for (let i = possible.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [possible[i], possible[j]] = [possible[j]!, possible[i]!];
    }
    const valid = new Map(possible.map((id, i) => [id, Math.floor(i / 3)]));
    const blocked = new Set<string>();
    for (const a of ids) for (const b of ids) if (a < b && valid.get(a) !== valid.get(b) && random() < 0.6) blocked.add(blockKey(a, b));
    const plan = new Map(ids.map((id, i) => [id, Math.floor(i / 3)]));
    separateBlocked(plan, blocked);
    for (const edge of blocked) {
      const [a, b] = edge.split('|');
      expect(plan.get(a!), `seed=${seed}, ${edge}`).not.toBe(plan.get(b!));
    }
    for (let no = 0; no < teamCount; no++) expect([...plan.values()].filter((g) => g === no)).toHaveLength(3);
  }
});

it('3팀으로 나눌 수 없는 제외 관계도 인원이나 별도 조건을 깨지 않아요', () => {
  const ids = Array.from({ length: 9 }, (_, i) => String(i));
  const plan = new Map(ids.map((id, i) => [id, Math.floor(i / 3)]));
  const blocked = new Set<string>();
  // 넷이 서로 모두 제외하면 최소 네 팀이 필요해요.
  for (const a of ids.slice(0, 4)) for (const b of ids.slice(0, 4)) if (a < b) blocked.add(blockKey(a, b));
  const before = new Map(plan);
  separateBlocked(plan, blocked, () => false);
  expect(plan).toEqual(before);
  separateBlocked(plan, blocked);
  for (const no of [0, 1, 2]) expect([...plan.values()].filter((g) => g === no)).toHaveLength(3);
});
