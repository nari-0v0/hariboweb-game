import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { applySync, parseSync } from '../src/sync';
import { ensureSeason } from '../src/season';

const [A, B, C, D] = ['111111111111111111', '222222222222222222', '333333333333333333', '444444444444444444'];

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
  for (const id of [A, B, C, D]) sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `m${id[0]}`);
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

// 나리 2026-11-15: 팀은 초록하리보 역할이 있는 사람으로만. 빠지면 팀에서 빠지고, 생기면 제일 작은 팀(같으면 랜덤)
const member = (id: string, green: boolean) => ({ id, name: `m${id[0]}`, green });
const groupOf = (sql: DatabaseSync, id: string) =>
  sql.prepare('SELECT group_no, left_at FROM season_members WHERE season_id = ? AND user_id = ?').get(SEASON.id, id) as
    | { group_no: number; left_at: string | null }
    | undefined;

it('초록하리보가 빠지면 팀에서 빠지고, 다시 생기면 원래 팀으로 돌아가요', async () => {
  const { db, sql } = fakeD1();
  seedSeason(sql);
  const at = Date.parse(START) + 600000;
  expect(await applySync(db, syncPayload(at, { season: { start: START, end: END }, members: [member(A, true), member(B, false)] }, 'lose'), at)).toBe('applied');
  expect(groupOf(sql, B)?.left_at).toBeTruthy();
  expect(groupOf(sql, A)?.left_at).toBeNull();
  // 역할이 없는 동안 통화해도 다시 들어가지 않아요
  const at2 = at + 600000;
  expect(await applySync(db, syncPayload(at2, {
    season: { start: START, end: END },
    room_minutes: [{ at: new Date(at2 - 60000).toISOString(), room: ROOM, members: [A, B] }],
  }, 'still-out'), at2)).toBe('applied');
  expect(groupOf(sql, B)?.left_at).toBeTruthy();
  const at3 = at2 + 600000;
  expect(await applySync(db, syncPayload(at3, { season: { start: START, end: END }, members: [member(B, true)] }, 'back'), at3)).toBe('applied');
  expect(groupOf(sql, B)).toEqual({ group_no: 0, left_at: null });
});

it('초록하리보가 새로 생기면 활동이 없어도 제일 작은 팀에 들어가요', async () => {
  const { db, sql } = fakeD1();
  seedSeason(sql); // A, B → 0팀
  sql.prepare("INSERT INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES (?, ?, 1, 1, 'x')").run(SEASON.id, C);
  const at = Date.parse(START) + 600000;
  expect(await applySync(db, syncPayload(at, { season: { start: START, end: END }, members: [member(D, true)] }, 'new'), at)).toBe('applied');
  expect(groupOf(sql, D)).toEqual({ group_no: 1, left_at: null });
});

it('팀 인원이 모두 같으면 아무 팀에나(랜덤) 들어가요', async () => {
  const picked = new Set<number>();
  for (let i = 0; i < 12; i++) {
    const { db, sql } = fakeD1();
    seedSeason(sql);
    sql.prepare('UPDATE season_members SET group_no = 1 WHERE user_id = ?').run(B); // 0팀 A, 1팀 B
    const at = Date.parse(START) + 600000 + i * 1000;
    await applySync(db, syncPayload(at, { season: { start: START, end: END }, members: [member(D, true)] }, `tie${i}`), at);
    picked.add(groupOf(sql, D)!.group_no);
  }
  expect([...picked].sort()).toEqual([0, 1]);
});

it('시즌을 처음 만들 때는 활동과 상관없이 초록하리보가 있는 사람만 팀이 돼요', async () => {
  const { db, sql } = fakeD1();
  sql.prepare('UPDATE members SET green = 1 WHERE user_id IN (?, ?)').run(A, B);
  sql.prepare('UPDATE members SET green = 0 WHERE user_id IN (?, ?)').run(C, D);
  // C는 최근 통화가 많지만 초록하리보가 없어요
  sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-11-05', 300)").run(C);
  expect(await ensureSeason(db, SEASON, Date.parse(START) + 1000)).toBe(true);
  const ids = (sql.prepare('SELECT user_id FROM season_members WHERE season_id = ? ORDER BY user_id').all(SEASON.id) as { user_id: string }[]).map((r) => r.user_id);
  expect(ids).toEqual([A, B]);
});

it('초록하리보 값을 안 보내는 예전 봇이면 예전처럼 활동으로 골라요', async () => {
  const { db, sql } = fakeD1();
  for (const id of [C, D]) sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-11-05', 30)").run(id);
  expect(await ensureSeason(db, SEASON, Date.parse(START) + 1000)).toBe(true);
  const ids = (sql.prepare('SELECT user_id FROM season_members WHERE season_id = ? ORDER BY user_id').all(SEASON.id) as { user_id: string }[]).map((r) => r.user_id);
  expect(ids).toEqual([C, D]);
});
