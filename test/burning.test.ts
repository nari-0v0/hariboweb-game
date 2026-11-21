import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { burnEndText, burnReply, burnWindow, burnWindowsForSync, burningUntil, resetBurningCache } from '../src/burning';
import { bingoStatements } from '../src/bingo';
import { actJourney, matOfferPrice, offerInfo, startJourney, stat, type JourneyState } from '../src/journey';
import { MATERIALS } from '../src/journey';

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

const MIN = 60_000;
const T0 = Date.parse('2026-11-21T01:00:00Z');

describe('버닝타임', () => {
  beforeEach(() => resetBurningCache());

  it('적어 두기 전에는 꺼져 있고, 적은 기간에만 켜져요', async () => {
    const { sql, db } = fakeD1();
    expect(await burningUntil(db, T0)).toBeNull();
    const until = new Date(T0 + 120 * MIN).toISOString();
    sql.prepare('UPDATE burning SET started_at = ?, until = ? WHERE id = 1').run(new Date(T0).toISOString(), until);
    resetBurningCache();
    expect(await burningUntil(db, T0 + MIN)).toBe(until);
    expect(burnEndText(until)).toBe('12:00');
    resetBurningCache();
    expect(await burningUntil(db, T0 + 121 * MIN)).toBeNull();
    // 끝난 버닝타임도 기간은 남아 있어요(늦게 온 봇 기록용)
    expect(await burnWindow(db, T0 + 121 * MIN)).toEqual({ from: new Date(T0).toISOString(), until });
    expect(burnReply(await burnWindow(db, T0 + MIN), T0 + MIN)).toEqual({ from: new Date(T0).toISOString(), until, card_xp: 1.5 });
    expect(burnReply(await burnWindow(db, T0 + 121 * MIN), T0 + 121 * MIN)).toBeNull();
  });

  it('1분 동안은 다시 읽지 않아요', async () => {
    const { sql, db } = fakeD1();
    expect(await burningUntil(db, T0)).toBeNull();
    sql.prepare('UPDATE burning SET started_at = ?, until = ? WHERE id = 1').run(new Date(T0).toISOString(), new Date(T0 + 60 * MIN).toISOString());
    expect(await burningUntil(db, T0 + 30_000)).toBeNull();
    expect(await burningUntil(db, T0 + MIN)).not.toBeNull();
  });

  it('봇 동기화 정산은 캐시 없이 새로 읽어요', async () => {
    const { sql, db } = fakeD1();
    expect(await burnWindow(db, T0)).toBeNull();
    sql.prepare('UPDATE burning SET started_at = ?, until = ? WHERE id = 1').run(new Date(T0).toISOString(), new Date(T0 + 60 * MIN).toISOString());
    expect(await burnWindow(db, T0 + 1000)).toBeNull();
    expect(await burnWindow(db, T0 + 1000, true)).not.toBeNull();
  });

  it('빙고 통화 시간은 버닝타임 안에서만 2배예요', () => {
    const from = new Date(T0).toISOString();
    const until = new Date(T0 + 60 * MIN).toISOString();
    const fake = { prepare: () => ({ bind: (...a: unknown[]) => a }) } as unknown as D1Database;
    const rooms = [
      { at: new Date(T0 - MIN).toISOString(), room: 'r', members: ['1', '2'] },
      { at: new Date(T0 + MIN).toISOString(), room: 'r', members: ['1', '2'] },
    ];
    const out = bingoStatements(fake, rooms, [], [], { from, until }).stmts as unknown as unknown[][];
    const day = out.find((a) => a[1] === '1')!;
    expect(day[3]).toBe(3); // 평소 1분 + 버닝 1분×2
    const pair = out.find((a) => a[1] === '1' && a[2] === '2')!;
    expect(pair[3]).toBe(3);
  });

  it('새 버닝타임을 켜도 예전 버닝 때 늦게 온 통화는 2배로 쳐요(점검 2026-11-21)', async () => {
    const { sql, db } = fakeD1();
    const first = { from: new Date(T0).toISOString(), until: new Date(T0 + 60 * MIN).toISOString() };
    sql.prepare('UPDATE burning SET started_at = ?, until = ? WHERE id = 1').run(first.from, first.until);
    const second = { from: new Date(T0 + 120 * MIN).toISOString(), until: new Date(T0 + 180 * MIN).toISOString() };
    sql.prepare('UPDATE burning SET started_at = ?, until = ? WHERE id = 1').run(second.from, second.until);
    const { current, all } = await burnWindowsForSync(db, T0 + 130 * MIN);
    expect(current).toEqual(second);
    expect(all).toEqual([second, first]);
    const fake = { prepare: () => ({ bind: (...a: unknown[]) => a }) } as unknown as D1Database;
    const late = [{ at: new Date(T0 + 10 * MIN).toISOString(), room: 'r', members: ['1', '2'] }];
    const out = bingoStatements(fake, late, [], [], all).stmts as unknown as unknown[][];
    expect(out.find((a) => a[1] === '1')![3]).toBe(2);
    // 같은 버닝을 일찍 끝내면(until만 바꿈) 예정 시각은 남기지 않아요
    const third = { from: second.from, until: new Date(T0 + 150 * MIN).toISOString() };
    sql.prepare('UPDATE burning SET until = ? WHERE id = 1').run(third.until);
    const early = await burnWindowsForSync(db, T0 + 160 * MIN);
    expect(early.all).toEqual([third, first]);
    const after = bingoStatements(fake, [{ at: new Date(T0 + 160 * MIN).toISOString(), room: 'r', members: ['1', '2'] }], [], [], early.all).stmts as unknown as unknown[][];
    expect(after.find((a) => a[1] === '1')![3]).toBe(1);
    // 3일 지난 기록은 안 봐요
    expect((await burnWindowsForSync(db, T0 + 4 * 86_400_000)).all).toEqual([third]);
  });
});

describe('원정대 수상한 샘·상인 재료', () => {
  const springRun = (seed: string): JourneyState => {
    const s = startJourney(seed, { atk: 0, hp: 0, def: 0 }, 6);
    s.pending = { kind: 'event', id: 'spring' };
    s.day = 5;
    return s;
  };

  it('샘은 성공하면 최대 체력 +5%, 실패하면 체력 -10%', () => {
    let up = 0, down = 0;
    for (let i = 0; i < 60; i++) {
      const s = springRun(`spring-${i}`);
      const before = stat(s).maxHp;
      const hp = s.hp;
      const after = actJourney(s, { a: 'pick', n: 0 })!;
      if (stat(after).maxHp > before) {
        up++;
        expect(stat(after).maxHp - before).toBe(Math.round(before * 0.05));
        expect(after.hp).toBe(stat(after).maxHp);
      } else {
        down++;
        expect(hp - after.hp).toBe(Math.min(hp - 1, Math.round(before * 0.1)));
      }
    }
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
  });

  it('상인이 가끔 그 장 재료를 비싸게 팔고, 사면 가방에 들어가요', () => {
    let shops = 0, mats = 0;
    for (let i = 0; i < 400; i++) {
      let s = startJourney(`m-${i}`, { atk: 10, hp: 10, def: 5 }, 3, { weapon: 3, armor: 3, charm: 3 });
      while (!s.done) {
        if (s.pending?.kind === 'shop') {
          shops++;
          const n = s.pending.offers.findIndex((o) => o.id === 'mat');
          if (n >= 0) {
            mats++;
            const o = s.pending.offers[n]!;
            expect(o.price).toBe(matOfferPrice(3, s.day));
            expect(offerInfo('mat', 3).name).toBe(MATERIALS[2]!.name);
            s.coins = o.price;
            const had = s.mats ?? 0;
            s = actJourney(s, { a: 'buy', n })!;
            expect(s.mats).toBe(had + 1);
            expect(s.coins).toBe(0);
            break;
          }
        }
        s = actJourney(s, { a: 'idle' })!;
      }
    }
    expect(mats).toBeGreaterThan(0);
    expect(mats / shops).toBeLessThan(0.12);
  });

  it('버닝타임엔 재료 나올 확률이 1.5배예요', () => {
    const count = (burn: boolean) => {
      let n = 0;
      for (let i = 0; i < 300; i++) {
        let s = startJourney(`b-${i}`, { atk: 30, hp: 30, def: 10 }, 2, { weapon: 3, armor: 3, charm: 3 });
        while (!s.done) s = actJourney(burn ? { ...s, burn: true } : s, { a: 'idle' })!;
        n += s.mats ?? 0;
      }
      return n;
    };
    // 첫 대장(300판 모두 깨요)은 늘 1개라 빼고 견줘요
    const normal = count(false) - 300, burn = count(true) - 300;
    expect(burn).toBeGreaterThan(normal * 1.35);
  });
});

describe('사건파일 힌트 동전', () => {
  it('버닝타임엔 동전 하나를 찾으면 2개를 받아요', async () => {
    const { ESCAPE_CASES, actEscape, coinsLeft, startEscape } = await import('../src/escape');
    const c = ESCAPE_CASES[0]!;
    expect(coinsLeft(actEscape(c, startEscape(c), { a: 'coin', k: 0 })!)).toBe(1);
    const s = actEscape(c, startEscape(c), { a: 'coin', k: 0 }, true)!;
    expect(coinsLeft(s)).toBe(2);
    expect(s.msg).toContain('2개');
  });
});

describe('정식 시작 초기화 스크립트', () => {
  it('재수사·첫 보상·초기화권 기록도 지워요(점검 2026-11-21)', () => {
    const { sql } = fakeD1();
    sql.prepare("INSERT INTO escape_paid (user_id, case_id) VALUES ('1', 'c1')").run();
    sql.prepare("INSERT INTO game_resets (user_id, count, last_at, journey_jelly_top) VALUES ('1', 1, '2026-11-20T00:00:00Z', 9)").run();
    sql.exec(readFileSync('scripts/launch-reset.sql', 'utf8'));
    expect(sql.prepare('SELECT COUNT(*) AS n FROM escape_paid').get()).toEqual({ n: 0 });
    expect(sql.prepare('SELECT COUNT(*) AS n FROM game_resets').get()).toEqual({ n: 0 });
  });
});
