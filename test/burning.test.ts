import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { burnEndText, burnLength, burnWindow, burningUntil, markMaintenance, resetBurningCache } from '../src/burning';
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

// 점검을 minutes분 동안 1분마다 봤다고 쳐요
async function maintain(db: D1Database, minutes: number, from = T0) {
  for (let m = 0; m <= minutes; m++) {
    resetBurningCache();
    await markMaintenance(db, from + m * MIN);
  }
  resetBurningCache();
}

describe('버닝타임', () => {
  beforeEach(() => resetBurningCache());

  it('점검 길이로 버닝타임 길이를 정해요', () => {
    expect(burnLength(29 * MIN)).toBe(0);
    expect(burnLength(30 * MIN)).toBe(60 * MIN);
    expect(burnLength(60 * MIN)).toBe(60 * MIN);
    expect(burnLength(61 * MIN)).toBe(120 * MIN);
  });

  it('1시간 넘는 점검이 끝나면 2시간 켜지고, 시간이 지나면 꺼져요', async () => {
    const { db } = fakeD1();
    expect(await burningUntil(db, T0)).toBeNull();
    await maintain(db, 90);
    const end = T0 + 91 * MIN;
    const until = await burningUntil(db, end);
    expect(until).toBe(new Date(end + 120 * MIN).toISOString());
    expect(burnEndText(until!)).toBe('13:31');
    // 다시 읽어도 늘어나지 않아요
    resetBurningCache();
    expect(await burningUntil(db, end + 10 * MIN)).toBe(until);
    resetBurningCache();
    expect(await burningUntil(db, end + 121 * MIN)).toBeNull();
    // 끝난 버닝타임도 기간은 남아 있어요(늦게 온 봇 기록용)
    expect(await burnWindow(db, end + 121 * MIN)).toEqual({ from: new Date(end).toISOString(), until });
  });

  it('짧은 점검은 켜지지 않아요', async () => {
    const { db } = fakeD1();
    await maintain(db, 10);
    expect(await burningUntil(db, T0 + 11 * MIN)).toBeNull();
    // 점검 기록은 비워서 다음 점검과 섞이지 않아요
    await maintain(db, 40, T0 + 5 * 60 * MIN);
    expect(await burningUntil(db, T0 + 6 * 60 * MIN)).not.toBeNull();
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
