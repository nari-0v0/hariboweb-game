import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { applySync, parseSync } from '../src/sync';
import { loadPrior, ensureSeasonQuests } from '../src/team';

const [A, B, C] = ['111111111111111111', '222222222222222222', '333333333333333333'];

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
  for (const id of [A, B, C]) sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `m${id[0]}`);
  return { sql, db: db as unknown as D1Database };
}



const START = '2026-11-12T09:00:00.000Z';
const END = '2026-11-26T09:00:00.000Z';
const SEASON = { id: '2026-11-12', start: START, end: END };
const ROOM = '999999999999999999';

function syncPayload(at: number, fields: Record<string, unknown>, suffix: string) {
  const result = parseSync({ batch_id: `${new Date(at).toISOString()}-${suffix}`, ...fields });
  if (!result.ok) throw Error(result.error);
  return result.value;
}

function seedSeason(sql: DatabaseSync) {
  sql.prepare("INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES (?, ?, ?, 'x')").run(SEASON.id, START, END);
  for (const id of [A, B]) {
    sql.prepare("INSERT INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES (?, ?, 0, 1, 'x')")
      .run(SEASON.id, id);
  }
}

// Codex 검토(#131)에서 재현한 시즌 경계 문제 두 개의 회귀 테스트
it('시즌 첫 묶음에 같이 온 시작 직전 통화도 짝 고르기에 들어가요', async () => {
  const { db, sql } = fakeD1();
  seedSeason(sql);
  sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-11-05', 1)").run(A);
  const at = Date.parse(START) + 600000;
  expect(await applySync(db, syncPayload(at, {
    season: { start: START, end: END },
    room_minutes: [{ at: '2026-11-11T09:00:00.000Z', room: ROOM, members: [A, B] }],
  }, 'first-sync'), at)).toBe('applied');
  expect((await loadPrior(db, SEASON)).voiced.has(B)).toBe(true);
  expect(sql.prepare('SELECT a, b FROM team_pairs').all()).toEqual([{ a: A, b: B }]);
  expect(await ensureSeasonQuests(db, SEASON, at)).toBe(false);
});

it('지난 시즌 날짜의 늦은 출석으로는 새 시즌 모둠에 들어가지 않아요', async () => {
  const { db, sql } = fakeD1();
  seedSeason(sql);
  const at = Date.parse(START) + 600000;
  expect(await applySync(db, syncPayload(at, {
    season: { start: START, end: END },
    attendance: [{ id: C, day: '2026-11-11' }],
  }, 'old-attendance'), at)).toBe('applied');
  expect(sql.prepare('SELECT 1 FROM season_members WHERE season_id = ? AND user_id = ?').get(SEASON.id, C)).toBeUndefined();
});
