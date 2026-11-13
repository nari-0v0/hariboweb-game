import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { signSession } from '../src/crypto';
import { applySync, parseSync } from '../src/sync';
import type { Env } from '../src/env';
import { beginEscape, getEscape, activeEscape } from '../src/escape-db';
import { ESCAPE_CASES } from '../src/escape';
import { journeyBank } from '../src/journey-db';
import { loadPrior, teamProgress, ensureSeasonQuests } from '../src/team';
import { grantBingo, myBingo, weekOf } from '../src/bingo';
import { currentPeriod, markFlag, splitCycle } from '../src/bingo';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

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



async function memberRequest(db: D1Database, path: string, form: Record<string, string>) {
  const secret = 'local-review-only';
  const cookie = await signSession(secret, { uid: A, exp: Date.now() + 60000 });
  return app.request(path, {
    method: 'POST',
    headers: { Cookie: `hs=${cookie}` },
    body: new URLSearchParams(form),
  }, { DB: db, SESSION_SECRET: secret } as Env);
}

function fixture() {
  const env = fakeD1();
  env.sql.prepare("UPDATE members SET gender_chosen_at = '2026-01-01'").run();
  return env;
}

it.each(['perk', 'gear'] as const)('오래된 원정대 %s 폼이 다음 단계도 결제한다', async (kind) => {
  const { db, sql } = fixture();
  sql.prepare("INSERT INTO journey_bank (user_id, coins, mats, updated_at) VALUES (?, 1000, ?, 'x')")
    .run(A, '{"1":5,"2":5}');
  const form = { k: kind === 'perk' ? 'atk' : 'weapon' };
  const field = kind === 'perk' ? 'atk' : 'weapon';
  for (const level of [1, 2]) {
    const response = await memberRequest(db, `/api/journey/${kind}`, form);
    expect(response.status).toBe(303);
    expect((await journeyBank(db, A))[field]).toBe(level);
  }
  const bank = await journeyBank(db, A);
  expect(bank.coins).toBeLessThan(kind === 'perk' ? 980 : 970);
  if (kind === 'gear') expect(bank.mats[2]).toBe(3);
});

it('오래된 사건 목록이 현재 사건을 닫는다', async () => {
  const { db } = fixture();
  const [first, second] = ESCAPE_CASES;
  const old = await beginEscape(db, A, first!.id);
  expect(old).toBeTruthy();
  const switchTo = (id: string) => memberRequest(db, '/api/escape/start', { case: id, switch: '1' });
  expect((await switchTo(second!.id)).status).toBe(303);
  const newer = await activeEscape(db, A);
  expect(newer?.row.case_id).toBe(second!.id);
  expect((await switchTo(first!.id)).status).toBe(303);
  expect((await getEscape(db, A, newer!.row.id))?.row.status).toBe('quit');
  expect((await activeEscape(db, A))?.row.case_id).toBe(first!.id);
});

it('새 사건 INSERT가 실패하면 기존 판이 이미 닫혀 있다', async () => {
  const { db, sql } = fixture();
  const [first, second] = ESCAPE_CASES;
  const old = await beginEscape(db, A, first!.id);
  expect(old).toBeTruthy();
  sql.exec("CREATE TRIGGER review_fail_insert BEFORE INSERT ON escape_runs BEGIN SELECT RAISE(ABORT, 'review injected failure'); END");
  const response = await memberRequest(db, '/api/escape/start', { case: second!.id, switch: '1' });
  expect(response.headers.get('location')).toBe('/cases/room?n=error');
  expect((await getEscape(db, A, old!))?.row.status).toBe('quit');
  expect(await activeEscape(db, A)).toBeNull();
});




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

it('시작 당일의 이전 통화 참가자는 빠지고 14일 전 날짜는 들어간다', async () => {
  const { db, sql } = fixture();
  sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-11-12', 1), (?, '2026-10-29', 1)").run(A, B);
  expect([...(await loadPrior(db, SEASON)).voiced]).toEqual([B]);
});

it('14일 경계에 겹친 빙고 기간의 합계를 전부 가져온다', async () => {
  const { db, sql } = fixture();
  sql.prepare("INSERT INTO bingo_periods (id, starts_at, ends_at) VALUES ('prior', '2026-10-22T09:00:00.000Z', '2026-10-30T09:00:00.000Z')").run();
  sql.prepare("INSERT INTO bingo_pair (week, a, b, minutes) VALUES ('prior', ?, ?, 10)").run(A, B);
  expect((await loadPrior(db, SEASON)).minutes.get(`${A}|${B}`)).toBe(10);
});

it('같은 묶음의 탈퇴로 마지막 1분이 팀 통화에서 빠진다', async () => {
  const { db, sql } = fixture();
  seedSeason(sql);
  sql.prepare('INSERT INTO gq_pair (season_id, group_no, a, b, minutes) VALUES (?, 0, ?, ?, 29)').run(SEASON.id, A, B);
  const at = Date.parse(START) + 600000;
  const payload = syncPayload(at, {
    season: { start: START, end: END }, removed: [B],
    room_minutes: [{ at: new Date(at - 60000).toISOString(), room: ROOM, members: [A, B] }],
  }, 'leaver');
  expect(await applySync(db, payload, at)).toBe('applied');
  expect(sql.prepare('SELECT minutes FROM gq_pair').get()).toEqual({ minutes: 29 });
});

it('전체 목록에서 빠진 멤버가 활성으로 남는다', async () => {
  const { db, sql } = fixture();
  seedSeason(sql);
  const at = Date.parse(START) + 600000;
  const payload = syncPayload(at, {
    season: { start: START, end: END }, full_members: true,
    members: [{ id: A, name: 'A', joined_at: null, avatar_url: null }],
  }, 'snapshot');
  expect(await applySync(db, payload, at)).toBe('applied');
  expect(sql.prepare('SELECT active FROM members WHERE user_id = ?').get(B)).toEqual({ active: 1 });
});

it('유일한 짝이 29분에 떠나면 목표가 남아도 채울 수 없다', () => {
  expect(teamProgress([{ a: A, b: B }], new Map([[`${A}|${B}`, 29]]), new Set([B])))
    .toMatchObject({ candidates: [A], target: 1, achievers: [], bonus: false, complete: false });
});

it('과거 통화가 있는 중간 합류자가 자격을 충족해도 짝이 생성되지 않는다', async () => {
  const { db, sql } = fixture();
  seedSeason(sql);
  sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-11-05', 1), (?, '2026-11-05', 1), (?, '2026-11-05', 1)").run(A, B, C);
  const at = Date.parse(START) + 600000;
  expect(await ensureSeasonQuests(db, SEASON, at)).toBe(true);
  expect(await applySync(db, syncPayload(at, {
    season: { start: START, end: END },
    room_minutes: [{ at: new Date(at).toISOString(), room: ROOM, members: [A, C] }],
  }, 'latejoin'), at)).toBe('applied');
  expect(sql.prepare('SELECT group_no FROM season_members WHERE season_id = ? AND user_id = ?').get(SEASON.id, C)).toEqual({ group_no: 0 });
  expect(sql.prepare('SELECT a, b FROM team_pairs').all()).toEqual([{ a: A, b: B }]);
});

it('이전 빙고 지급 실패가 묶음 재전송과 현재 빙고 조회로 복구되지 않는다', async () => {
  const { db, sql } = fixture();
  const week = weekOf(Date.parse('2026-11-04T00:00:00Z'));
  for (let i = 2; i <= 8; i++) {
    sql.prepare('INSERT INTO bingo_day (week, user_id, day, minutes, crowd, night, attended) VALUES (?, ?, ?, 600, 600, 600, 1)')
      .run(week.id, A, `2026-11-0${i}`);
  }
  for (const id of [B, C, ...Array.from({ length: 8 }, (_, i) => `5${String(i).padStart(17, '0')}`)]) {
    sql.prepare("INSERT INTO bingo_pair (week, a, b, minutes) VALUES (?, ?, ?, 600)").run(week.id, A, id);
  }
  sql.prepare("INSERT INTO bingo_flag (week, user_id, flag) VALUES (?, ?, 'panel'), (?, ?, 'web')").run(week.id, A, week.id, A);
  const at = Date.parse(week.end) + 60000;
  const payload = syncPayload(at, { room_minutes: [{ at: new Date(at - 120000).toISOString(), room: ROOM, members: [A, B] }] }, 'late-bingo');
  sql.exec("CREATE TRIGGER review_fail_reward BEFORE INSERT ON bingo_lines BEGIN SELECT RAISE(ABORT, 'review injected failure'); END");
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(await applySync(db, payload, at)).toBe('applied');
    expect(errors).toHaveBeenCalledWith('빙고 보상 확인 실패', expect.any(Error));
  } finally {
    errors.mockRestore();
  }
  sql.exec('DROP TRIGGER review_fail_reward');
  expect(await applySync(db, payload, at)).toBe('duplicate');
  await myBingo(db, A, at);
  expect(sql.prepare('SELECT COUNT(*) AS n FROM bingo_lines WHERE week = ?').get(week.id)).toEqual({ n: 0 });
  const prior = await grantBingo(db, week, [A], at);
  expect(prior.get(A)?.lines.length).toBeGreaterThan(0);
});

it('시즌 첫 동기화가 같은 묶음의 시작 전 통화보다 먼저 짝을 확정한다', async () => {
  const { db, sql } = fixture();
  seedSeason(sql);
  sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-11-05', 1)").run(A);
  const at = Date.parse(START) + 600000;
  const earlier = '2026-11-11T09:00:00.000Z';
  expect(await applySync(db, syncPayload(at, {
    season: { start: START, end: END },
    room_minutes: [{ at: earlier, room: ROOM, members: [A, B] }],
  }, 'first-sync'), at)).toBe('applied');
  expect((await loadPrior(db, SEASON)).voiced.has(B)).toBe(true);
  expect(sql.prepare('SELECT a, b FROM team_pairs').all()).toEqual([]);
  expect(await ensureSeasonQuests(db, SEASON, at)).toBe(false);
});



it('월요일 오후 시작 주기가 오전 임시 빙고의 같은 ID 플래그를 물려받는다', async () => {
  const { db, sql } = fixture();
  const start = '2026-11-09T09:00:00.000Z';
  const end = '2026-11-23T09:00:00.000Z';
  const before = Date.parse(start) - 3600000;
  const after = Date.parse(start) + 60000;
  const fallback = await currentPeriod(db, before);
  expect(await markFlag(db, A, 'panel', before)).toBe(true);
  const [half] = splitCycle(start, end);
  sql.prepare('INSERT INTO bingo_periods (id, starts_at, ends_at) VALUES (?, ?, ?)').run(half!.id, half!.start, half!.end);
  const current = await currentPeriod(db, after);
  expect(current.start).not.toBe(fallback.start);
  expect(current.id).toBe(fallback.id);
  expect(await markFlag(db, A, 'panel', after)).toBe(false);
});

it('이전 시즌 날짜의 지연 출석만으로 새 시즌 모둠에 합류한다', async () => {
  const { db, sql } = fixture();
  seedSeason(sql);
  const at = Date.parse(START) + 600000;
  expect(await applySync(db, syncPayload(at, {
    season: { start: START, end: END },
    attendance: [{ id: C, day: '2026-11-11' }],
  }, 'old-attendance'), at)).toBe('applied');
  expect(sql.prepare('SELECT group_no FROM season_members WHERE season_id = ? AND user_id = ?').get(SEASON.id, C)).toEqual({ group_no: 0 });
  expect(sql.prepare('SELECT day FROM gq_attend WHERE season_id = ? AND user_id = ?').all(SEASON.id, C)).toEqual([]);
});
