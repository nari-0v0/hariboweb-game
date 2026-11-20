import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { completion, countActiveMembers, countOwnedCards, listDogam, setDeco } from '../src/db';
import { applySync, parseSync } from '../src/sync';
import { TEST_MEMBER_IDS, isTestMember, notTestMember } from '../src/test-accounts';
import { REWARD_COUNT, rewardNeed, SHOP_ITEMS } from '../src/shop';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

const A = '111111111111111111';
const B = '222222222222222222';
const T = TEST_MEMBER_IDS[0]; // 실험 98

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

function payload(id: string) {
  const r = parseSync({
    batch_id: `${new Date().toISOString()}-${id}`,
    members: [
      { id: A, name: 'a' },
      { id: B, name: 'b' },
      { id: T, name: '실험 98', is_newbie: true, green: true },
    ],
    pair_xp: [
      { a: A, b: B, xp: 10, at: '2026-11-01T00:00:00Z' },
      { a: A, b: T, xp: 10, at: '2026-11-01T00:00:00Z' },
    ],
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('테스트 계정(실험 98)', () => {
  it('목록에 실험 98이 있고 SQL 조건은 숫자 ID만 넣어요', () => {
    expect(isTestMember('1270353217968148536')).toBe(true);
    expect(isTestMember(A)).toBe(false);
    expect(notTestMember('m.user_id')).toBe("m.user_id NOT IN ('1270353217968148536')");
  });

  it('로그인 멤버로는 남지만 인원·도감·카드에서 빠져요', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, payload('t1'));
    // 계정은 그대로 활성(로그인·테스트는 돼요)
    expect((sql.prepare('SELECT active, green, is_newbie FROM members WHERE user_id = ?').get(T) as Record<string, number>)).toEqual({ active: 1, green: 0, is_newbie: 0 });
    // 함께한 경험치로 카드가 생기지 않아요(양쪽 모두)
    expect(sql.prepare('SELECT COUNT(*) AS n FROM cards WHERE owner_id = ? OR target_id = ?').get(T, T)).toEqual({ n: 0 });
    // 서버 인원은 A, B 두 명
    expect(await countActiveMembers(db)).toBe(2);
    // A의 도감에는 B만 있어요
    const entries = await listDogam(db, A);
    expect(entries.map((e) => e.user_id)).toEqual([B]);
    expect(completion(entries)).toEqual({ owned: 1, total: 1 });
    expect(await countOwnedCards(db, A)).toBe(1);
  });

  it('예전에 생긴 테스트 계정 카드는 세지 않아요', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, payload('t2'));
    sql.prepare("INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES (?, ?, 5, 0, 0, '2026-11-01', '2026-11-01')").run(A, T);
    expect(await countOwnedCards(db, A)).toBe(1);
    expect(completion(await listDogam(db, A))).toEqual({ owned: 1, total: 1 });
  });

  it('마지막 보상(로봇 기사)은 테스트 계정 없이 나 빼고 모두 모으면 열려요', async () => {
    const { db } = fakeD1();
    await applySync(db, payload('t3'));
    const last = SHOP_ITEMS.find((i) => i.rewardRank === REWARD_COUNT)!;
    expect(last.key).toBe('robot');
    const members = await countActiveMembers(db);
    expect(rewardNeed(REWARD_COUNT, members)).toBe(1); // 나(A) 빼고 B 한 명
    expect(await setDeco(db, A, 'robot')).toBe(true);
  });
});
