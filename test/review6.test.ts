// 전체 리뷰 6회차(2026-11-03) 고침
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { QUESTS, type GroupCtx } from '../src/quests';
import { loadGroups, questProgress } from '../src/season';

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
  return { sql, db: { prepare: (q: string) => stmt(q) } as unknown as D1Database };
}

describe('전체 리뷰 6회차 고침', () => {
  it('인기 스타 퀘스트는 작은 모둠에서 칭찬해 줄 수 있는 사람 수까지만 요구해요', () => {
    const q = QUESTS.find((x) => x.id === 'praise:popular:5')!;
    const ids = ['1', '2', '3', '4'];
    // 4명 모둠: 한 명이 나머지 3명에게 다 칭찬받으면 깨요
    const praises = ['2', '3', '4'].map((from) => ({ day: '2026-11-03', from, to: '1', toNewbie: false }));
    const ctx = { startSize: 4, current: ids, startCurrent: ids, praises } as unknown as GroupCtx;
    expect(q.target(ctx)).toBe(3);
    expect(questProgress(q, ctx).done).toBe(true);
    const big = Array.from({ length: 10 }, (_, i) => String(i + 1));
    expect(q.target({ startSize: 10, current: big, startCurrent: big } as unknown as GroupCtx)).toBe(5);
  });

  it('시즌 칭찬은 날짜가 같아도 시즌 시작 전·끝난 뒤 시각이면 세지 않아요', async () => {
    const { sql, db } = fakeD1();
    // 한국 11월 3일 12시에 시작하는 시즌
    sql.exec(`INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES ('2026-11-03', '2026-11-03T03:00:00.000Z', '2026-11-17T03:00:00.000Z', 'x')`);
    for (const u of ['a', 'b', 'c'])
      sql.exec(`INSERT INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES ('2026-11-03', '${u}', 0, 1, 'x')`);
    sql.exec(`INSERT INTO praises (day, from_id, to_id, jelly, created_at) VALUES
      ('2026-11-03', 'a', 'b', 0, '2026-11-03T01:00:00.000Z#early'),
      ('2026-11-03', 'a', 'c', 0, '2026-11-03T05:00:00.000Z#in'),
      ('2026-11-17', 'b', 'c', 0, '2026-11-17T04:00:00.000Z#late')`);
    const r = await loadGroups(db, '2026-11-03');
    expect(r!.groups[0]!.ctx.praises.map((p) => `${p.from}>${p.to}`)).toEqual(['a>c']);
  });
});
