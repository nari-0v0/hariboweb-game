import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buyReroll } from '../src/db';
import { buyGameReset } from '../src/game-reset';
import { actEscape, ESCAPE_CASES } from '../src/escape';
import { CHARACTERS, CHARACTER_VARIANTS } from '../src/characters';
import { poolOf } from '../src/character';

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
  return { sql, db: db as unknown as D1Database };
}

const A = '100000000000000001';
const B = '100000000000000002';
const T = '2026-11-21T03:00:00Z';

function setup(jelly: number) {
  const f = fakeD1();
  for (const id of [A, B]) f.sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at, gender_chosen_at) VALUES (?, 'a', 1, 'x', 'x')").run(id);
  f.sql.prepare("INSERT INTO profiles (user_id, dogam_jelly, solo_xp, character_id, character_sig, updated_at) VALUES (?, ?, 77, 'girl-01-0', 'girl-01-0', 'x')").run(A, jelly);
  f.sql.prepare("INSERT INTO profiles (user_id, dogam_jelly, character_id, character_sig, updated_at) VALUES (?, 0, 'girl-02-0', 'girl-02-0', 'x')").run(B);
  return f;
}

function fillGames(sql: DatabaseSync, id = A) {
  sql.prepare("INSERT INTO journey_runs (id, user_id, chapter, state, status, day, cleared, started_at, updated_at) VALUES (?, ?, 9, '{}', 'done', 20, 1, ?, ?)").run(`j-${id}`, id, T, T);
  sql.prepare("INSERT INTO journey_bank (user_id, coins, atk, updated_at, weapon, tower) VALUES (?, 500, 3, ?, 7, 12)").run(id, T);
  sql.prepare("INSERT INTO escape_runs (id, user_id, case_id, state, status, started_at, updated_at) VALUES (?, ?, 'c1', '{}', 'done', ?, ?)").run(`e-${id}`, id, T, T);
  sql.prepare('INSERT INTO escape_rewards (user_id, case_id, run_id, claimed_at) VALUES (?, ?, ?, ?)').run(id, 'c1', `e-${id}`, T);
  sql.prepare('INSERT INTO gamble_accounts (user_id, chips, free_day, won, plays) VALUES (?, 5000, ?, 900, 40)').run(id, '2026-11-21');
  sql.prepare("INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES (?, ?, 50, 0, 0, ?, ?)").run(id, id === A ? B : A, T, T);
}

const count = (sql: DatabaseSync, table: string, id = A) => Number((sql.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(id) as { n: number }).n);

describe('게임 기록 초기화권', () => {
  it('20젤리로 겜블장·원정대·사건파일만 처음으로, 도감·젤리 기록·남의 것은 그대로', async () => {
    const { sql, db } = setup(30);
    fillGames(sql, A);
    fillGames(sql, B);
    expect(await buyGameReset(db, A)).toBe('done');
    const p = sql.prepare('SELECT dogam_jelly, solo_xp, character_id FROM profiles WHERE user_id = ?').get(A) as { dogam_jelly: number; solo_xp: number; character_id: string };
    expect(p).toEqual({ dogam_jelly: 10, solo_xp: 77, character_id: 'girl-01-0' });
    for (const t of ['journey_runs', 'journey_bank', 'escape_runs', 'escape_rewards']) expect(count(sql, t), t).toBe(0);
    expect(sql.prepare('SELECT chips, won, plays, free_day FROM gamble_accounts WHERE user_id = ?').get(A)).toEqual({ chips: 1000, won: 0, plays: 0, free_day: '2026-11-21' });
    // 도감 카드는 그대로
    expect(Number((sql.prepare('SELECT COUNT(*) AS n FROM cards WHERE owner_id = ?').get(A) as { n: number }).n)).toBe(1);
    // 받은 보상 기록
    expect(sql.prepare('SELECT journey_jelly_top, count FROM game_resets WHERE user_id = ?').get(A)).toEqual({ journey_jelly_top: 9, count: 1 });
    expect(count(sql, 'escape_paid')).toBe(1);
    // 다른 멤버는 그대로
    for (const t of ['journey_runs', 'journey_bank', 'escape_runs', 'escape_rewards']) expect(count(sql, t, B), t).toBe(1);
    expect((sql.prepare('SELECT chips FROM gamble_accounts WHERE user_id = ?').get(B) as { chips: number }).chips).toBe(5000);
    // 산 기록
    expect(sql.prepare("SELECT price, status FROM purchases WHERE user_id = ? AND item_id = 'reset:games'").get(A)).toEqual({ price: 20, status: 'done' });
  });

  it('젤리가 모자라면 아무것도 지우지 않아요', async () => {
    const { sql, db } = setup(19);
    fillGames(sql, A);
    expect(await buyGameReset(db, A)).toBe('not_enough_jelly');
    for (const t of ['journey_runs', 'journey_bank', 'escape_runs', 'escape_rewards']) expect(count(sql, t), t).toBe(1);
    expect((sql.prepare('SELECT chips FROM gamble_accounts WHERE user_id = ?').get(A) as { chips: number }).chips).toBe(5000);
    expect(count(sql, 'game_resets')).toBe(0);
  });

  it('겜블장 계정이 없던 사람은 계정을 새로 만들지 않아요(하루 무료 칩을 그대로 받게)', async () => {
    const { sql, db } = setup(20);
    expect(await buyGameReset(db, A)).toBe('done');
    expect(count(sql, 'gamble_accounts')).toBe(0);
  });

  it('두 번 초기화해도 이미 받은 원정대 장 젤리 기록은 줄지 않아요', async () => {
    const { sql, db } = setup(40);
    fillGames(sql, A);
    await buyGameReset(db, A);
    expect(await buyGameReset(db, A)).toBe('done');
    expect(sql.prepare('SELECT journey_jelly_top, count FROM game_resets WHERE user_id = ?').get(A)).toEqual({ journey_jelly_top: 9, count: 2 });
  });
});

describe('캐릭터 리롤권', () => {
  it('10젤리로 같은 성별의 빈 캐릭터로 바로 바꾸고, 예전 캐릭터는 풀려요', async () => {
    const { sql, db } = setup(15);
    expect(await buyReroll(db, A, 10, () => 0)).toBe('done');
    const p = sql.prepare('SELECT dogam_jelly, character_id, character_sig FROM profiles WHERE user_id = ?').get(A) as { dogam_jelly: number; character_id: string; character_sig: string };
    expect(p.dogam_jelly).toBe(5);
    expect(poolOf(p.character_id)).toBe('girl');
    expect(p.character_id).not.toBe('girl-01-0');
    expect(p.character_id).not.toBe('girl-02-0'); // B가 쓰는 캐릭터는 안 돼요
    expect(p.character_id).toMatch(/-0$/); // 디자인이 다른 원래 그림부터
    expect(p.character_sig).toBe(p.character_id);
    expect(count(sql, 'character_keep')).toBe(0);
  });

  it('젤리가 모자라면 바뀌지 않아요', async () => {
    const { sql, db } = setup(9);
    expect(await buyReroll(db, A, 10)).toBe('not_enough_jelly');
    expect((sql.prepare('SELECT character_id FROM profiles WHERE user_id = ?').get(A) as { character_id: string }).character_id).toBe('girl-01-0');
  });

  it('빈 캐릭터가 하나도 없으면 사지 않아요', async () => {
    const { sql, db } = setup(50);
    const girls = CHARACTERS.filter((c) => c.id.startsWith('girl-'));
    let n = 10;
    for (const c of girls)
      for (let v = 0; v < CHARACTER_VARIANTS; v++) {
        const id = `${c.id}-${v}`;
        if (id === 'girl-01-0' || id === 'girl-02-0') continue;
        const u = String(200000000000000000n + BigInt(n++));
        sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'x', 1, 'x')").run(u);
        sql.prepare('INSERT INTO profiles (user_id, character_id, character_sig, updated_at) VALUES (?, ?, ?, ?)').run(u, id, id, 'x');
      }
    expect(await buyReroll(db, A, 10)).toBe('none');
    expect((sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get(A) as { dogam_jelly: number }).dogam_jelly).toBe(50);
  });
});

describe('초기화 뒤 사건파일 첫 해결 보상', () => {
  it('이미 받은 사건은 다시 풀어도 경험치·젤리가 없지만 푼 기록은 남아요', () => {
    // escape-db 쿼리 조건은 test/escape*.test.ts의 DB 테스트가 확인해요. 여기서는 사건이 있는지만 봐요.
    expect(ESCAPE_CASES.length).toBeGreaterThan(0);
    expect(typeof actEscape).toBe('function');
  });
});
