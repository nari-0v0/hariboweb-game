import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TITLES, TITLE_GROUPS, TITLE_MAX, visibleTitles, stripTitle, titleById, titleProgress, type TitleStats } from '../src/titles';
import { buyTitle, equipTitle, listTitleJobs, loadTitleStats, ownedTitles, recordEarnedTitles, settleTitle, titleState } from '../src/title-db';
import { xpForLevel } from '../src/levels';

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
            ? { results: sql.prepare(s.query).all(...(s.args as never[])) }
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

const A = '100000000000000001';
const B = '100000000000000002';

function setup(jelly = 0) {
  const f = fakeD1();
  for (const id of [A, B]) f.sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'a', 1, 'x')").run(id);
  f.sql.prepare("INSERT INTO profiles (user_id, dogam_jelly, updated_at) VALUES (?, ?, 'x')").run(A, jelly);
  return f;
}

const empty: TitleStats = { bestXp: 0, ownXp: 0, friendXps: [], cards: 0, seasons: [], fullClears: 0, bingoLines: 0, bingoFull: 0, praiseGot: 0, praiseGave: 0, voiceSeconds: 0 };
const byName = (name: string) => TITLES.find((t) => t.name === name)!;

describe('도감 칭호', () => {
  it('칭호는 500개쯤, 서버 태그처럼 4글자까지, 이름과 id는 겹치지 않아요', () => {
    expect(TITLES.length).toBeGreaterThanOrEqual(500);
    expect(new Set(TITLES.map((t) => t.name)).size).toBe(TITLES.length);
    expect(TITLES.every((t) => [...t.name].length <= TITLE_MAX && !/[\s\u300c\u300d]/.test(t.name))).toBe(true);
    expect(new Set(TITLES.map((t) => t.id)).size).toBe(TITLES.length);
    expect(TITLES.every((t) => /^[a-z0-9-]{1,32}$/.test(t.id))).toBe(true);
    expect(TITLES.some((t) => /하리보|곰돌/.test(t.name))).toBe(false);
  });

  it('늙크크·딸피·영크크는 유행어 묶음(30젤리)에 있고, 예전 상점 칭호 id는 그대로예요', () => {
    for (const name of ['늙크크', '딸피', '영크크']) expect(byName(name)).toMatchObject({ group: '유행어', rule: { kind: 'shop', price: 30 } });
    expect(titleById('shop-1')?.name).toBe('MOOD');
    expect(byName('레디언트').id).toBe(`shop-${TITLES.filter((t) => t.rule.kind === 'shop').length - 3}`);
    expect(TITLE_GROUPS.filter((g) => g === '유행어')).toHaveLength(1);
  });

  it('자음만 있는 상점 칭호(ㄱㄱ·ㅇㅈ·ㄹㅇ)는 더 팔지 않고, id는 그대로예요', async () => {
    const jamo = TITLES.filter((t) => t.rule.kind === 'shop' && /^[\u3131-\u314E]+$/.test(t.name));
    expect(jamo.map((t) => [t.id, t.name])).toEqual([['shop-156', 'ㄱㄱ'], ['shop-157', 'ㅇㅈ'], ['shop-161', 'ㄹㅇ']]);
    expect(jamo.every((t) => t.retired)).toBe(true);
    expect(visibleTitles(new Set()).some((t) => jamo.includes(t))).toBe(false);
    expect(visibleTitles(new Set(['shop-156'])).some((t) => t.id === 'shop-156')).toBe(true);
    const f = setup(100);
    expect(await buyTitle(f.db, A, jamo[0]!)).toBe('not_for_sale');
  });

  it('닉네임에서 칭호와 왕관 떼기', () => {
    expect(stripTitle('「ACE」 냥이 03')).toBe('냥이 03');
    expect(stripTitle('👑 「ACE」 냥이 03 👑')).toBe('냥이 03');
    expect(stripTitle('냥이 03')).toBe('냥이 03');
    expect(stripTitle('[ACE] 03')).toBe('[ACE] 03');
    expect(stripTitle('「TOOLONG」 냥이')).toBe('「TOOLONG」 냥이');
  });

  it('조건: 카드 레벨, 퀘스트 성공률', () => {
    const bff = titleById('lv-30')!;
    expect(titleProgress(bff, { ...empty, bestXp: xpForLevel(29) }).ok).toBe(false);
    expect(titleProgress(bff, { ...empty, bestXp: xpForLevel(30) }).ok).toBe(true);
    const ace = titleById('rate-s2-80')!;
    // 시즌 1번만으로는 안 열려요
    expect(titleProgress(ace, { ...empty, seasons: [{ done: 8, total: 8 }] }).ok).toBe(false);
    expect(titleProgress(ace, { ...empty, seasons: [{ done: 8, total: 8 }, { done: 5, total: 8 }] }).ok).toBe(true); // 13/16 = 81%
    expect(titleProgress(ace, { ...empty, seasons: [{ done: 6, total: 8 }, { done: 6, total: 8 }] }).ok).toBe(false); // 75%
  });

  it('조건을 채우면 칭호를 얻고, 끝난 시즌의 퀘스트 성공률을 세요', async () => {
    const { sql, db } = setup();
    sql.exec(`INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES ('${A}', '${B}', ${xpForLevel(30)}, 'x', 'x')`);
    sql.exec(`INSERT INTO seasons VALUES ('2026-10-01', '2026-10-01T00:00:00Z', '2026-10-15T00:00:00Z', 'x'), ('2026-10-15', '2026-10-15T00:00:00Z', '2026-10-29T00:00:00Z', 'x'), ('2026-10-29', '2026-10-29T00:00:00Z', '2099-01-01T00:00:00Z', 'x')`);
    for (const s of ['2026-10-01', '2026-10-15', '2026-10-29']) {
      sql.exec(`INSERT INTO season_members VALUES ('${s}', '${A}', 1, 1, 'x', NULL)`);
      for (let slot = 0; slot < 8; slot++) sql.exec(`INSERT INTO season_quests VALUES ('${s}', 1, ${slot}, 'q', ${slot < 7 ? "'d'" : 'NULL'})`);
    }
    const stats = await loadTitleStats(db, A, '2026-11-03T00:00:00Z');
    // 빙고: 다 채운 판 보너스(8번)는 줄로 세지 않아요
    sql.exec(`INSERT INTO bingo_lines VALUES ('w1', '${A}', 0, 'm', 'x'), ('w1', '${A}', 8, 'm', 'x')`);
    const b = await loadTitleStats(db, A, '2026-11-03T00:00:00Z');
    expect([b.bingoLines, b.bingoFull]).toEqual([1, 1]);
    // 아직 안 끝난 시즌은 세지 않아요
    expect(stats.seasons).toEqual([{ done: 7, total: 8 }, { done: 7, total: 8 }]);
    const owned = await ownedTitles(db, A);
    const fresh = await recordEarnedTitles(db, A, stats, owned);
    expect(fresh.sort()).toEqual(
      ['friends30-1', 'lv-10', 'lv-15', 'lv-20', 'lv-25', 'lv-30', 'lv-5', 'rate-s2-30', 'rate-s2-50', 'rate-s2-70', 'rate-s2-80', 'season-1', 'season-2'].sort(),
    );
    // 다시 열면 새로 얻은 건 없어요
    expect(await recordEarnedTitles(db, A, stats, await ownedTitles(db, A))).toEqual([]);
  });

  it('상점 칭호는 도감 젤리로 사고, 상점 결과 팝업에는 다시 안 떠요', async () => {
    const { sql, db } = setup(40);
    expect(await buyTitle(db, A, titleById('rate-s2-80')!)).toBe('not_for_sale');
    expect(await buyTitle(db, A, byName('MOOD'))).toBe('done'); // 10
    expect(await buyTitle(db, A, byName('MOOD'))).toBe('owned');
    expect(await buyTitle(db, A, byName('구름'))).toBe('not_enough_jelly'); // 50
    expect((sql.prepare('SELECT dogam_jelly FROM profiles WHERE user_id = ?').get(A) as { dogam_jelly: number }).dogam_jelly).toBe(30);
    expect([...(await ownedTitles(db, A))]).toEqual([byName('MOOD').id]);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM purchases WHERE seen_at IS NULL').get()).toEqual({ n: 0 });
  });

  it('고르면 봇 목록에 나오고, 봇이 알리면 빠져요. 같은 칭호를 다시 고르면 다시 붙여 봐요', async () => {
    const { db, sql } = setup();
    for (const id of ['shop-1', 'shop-2']) sql.prepare("INSERT INTO owned_items VALUES (?, ?, 'x')").run(A, `title:${id}`);
    expect(await listTitleJobs(db)).toEqual([]);
    await equipTitle(db, A, 'shop-1');
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: 'shop-1', title: 'MOOD' }]);
    await settleTitle(db, A, 'shop-1', 'too_long');
    expect(await listTitleJobs(db)).toEqual([]);
    expect(await titleState(db, A)).toEqual({ title_id: 'shop-1', title_applied: 'shop-1', title_note: 'too_long' });
    await equipTitle(db, A, 'shop-1');
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: 'shop-1', title: 'MOOD' }]);
    await settleTitle(db, A, 'shop-1', null);
    // 떼기
    await equipTitle(db, A, null);
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: '', title: null }]);
    await settleTitle(db, A, '', 'forbidden');
    expect(await listTitleJobs(db)).toEqual([]);
    // 못 뗐으면 다시 떼기를 누르면 또 나와요
    await equipTitle(db, A, null);
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: '', title: null }]);
    await settleTitle(db, A, '', null);
    expect(await listTitleJobs(db)).toEqual([]);
    // 그 사이 다른 칭호를 고르면 예전 결과가 와도 다시 나와요
    await equipTitle(db, A, 'shop-1');
    await equipTitle(db, A, 'shop-2');
    await settleTitle(db, A, 'shop-1', null);
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: 'shop-2', title: 'VIBE' }]);
  });

  it('목록에서 빠진 칭호를 고른 채면 떼요', async () => {
    const { db, sql } = setup();
    for (const [user, id] of [[A, 'old-title'], [B, 'old-title'], [A, 'shop-1']]) sql.prepare("INSERT INTO owned_items VALUES (?, ?, 'x')").run(user, `title:${id}`);
    await equipTitle(db, A, 'old-title');
    // 닉네임에 이미 붙은 뒤에 목록에서 빠져도 떼요
    await settleTitle(db, A, 'old-title', null);
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: '', title: null }]);
    // 목록 조회는 읽기만 해요. 고른 칭호는 그대로 두고, 떼었다는 결과가 오면 더는 나오지 않아요
    expect((await titleState(db, A)).title_id).toBe('old-title');
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: '', title: null }]);
    await settleTitle(db, A, '', null);
    expect(await listTitleJobs(db)).toEqual([]);
    expect(await listTitleJobs(db)).toEqual([]);
    // 붙기 전에 빠졌으면 뗄 것도 없어요. 지금 목록에 있는 칭호를 고른 사람은 건드리지 않아요
    await equipTitle(db, B, 'old-title');
    await equipTitle(db, A, 'shop-1');
    expect(await listTitleJobs(db)).toEqual([{ user: A, id: 'shop-1', title: 'MOOD' }]);
  });
});

it('초기화 전에 읽은 칭호 조건으로 지운 칭호를 다시 지급하지 않아요', async () => {
  const { db, sql } = setup();
  sql.prepare("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, ?, 'x', 'x')").run(A, B, xpForLevel(30));
  const stats = await loadTitleStats(db, A, new Date().toISOString());
  expect(titleProgress(titleById('lv-30')!, stats).ok).toBe(true);
  sql.exec(readFileSync('scripts/launch-reset.sql', 'utf8'));
  const owned = await ownedTitles(db, A);
  expect(await recordEarnedTitles(db, A, stats, owned)).toEqual([]);
  expect(await ownedTitles(db, A)).toEqual(new Set());
  expect(owned).toEqual(new Set());
});

it('초기화로 소유권이 지워진 칭호를 늦게 끝난 장착 요청이 다시 달지 않아요', async () => {
  const { db, sql } = setup();
  sql.prepare("INSERT INTO owned_items (user_id, item_id, acquired_at) VALUES (?, 'title:shop-1', 'x')").run(A);
  expect((await ownedTitles(db, A)).has('shop-1')).toBe(true); // 요청의 소유권 확인
  sql.exec(readFileSync('scripts/launch-reset.sql', 'utf8'));
  await equipTitle(db, A, 'shop-1');
  expect((await titleState(db, A)).title_id).toBeNull();
  expect(await listTitleJobs(db)).toEqual([]);
});


it('다른 화면이 먼저 지급한 칭호는 새 획득으로 중복 알리지 않고 소유 목록에는 보여요', async () => {
  const { db, sql } = setup();
  sql.prepare("INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES (?, ?, ?, 'x', 'x')").run(A, B, xpForLevel(10));
  const stats = await loadTitleStats(db, A, new Date().toISOString());
  const oldOwned = await ownedTitles(db, A);
  await recordEarnedTitles(db, A, stats, new Set());
  expect(await recordEarnedTitles(db, A, stats, oldOwned)).toEqual([]);
  expect(oldOwned.has('lv-10')).toBe(true);
});

it('배포 중 잠깐 빠졌던 칭호가 돌아오면 고른 칭호를 다시 붙여요', async () => {
  const { db, sql } = setup();
  sql.prepare("INSERT INTO owned_items VALUES (?, ?, 'x')").run(A, 'title:shop-1');
  await equipTitle(db, A, 'shop-1');
  await settleTitle(db, A, 'shop-1', null);
  // 목록에서 빠진 상태를 흉내 내요: 고른 칭호가 지금 목록에 없는 id라고 봐요
  sql.prepare("UPDATE profiles SET title_id = 'gone-for-a-while', title_applied = 'gone-for-a-while' WHERE user_id = ?").run(A);
  expect(await listTitleJobs(db)).toEqual([{ user: A, id: '', title: null }]);
  await settleTitle(db, A, '', null);
  expect((await titleState(db, A)).title_id).toBe('gone-for-a-while');
  // 다시 목록에 있는 칭호로 돌아오면(배포 완료) 다시 붙이는 작업이 나와요
  sql.prepare("UPDATE profiles SET title_id = 'shop-1' WHERE user_id = ?").run(A);
  expect(await listTitleJobs(db)).toEqual([{ user: A, id: 'shop-1', title: 'MOOD' }]);
});

it('통화 칭호는 카드마다 더하지 않고, 초기화한 날부터 다른 멤버와 실제로 같이 있던 시간만 세요(나리 2026-11-21)', async () => {
  const { db, sql } = setup();
  // 5명 방에 1시간 있었으면 카드 4장에 1시간씩 붙지만, 칭호는 1시간이에요
  for (const t of ['b1', 'b2', 'b3', 'b4'])
    sql.prepare("INSERT INTO cards (owner_id, target_id, xp, voice_seconds, first_met, updated_at) VALUES (?, ?, 60, 3600, 'x', 'x')").run(A, t);
  sql.prepare("UPDATE members SET reset_at = '2026-11-16T21:01:10.769Z' WHERE user_id = ?").run(A); // 한국 11/17 06:01
  sql.prepare("INSERT INTO member_voice_day (user_id, day, minutes) VALUES (?, '2026-11-16', 600), (?, '2026-11-17', 60), (?, '2026-11-20', 30)").run(A, A, A);
  const stats = await loadTitleStats(db, A, '2026-11-21T00:00:00Z');
  expect(stats.voiceSeconds).toBe(90 * 60);
  expect(titleProgress(byName('수다'), stats).ok).toBe(false);
});
