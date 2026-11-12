// 같이 배정되지 않기: 사유 검사, AI 검토, 봇 API용 함수, 팀 짤 때 떼어 놓기
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  approvedBlocks,
  blockKey,
  decideBlock,
  isEmptyReason,
  listUnpostedBlocks,
  markBlockPosted,
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
});

describe('봇', () => {
  it('안 올린 요청 → 올림 표시 → 결정은 처음 한 번만', async () => {
    const { db } = fakeD1();
    await requestBlock(db, undefined, A, B, REASON, false, NOW);
    const [b] = await listUnpostedBlocks(db);
    expect(b).toMatchObject({ from: { id: A, name: 'm1' }, to: { id: B, name: 'm2' }, reason: REASON });
    expect(await markBlockPosted(db, b!.id, '1'.repeat(19), NOW)).toBe(true);
    expect(await markBlockPosted(db, b!.id, '2'.repeat(19), NOW)).toBe(false);
    expect(await listUnpostedBlocks(db)).toEqual([]);
    expect(await decideBlock(db, b!.id, 'approved', '7'.repeat(18), NOW)).toMatchObject({ applied: true, status: 'approved' });
    expect(await decideBlock(db, b!.id, 'rejected', '7'.repeat(18), NOW + 1)).toMatchObject({ applied: false, status: 'approved' });
    expect(await decideBlock(db, 999, 'rejected', '7'.repeat(18), NOW)).toBeNull();
    expect(await approvedBlocks(db)).toEqual(new Set([blockKey(A, B)]));
  });
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
