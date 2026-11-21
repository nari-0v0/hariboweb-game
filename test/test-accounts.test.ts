import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { completion, countActiveMembers, countOwnedCards, listDogam, setDeco } from '../src/db';
import { applySync, parseSync } from '../src/sync';
import { TEST_MEMBER_IDS, isTestMember, notTestMember } from '../src/test-accounts';
import { REWARD_COUNT, rewardNeed, SHOP_ITEMS } from '../src/shop';
import { dogamProgress } from '../src/unlock';
import { ensureSeason } from '../src/season';
import { loadRankings } from '../src/rankings';

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

  it('예전 테스트 카드는 게임 해금 조건에서도 세지 않아요', async () => {
    const { sql, db } = fakeD1();
    await applySync(db, payload('t4'));
    sql.prepare("INSERT INTO cards (owner_id, target_id, xp, voice_seconds, scrims, first_met, updated_at) VALUES (?, ?, 5, 0, 0, '2026-11-01', '2026-11-01')").run(A, T);
    expect((await dogamProgress(db, A)).cards).toBe(1);
  });

  it('도감 순위: 테스트 계정이 예전에 모은 카드로 순위에 오르지 않아요(Codex #323)', async () => {
    const { sql, db } = fakeD1();
    for (const id of [A, B, T]) sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, `이름${id.slice(0, 2)}`);
    sql.prepare("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, 10, '2026-11-20T00:00:00Z', 'x')").run(T, A);
    sql.prepare("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, 10, '2026-11-20T00:00:00Z', 'x')").run(B, A);
    const r = JSON.stringify(await loadRankings(db, A, Date.parse('2026-11-21T05:00:00Z'), 'dogam'));
    expect(r).toContain(`이름${B.slice(0, 2)}`);
    expect(r).not.toContain(`이름${T.slice(0, 2)}`);
  });

  it('시즌 팀: 테스트 계정은 안 들어가고, 이 계정 값 때문에 활동 기준이 바뀌지 않아요', async () => {
    const { sql, db } = fakeD1();
    for (const id of [A, B, T]) sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, ?, 1, 'x')").run(id, id);
    // 예전 봇처럼 실제 멤버는 초록하리보 값이 없고(NULL), 테스트 계정만 값이 있어요
    sql.prepare('UPDATE members SET green = 0 WHERE user_id = ?').run(T);
    for (const id of [A, B, T]) sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-11-05', 30)").run(id);
    const season = { id: '2026-11-12', start: '2026-11-12T09:00:00.000Z', end: '2026-11-26T09:00:00.000Z' };
    expect(await ensureSeason(db, season, Date.parse(season.start) + 1000)).toBe(true);
    const ids = (sql.prepare('SELECT user_id FROM season_members ORDER BY user_id').all() as { user_id: string }[]).map((r) => r.user_id);
    expect(ids).toEqual([A, B]);
  });
});
