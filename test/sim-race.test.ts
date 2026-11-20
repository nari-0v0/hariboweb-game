// 시뮬레이션: 같은 요청을 동시에 여러 번(두 번 클릭·여러 탭·봇 재전송) 보내도
// 젤리가 한 번만 빠지고/들어오고, 물건·칭찬·변경권이 한 번만 생기는지 확인해요.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';
import { signSession } from '../src/crypto';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  // 진짜 D1처럼 매 요청 사이에 다른 요청이 끼어들 수 있게 한 박자 쉬어요
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  const stmt = (query: string, args: unknown[] = []) => ({
    query,
    args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => (await tick(), { results: sql.prepare(query).all(...(args as never[])) }),
    first: async () => (await tick(), sql.prepare(query).get(...(args as never[])) ?? null),
    run: async () => (await tick(), { meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }),
  });
  const db = {
    prepare: (q: string) => stmt(q),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      await tick();
      sql.exec('BEGIN');
      const out = [];
      try {
        for (const s of list) out.push({ meta: { changes: Number(sql.prepare(s.query).run(...(s.args as never[])).changes) }, results: [] });
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
      return out;
    },
  };
  return { sql, db: db as unknown as D1Database };
}

afterEach(() => vi.useRealTimers());

const A = '400000000000000001';
const B = '400000000000000002';
const C = '400000000000000003';
const D = '400000000000000004';
const E = '400000000000000005';
const ALL = [A, B, C, D, E];

async function world() {
  const { sql, db } = fakeD1();
  const env = { DB: db, SESSION_SECRET: 'sim', BOT_SYNC_SECRET: 'bot' } as Env;
  const bot = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: { Authorization: 'Bearer bot', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env);
  const visit = async (u: string, path: string, form?: Record<string, string>) => {
    const cookie = await signSession('sim', { uid: u, exp: Date.now() + 86_400_000 });
    return app.request(path, form
      ? { method: 'POST', headers: { Cookie: `hs=${cookie}`, Origin: 'http://localhost' }, body: new URLSearchParams(form) }
      : { headers: { Cookie: `hs=${cookie}` } }, env);
  };
  const members = ALL.map((id, i) => ({ id, name: `m${i}`, joined_at: '2026-10-01T00:00:00.000Z', is_newbie: false }));
  const res = await bot('/api/bot/sync', { batch_id: `${new Date().toISOString()}-race`, members, full_members: false });
  expect(res.status, await res.clone().text()).toBe(200);
  const jelly = (u: string) => (sql.prepare('SELECT dogam_jelly j FROM profiles WHERE user_id = ?').get(u) as { j: number } | undefined)?.j ?? 0;
  return { sql, env, bot, visit, jelly };
}

it('시뮬: 처음 성별 고르기를 동시에 여러 번 눌러도 한 번만 정해지고 캐릭터가 겹치지 않아요', async () => {
  for (let round = 0; round < 15; round++) {
    const w = await world();
    await Promise.all(ALL.flatMap((u) => [w.visit(u, '/api/me/gender', { pool: 'girl' }), w.visit(u, '/api/me/gender', { pool: round % 2 ? 'boy' : 'girl' }), w.visit(u, '/api/me/gender', { pool: 'boy' })]));
    const rows = w.sql.prepare('SELECT p.user_id, p.character_id, m.gender_chosen_at g FROM members m LEFT JOIN profiles p USING (user_id)').all() as { user_id: string; character_id: string | null; g: string | null }[];
    for (const row of rows) expect(row.g, row.user_id).not.toBeNull();
    const chars = rows.map((r) => r.character_id).filter(Boolean);
    expect(new Set(chars).size, JSON.stringify(rows)).toBe(chars.length);
    // 처음 고르기는 무료
    expect(w.sql.prepare('SELECT COUNT(*) n FROM purchases').get()).toEqual({ n: 0 });
  }
});

it('시뮬: 상점·칭호·서비스·성별 바꾸기를 동시에 눌러도 잔액보다 많이 쓰지 않고 한 번만 사요', async () => {
  const kinds = new Map<string, number>();
  for (let round = 0; round < 15; round++) {
    const w = await world();
    for (const u of ALL) await w.visit(u, '/api/me/gender', { pool: 'girl' });
    const start = 40 + round * 37;
    w.sql.prepare('UPDATE profiles SET dogam_jelly = ?').run(start);
    const reqs: (Response | Promise<Response>)[] = [];
    for (const u of ALL) {
      for (let k = 0; k < 3; k++) {
        reqs.push(w.visit(u, '/api/shop/buy', { item: 'theme:rose' }));
        reqs.push(w.visit(u, '/api/shop/buy', { item: 'deco:maid' }));
        reqs.push(w.visit(u, '/api/titles/buy', { title: 'shop-1' }));
        reqs.push(w.visit(u, '/api/shop/service', { item: 'svc:nickname', price: '5' }));
        reqs.push(w.visit(u, '/api/shop/gender', { pool: 'boy' }));
        reqs.push(w.visit(u, '/api/shop/nick', { front: `닉${k}` }));
      }
    }
    for (const res of await Promise.all(reqs)) expect(res.status).toBeLessThan(400);
    for (const u of ALL) {
      const spent = (w.sql.prepare("SELECT COALESCE(SUM(price),0) s FROM purchases WHERE user_id = ? AND status IN ('done','pending')").get(u) as { s: number }).s;
      expect(w.jelly(u), u).toBe(start - spent);
      expect(w.jelly(u)).toBeGreaterThanOrEqual(0);
      const dup = w.sql.prepare("SELECT item_id, COUNT(*) n FROM purchases WHERE user_id = ? AND item_id NOT LIKE 'svc:%' GROUP BY item_id HAVING n > 1").all(u);
      expect(dup, u).toEqual([]);
      const owned = w.sql.prepare("SELECT COUNT(*) n FROM owned_items WHERE user_id = ?").get(u) as { n: number };
      const bought = w.sql.prepare("SELECT COUNT(*) n FROM purchases WHERE user_id = ? AND item_id NOT LIKE 'svc:%' AND item_id != 'change:gender'").get(u) as { n: number };
      expect(owned.n, u).toBe(bought.n);
      // 성별 바꾸기는 한 번만(같은 쪽으로 또 바꾸면 'same')
      const g = w.sql.prepare("SELECT COUNT(*) n FROM purchases WHERE user_id = ? AND item_id = 'change:gender'").get(u) as { n: number };
      expect(g.n).toBeLessThanOrEqual(1);
      // 닉네임 변경권: 쓴 장수 ≤ 산 장수, 진행 중은 하나만
      const nick = w.sql.prepare("SELECT (SELECT COUNT(*) FROM purchases WHERE user_id = ?1 AND item_id = 'svc:nickname' AND status = 'done') bought, (SELECT COUNT(*) FROM nick_jobs WHERE user_id = ?1) used").get(u) as { bought: number; used: number };
      expect(nick.used).toBeLessThanOrEqual(Math.min(1, nick.bought));
    }
    const chars = (w.sql.prepare('SELECT character_id c FROM profiles WHERE character_id IS NOT NULL').all() as { c: string }[]).map((r) => r.c);
    expect(new Set(chars).size).toBe(chars.length);
    for (const x of w.sql.prepare('SELECT item_id i, COUNT(*) n FROM purchases GROUP BY item_id').all() as { i: string; n: number }[]) kinds.set(x.i, (kinds.get(x.i) ?? 0) + x.n);
    kinds.set('nick_jobs', (kinds.get('nick_jobs') ?? 0) + (w.sql.prepare('SELECT COUNT(*) n FROM nick_jobs').get() as { n: number }).n);
  }
  // 모든 종류가 실제로 팔렸는지(시뮬이 헛돌지 않게)
  for (const k of ['theme:rose', 'deco:maid', 'title:shop-1', 'svc:nickname', 'change:gender', 'nick_jobs']) expect(kinds.get(k) ?? 0, `${k} ${JSON.stringify([...kinds])}`).toBeGreaterThan(0);
});

it('시뮬: 봇이 같은 젤리 지급·칭찬을 동시에 다시 보내도 한 번만 들어가요', async () => {
  for (let round = 0; round < 15; round++) {
    const w = await world();
    for (const u of ALL) await w.visit(u, '/api/me/gender', { pool: 'girl' });
    w.sql.prepare('UPDATE profiles SET dogam_jelly = 10').run();
    const before = new Map(ALL.map((u) => [u, w.jelly(u)]));
    const reqs: (Response | Promise<Response>)[] = [];
    for (let k = 0; k < 4; k++) {
      reqs.push(w.bot('/api/bot/jelly-grants', { id: `g-${round}`, user: A, amount: 7, reason: '버그 제보', by: '100000000000000000' }));
      reqs.push(w.bot('/api/bot/jelly-grants', { id: `g2-${round}`, user: B, amount: -3, reason: '회수', by: '100000000000000000' }));
      // A가 모두에게 칭찬(하루 3번 한도), 모두가 E에게 칭찬(받는 젤리 하루 3개 한도)
      for (const to of [B, C, D, E]) reqs.push(w.bot('/api/bot/praise', { from: A, to }));
      for (const from of [B, C, D]) reqs.push(w.bot('/api/bot/praise', { from, to: E }));
    }
    for (const res of await Promise.all(reqs)) expect(res.status, await res.clone().text()).toBe(200);
    const praises = w.sql.prepare('SELECT from_id f, to_id t, jelly FROM praises').all() as { f: string; t: string; jelly: number }[];
    expect(praises.filter((p) => p.f === A).length).toBe(3);
    const gotJelly = (u: string) => praises.filter((p) => p.t === u && p.jelly === 1).length;
    expect(gotJelly(E)).toBeLessThanOrEqual(3);
    // 빙고 줄 보상 젤리는 bingo_lines로 따로 세요
    const lines = (u: string) => (w.sql.prepare("SELECT COUNT(*) n FROM bingo_lines WHERE user_id = ?").get(u) as { n: number }).n;
    for (const u of ALL) {
      const grant = u === A ? 7 : u === B ? -3 : 0;
      const exp = before.get(u)! + grant + gotJelly(u) + lines(u);
      expect(w.jelly(u), `${u} ${JSON.stringify(praises)}`).toBe(exp);
    }
  }
});
