// 디스코드 서버 부스터 혜택(나리 2026-11-21): 칭호·💎·달마다 젤리, 겜블장 하루 젤칩, 원정대 재료 확률, 사건파일 등급·동전
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { applySync, parseSync } from '../src/sync';
import { boosterDueMonth, kstMonth } from '../src/booster';
import { equipTitle, listTitleJobs, ownedTitles, recordEarnedTitles, loadTitleStats } from '../src/title-db';
import { claimDaily } from '../src/gamble-db';
import { escGrade, coinsLeft, startEscape, ESCAPE_CASES, escCase, type EscState } from '../src/escape';

const A = '111111111111111111';
const B = '222222222222222222';

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
        const out = list.map((s) =>
          /^\s*SELECT/i.test(s.query)
            ? { results: sql.prepare(s.query).all(...(s.args as never[])), meta: { changes: 0 } }
            : { results: [], meta: { changes: Number(sql.prepare(s.query).run(...(s.args as never[])).changes) } },
        );
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sql, db: db as unknown as D1Database };
}

let n = 0;
async function sync(db: D1Database, nowMs: number, members: Record<string, unknown>[]) {
  const r = parseSync({ batch_id: `${new Date(nowMs).toISOString()}-${++n}`, members });
  if (!r.ok) throw new Error(r.error);
  return applySync(db, r.value, nowMs);
}
const jelly = (sql: DatabaseSync, id: string) => Number((sql.prepare('SELECT dogam_jelly AS j FROM profiles WHERE user_id = ?').get(id) as { j: number } | undefined)?.j ?? 0);
const at = (iso: string) => Date.parse(iso);

describe('부스트 결제일 계산', () => {
  it('지난 결제일의 한국 달을 돌려줘요', () => {
    expect(boosterDueMonth('2026-10-25T03:00:00Z', at('2026-11-21T00:00:00Z'))).toBe('2026-10');
    expect(boosterDueMonth('2026-10-25T03:00:00Z', at('2026-11-25T03:00:00Z'))).toBe('2026-11');
    expect(boosterDueMonth('2026-11-05T03:00:00Z', at('2026-11-21T00:00:00Z'))).toBe('2026-11');
    expect(boosterDueMonth('2026-11-05T03:00:00Z', at('2026-12-04T00:00:00Z'))).toBe('2026-11');
    expect(boosterDueMonth('2026-11-05T03:00:00Z', at('2026-12-05T04:00:00Z'))).toBe('2026-12');
    // 1월 31일 시작이면 2월은 마지막 날
    expect(boosterDueMonth('2026-01-31T03:00:00Z', at('2026-02-28T05:00:00Z'))).toBe('2026-02');
    expect(boosterDueMonth('2026-01-31T03:00:00Z', at('2026-02-27T05:00:00Z'))).toBe('2026-01');
    // 1월이면 지난해 12월
    expect(boosterDueMonth('2026-11-20T03:00:00Z', at('2027-01-10T00:00:00Z'))).toBe('2026-12');
    // 모르면 이번 달
    expect(boosterDueMonth(null, at('2026-11-21T00:00:00Z'))).toBe(kstMonth(at('2026-11-21T00:00:00Z')));
  });
});

describe('동기화로 받는 부스터 혜택', () => {
  it('처음에는 지금 부스터 모두 이번 달 젤리 1개, 다음부터는 결제일마다 한 번', async () => {
    const { sql, db } = fakeD1();
    const t0 = at('2026-11-21T00:00:00Z');
    await sync(db, t0, [
      { id: A, name: 'a', booster: true, booster_since: '2026-10-25T03:00:00Z' },
      { id: B, name: 'b', booster: false },
    ]);
    expect(jelly(sql, A)).toBe(1);
    expect(jelly(sql, B)).toBe(0);
    expect(sql.prepare("SELECT COUNT(*) AS c FROM alerts WHERE user_id = ? AND ref LIKE 'booster-%'").get(A)).toEqual({ c: 1 });
    // 같은 날 다시 와도, 11월 결제일(25일)이 와도 이번 달은 이미 받았어요
    await sync(db, t0 + 3600_000, [{ id: A, name: 'a', booster: true, booster_since: '2026-10-25T03:00:00Z' }]);
    await sync(db, at('2026-11-26T00:00:00Z'), [{ id: A, name: 'a', booster: true, booster_since: '2026-10-25T03:00:00Z' }]);
    expect(jelly(sql, A)).toBe(1);
    // 12월 결제일 전에는 아직
    await sync(db, at('2026-12-20T00:00:00Z'), [{ id: A, name: 'a', booster: true, booster_since: '2026-10-25T03:00:00Z' }]);
    expect(jelly(sql, A)).toBe(1);
    await sync(db, at('2026-12-25T04:00:00Z'), [{ id: A, name: 'a', booster: true, booster_since: '2026-10-25T03:00:00Z' }]);
    expect(jelly(sql, A)).toBe(2);
  });

  it('결제일 다음 날 받아도 다음 달 결제일을 놓치지 않아요(31일 시작)', async () => {
    const { sql, db } = fakeD1();
    const since = '2026-12-31T11:00:00Z'; // 한국 12월 31일 20시
    const m = [{ id: A, name: 'a', booster: true, booster_since: since }];
    await sync(db, at('2027-01-05T03:00:00Z'), m); // 처음 지급(1월)
    expect(jelly(sql, A)).toBe(1);
    await sync(db, at('2027-02-28T03:00:00Z'), m); // 2월 28일 정오: 결제일(20시) 전
    expect(jelly(sql, A)).toBe(1);
    await sync(db, at('2027-03-01T03:00:00Z'), m); // 3월 1일: 2월 몫
    expect(jelly(sql, A)).toBe(2);
    // 알림 번호는 젤리를 준 달(결제일 몫)과 같아요. 3월 1일에 받은 2월 몫이 3월 번호를 쓰면 3월 몫 알림과 겹쳐요(2026-11-21 점검).
    expect(sql.prepare("SELECT ref FROM alerts WHERE user_id = ? AND ref LIKE 'booster-%' ORDER BY created_at DESC LIMIT 1").get(A)).toEqual({ ref: 'booster-2027-02' });
    await sync(db, at('2027-03-31T12:00:00Z'), m); // 3월 31일 21시: 3월 몫
    expect(jelly(sql, A)).toBe(3);
    expect(sql.prepare("SELECT ref FROM alerts WHERE user_id = ? AND ref = 'booster-2027-03'").all(A)).toHaveLength(1);
  });

  it('시작일을 빼고 보내면 적어 둔 결제일을 그대로 써요', async () => {
    const { sql, db } = fakeD1();
    await sync(db, at('2026-11-21T00:00:00Z'), [{ id: A, name: 'a', booster: true, booster_since: '2026-10-25T03:00:00Z' }]);
    expect(jelly(sql, A)).toBe(1);
    await sync(db, at('2026-12-01T03:00:00Z'), [{ id: A, name: 'a', booster: true }]);
    expect(jelly(sql, A)).toBe(1);
    await sync(db, at('2026-12-25T04:00:00Z'), [{ id: A, name: 'a', booster: true }]);
    expect(jelly(sql, A)).toBe(2);
    // 끊으면 시작일도 지워요
    await sync(db, at('2026-12-26T00:00:00Z'), [{ id: A, name: 'a', booster: false }]);
    expect(sql.prepare('SELECT booster_since FROM members WHERE user_id = ?').get(A)).toEqual({ booster_since: null });
  });

  it('booster를 안 보내는 예전 봇 묶음은 값을 그대로 둬요', async () => {
    const { sql, db } = fakeD1();
    const t0 = at('2026-11-21T00:00:00Z');
    await sync(db, t0, [{ id: A, name: 'a', booster: true }]);
    await sync(db, t0 + 1000, [{ id: A, name: 'a' }]);
    expect(sql.prepare('SELECT booster FROM members WHERE user_id = ?').get(A)).toEqual({ booster: 1 });
  });

  it('잘못된 값은 묶음을 거절해요', () => {
    expect(parseSync({ batch_id: 'x', members: [{ id: A, name: 'a', booster: 'yes' }] }).ok).toBe(false);
    expect(parseSync({ batch_id: 'x', members: [{ id: A, name: 'a', booster: true, booster_since: 'nope' }] }).ok).toBe(false);
  });

  it('「부스터」 칭호는 부스트 중에만 쓰고, 끊으면 떼져요', async () => {
    const { sql, db } = fakeD1();
    const t0 = Date.now();
    await sync(db, t0, [{ id: A, name: 'a', booster: false }]);
    expect(await equipTitle(db, A, 'booster')).toBe(false);
    expect((await ownedTitles(db, A)).has('booster')).toBe(false);
    await sync(db, t0 + 1000, [{ id: A, name: 'a', booster: true }]);
    expect((await ownedTitles(db, A)).has('booster')).toBe(true);
    expect(await equipTitle(db, A, 'booster')).toBe(true);
    // 얻은 기록(owned_items)으로 남지 않아요
    const stats = await loadTitleStats(db, A, new Date().toISOString());
    expect(stats.booster).toBe(true);
    expect(await recordEarnedTitles(db, A, stats, new Set())).not.toContain('booster');
    expect(sql.prepare("SELECT COUNT(*) AS c FROM owned_items WHERE item_id = 'title:booster'").get()).toEqual({ c: 0 });
    sql.prepare("UPDATE profiles SET title_applied = 'booster' WHERE user_id = ?").run(A);
    await sync(db, t0 + 2000, [{ id: A, name: 'a', booster: false }]);
    expect(sql.prepare('SELECT title_id FROM profiles WHERE user_id = ?').get(A)).toEqual({ title_id: null });
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: '', title: null }]);
    expect((await ownedTitles(db, A)).has('booster')).toBe(false);
  });

  it('겜블장: 시작 칩은 누구나 1000, 0개일 때 채우기는 부스터 400·아니면 300', async () => {
    const { db } = fakeD1();
    const t0 = Date.now();
    await sync(db, t0, [{ id: A, name: 'a', booster: true }, { id: B, name: 'b', booster: false }]);
    const now = new Date().toISOString();
    expect(await claimDaily(db, A, now)).toBe(1000);
    expect(await claimDaily(db, B, now)).toBe(1000);
    expect(await claimDaily(db, A, now)).toBe(0);
    await db.prepare("UPDATE gamble_accounts SET chips = 0, free_day = '2000-01-01'").run();
    expect(await claimDaily(db, A, now)).toBe(400);
    expect(await claimDaily(db, B, now)).toBe(300);
  });
});

describe('사건파일 부스터', () => {
  const c = escCase(ESCAPE_CASES[0]!.id)!;
  const st = (p: Partial<EscState>): EscState => ({ ...startEscape(c), ...p });
  it('등급 기준이 1번 넉넉해요', () => {
    expect(escGrade(st({ mistakes: 2 }))).toBe('A');
    expect(escGrade(st({ mistakes: 2, bst: 1 }))).toBe('S');
    expect(escGrade(st({ mistakes: 1, hints: 3, bst: 1 }))).toBe('A');
    expect(escGrade(st({ mistakes: 8, bst: 1 }))).toBe('C');
    expect(escGrade(st({ mistakes: 7, bst: 1 }))).toBe('B');
  });
  it('선물 동전도 힌트에 쓸 수 있어요', () => {
    expect(coinsLeft(st({ gift: 1 }))).toBe(1);
    expect(coinsLeft(st({ gift: 1, spent: 1 }))).toBe(0);
  });
});

describe('사건파일 부스터 첫 사건 동전', () => {
  it('재수사·오늘의 사건을 먼저 해도 그날 첫 보통 사건은 동전을 받아요', async () => {
    const { sql, db } = fakeD1();
    const now = new Date();
    await sync(db, now.getTime(), [{ id: A, name: 'a', booster: true }]);
    const { beginEscape, getEscape } = await import('../src/escape-db');
    // 오늘 이미 끝낸 오늘의 사건(재수사 규칙 판)
    sql.prepare(`INSERT INTO escape_runs (id, user_id, case_id, state, status, started_at, updated_at)
      VALUES ('d1', ?, ?, '{"re":1,"daily":"x"}', 'done', ?, ?)`).run(A, ESCAPE_CASES[0]!.id, now.toISOString(), now.toISOString());
    const id = await beginEscape(db, A, ESCAPE_CASES[0]!.id, now);
    expect(id).toBeTruthy();
    expect((await getEscape(db, A, id!))?.state.gift).toBe(1);
    // 보통 판을 한 번 했으면 그다음 판은 동전이 없어요
    sql.prepare(`UPDATE escape_runs SET status = 'quit' WHERE id = ?`).run(id);
    const second = await beginEscape(db, A, ESCAPE_CASES[1]!.id, now);
    expect((await getEscape(db, A, second!))?.state.gift).toBeUndefined();
  });
});
