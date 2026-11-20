import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { applySync, parseSync } from '../src/sync';

function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (query: string, args: unknown[] = []) => ({
    query, args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => ({ results: sql.prepare(query).all(...(args as never[])) }),
    first: async () => sql.prepare(query).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }),
  });
  const db = {
    prepare: (q: string) => stmt(q),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      sql.exec('BEGIN');
      try { for (const s of list) sql.prepare(s.query).run(...(s.args as never[])); sql.exec('COMMIT'); }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
      return [];
    },
  };
  return { sql, db: db as unknown as D1Database };
}

function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
const IDS = Array.from({ length: 8 }, (_, i) => `${i + 1}`.repeat(18));
const T0 = Date.parse('2026-11-16T00:00:00Z');

const dump = (sql: DatabaseSync) => JSON.stringify(['members','profiles','cards','bingo_day','bingo_pair','season_members','gq_pair','owned_items','alerts'].map((t) => { try { return sql.prepare(`SELECT * FROM ${t} ORDER BY 1,2`).all(); } catch { return null; } }));

// 무작위 동기화 150묶음(들어오기·나가기·다시 들어오기·같은 묶음 두 번)을 돌리고 카드·혼자 경험치·빙고가 기대값과 같은지 봐요
for (const seed of [1, 2, 3]) it(`sync sim seed ${seed}`, async () => {
  const { sql, db } = fakeD1();
  const r = rng(seed);
  const active = new Set<string>();
  const left = new Set<string>();
  const joinedAt = new Map<string, number>();
  // model: card xp per owner->target, solo xp per user
  const card = new Map<string, number>();
  const solo = new Map<string, number>();
  const jelly = new Map<string, number>();
  let now = T0;
  const problems: string[] = [];
  for (let step = 0; step < 150; step++) {
    now += 10 * 60_000;
    const madeAt = new Date(now - 60_000).toISOString();
    const members: any[] = [];
    const removed: string[] = [];
    for (const id of IDS) {
      if (active.has(id) && r() < 0.03) { removed.push(id); continue; }
      if (!active.has(id) && r() < 0.15) { joinedAt.set(id, now - 120_000); }
      if (active.has(id) || joinedAt.get(id) === now - 120_000) members.push({ id, name: 'n' + id[0], is_newbie: false, green: true, joined_at: new Date(joinedAt.get(id)!).toISOString() });
    }
    const present = members.map((m) => m.id);
    const pair_xp: any[] = []; const solo_xp: any[] = []; const jelly_earned: any[] = []; const room_minutes: any[] = []; const attendance: any[] = [];
    for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) if (r() < 0.2) {
      const xp = 1 + Math.floor(r() * 10);
      pair_xp.push({ a: present[i], b: present[j], xp, voice_seconds: xp * 60, scrims: 0, at: madeAt });
    }
    for (const id of present) if (r() < 0.3) { const xp = 1 + Math.floor(r() * 20); solo_xp.push({ id, xp }); }
    for (const id of present) if (r() < 0.2) { jelly_earned.push({ id, amount: 1 }); }
    if (present.length >= 2 && r() < 0.5) room_minutes.push({ at: madeAt, room: '9'.repeat(18), members: present.slice(0, 2 + Math.floor(r() * (present.length - 1))) });
    const raw = { batch_id: `${madeAt}-${seed}-${step}`, members, removed, pair_xp, solo_xp, jelly_earned, room_minutes, attendance, full_members: false };
    const parsed = parseSync(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    const res = await applySync(db, parsed.value, now);
    expect(res).toBe('applied');
    // model update
    // 나갔다 다시 들어온 사람: 남아 있던 사람들이 가진 그 사람 카드도 처음부터(나리 2026-11-19)
    for (const id of present) if (left.has(id)) {
      left.delete(id);
      for (const k of [...card.keys()]) if (k.endsWith('>' + id)) card.delete(k);
    }
    for (const id of present) active.add(id);
    for (const x of pair_xp) {
      card.set(`${x.a}>${x.b}`, (card.get(`${x.a}>${x.b}`) ?? 0) + x.xp);
      card.set(`${x.b}>${x.a}`, (card.get(`${x.b}>${x.a}`) ?? 0) + x.xp);
    }
    for (const x of solo_xp) solo.set(x.id, (solo.get(x.id) ?? 0) + x.xp);
    for (const x of jelly_earned) jelly.set(x.id, (jelly.get(x.id) ?? 0) + x.amount);
    for (const id of removed) {
      active.delete(id);
      left.add(id);
      for (const k of [...card.keys()]) if (k.startsWith(id + '>')) card.delete(k);
      solo.delete(id); jelly.delete(id);
    }
    // duplicate check
    const before = dump(sql);
    expect(await applySync(db, parsed.value, now + 1000)).toBe('duplicate');
    expect(dump(sql)).toBe(before);
    // invariants
    for (const row of sql.prepare('SELECT owner_id, target_id, xp FROM cards').all() as any[]) {
      const want = card.get(`${row.owner_id}>${row.target_id}`) ?? 0;
      if (row.xp !== want) problems.push(`step ${step} card ${row.owner_id[0]}>${row.target_id[0]} xp ${row.xp} want ${want}`);
    }
    for (const [k, v] of card) {
      const [o, t] = k.split('>');
      const row = sql.prepare('SELECT xp FROM cards WHERE owner_id=? AND target_id=?').get(o!, t!) as any;
      if (!row && v > 0) problems.push(`step ${step} missing card ${k} ${v}`);
    }
    for (const row of sql.prepare('SELECT user_id, solo_xp, dogam_jelly FROM profiles').all() as any[]) {
      if (!active.has(row.user_id)) problems.push(`step ${step} inactive profile ${row.user_id[0]}`);
      if (row.solo_xp !== (solo.get(row.user_id) ?? 0)) problems.push(`step ${step} solo ${row.user_id[0]} ${row.solo_xp} want ${solo.get(row.user_id) ?? 0}`);
      if (row.dogam_jelly < 0) problems.push(`neg jelly`);
    }
    for (const t of ['bingo_day']) for (const row of sql.prepare(`SELECT DISTINCT user_id FROM ${t}`).all() as any[]) if (!active.has(row.user_id)) problems.push(`step ${step} ${t} for inactive ${row.user_id[0]}`);
  }

  expect(problems.length).toBe(0);
}, 120000);
