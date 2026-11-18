// 시뮬레이션: 진짜 마이그레이션을 올린 메모리 DB에 봇 동기화·화면 요청을 무작위로 수천 번 보내고,
// 따로 계산한 "정답"(모델)과 DB가 같은지 매번 확인해요. 카드 경험치·도감 젤리·탈퇴/재가입·빙고 줄.
// SIM_STEPS=5000 처럼 늘려서 돌릴 수 있어요.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';
import { signSession } from '../src/crypto';
import { CARD_JELLY } from '../src/card-rewards';
import { applySync, parseSync, LEVEL_STEP, JELLY_PER_CARD_STEP } from '../src/sync';
import { levelFromXp } from '../src/levels';
import { STARTER_JELLY } from '../src/db';
import { boardFor, CENTER, FULL_JELLY, LINE_JELLY, LINES, splitCycle, type BingoStats, emptyStats } from '../src/bingo';
import { kstParts } from '../src/season';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

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

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
}

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const ids = Array.from({ length: 12 }, (_, i) => `3000000000000000${String(i).padStart(2, '0')}`);
const pk = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

type Model = {
  present: Set<string>;
  everJoined: Set<string>;
  xp: Map<string, number>; // owner|target → xp
  jellyEarned: Map<string, number>;
  levelJelly: Map<string, number>; // owner → 레벨 단계 젤리
  solo: Map<string, number>;
  joinedAt: Map<string, number>;
};

afterEach(() => vi.useRealTimers());

it('시뮬: 동기화·탈퇴·재가입·칭찬·내 카드 열기를 섞어도 카드·젤리·빙고가 모델과 같아요', async () => {
  const STEPS = Number(process.env.SIM_STEPS ?? 300);
  for (const seed of (process.env.SIM_SEEDS ?? '1,2,3').split(',').map(Number)) {
    const r = rng(seed);
    const { sql, db } = fakeD1();
    const env = { DB: db, SESSION_SECRET: 'sim', BOT_SYNC_SECRET: 'bot' } as Env;
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
    let now = Date.parse('2026-11-16T14:37:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    // 생명력 주기: 2주(봇처럼 06:00 KST 시작)
    const cycleStart = Date.parse('2026-11-13T21:00:00Z');
    const seasonFor = (ms: number) => {
      const k = Math.floor((ms - cycleStart) / (14 * DAY));
      const s = cycleStart + k * 14 * DAY;
      return { start: new Date(s).toISOString(), end: new Date(s + 14 * DAY).toISOString() };
    };
    const m: Model = { present: new Set(ids.slice(0, 6)), everJoined: new Set(ids.slice(0, 6)), xp: new Map(), jellyEarned: new Map(), levelJelly: new Map(), solo: new Map(), joinedAt: new Map() };
    for (const id of m.present) m.joinedAt.set(id, now - 30 * DAY);
    // 빙고 모델: 기간 id → 사람 → 통계 일부(통화·출석·짝)
    type BM = { voice: number; crowd: number; night: number; weekend: number; days: Map<string, number>; attend: Set<string>; pairs: Map<string, number> };
    const bingo = new Map<string, Map<string, BM>>();
    const bm = (period: string, u: string) => {
      const p = bingo.get(period) ?? bingo.set(period, new Map()).get(period)!;
      return p.get(u) ?? p.set(u, { voice: 0, crowd: 0, night: 0, weekend: 0, days: new Map(), attend: new Set(), pairs: new Map() }).get(u)!;
    };
    let batchNo = 0;
    const log: string[] = [];
    const sync = async (extra: Record<string, unknown>) => {
      const id = `${new Date(now).toISOString()}-s${seed}b${++batchNo}`;
      const members = [...m.present].map((u) => ({ id: u, name: `n${u.slice(-1)}`, joined_at: new Date(m.joinedAt.get(u)!).toISOString(), is_newbie: false }));
      const s = seasonFor(now);
      const parsed = parseSync({ batch_id: id, members, season: s, full_members: false, ...extra });
      if (!parsed.ok) throw new Error(parsed.error);
      const res = await app.request('/api/bot/sync', { method: 'POST', headers: { Authorization: 'Bearer bot', 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: id, members, season: s, full_members: false, ...extra }) }, env);
      expect(res.status, await res.clone().text()).toBe(200);
      lastBatch = JSON.stringify({ batch_id: id, members, season: s, full_members: false, ...extra });
    };
    const visit = async (u: string, path: string, form?: Record<string, string>) => {
      const cookie = await signSession('sim', { uid: u, exp: now + DAY });
      return app.request(path, form ? { method: 'POST', headers: { Cookie: `hs=${cookie}`, Origin: 'http://localhost' }, body: new URLSearchParams(form) } : { headers: { Cookie: `hs=${cookie}` } }, env);
    };
    const chosen = new Set<string>();
    const bot = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { Authorization: 'Bearer bot', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env);
    let lastBatch: string | null = null;
    const cardCount = (u: string) => [...m.xp.keys()].filter((k) => k.startsWith(`${u}|`) && m.present.has(k.slice(k.indexOf('|') + 1))).length;
    const maxCards = new Map<string, number>();
    const mustHave = new Set<string>(); // 이번 걸음에서 카드 단계 보상을 다 받았어야 하는 사람

    for (let step = 0; step < STEPS; step++) {
      // 시간: 1~180분, 가끔 하루 넘게
      now += (r() < 0.05 ? DAY + Math.floor(r() * DAY) : Math.floor(1 + r() * 180) * 60_000);
      vi.setSystemTime(now);
      const k = r();
      const present = [...m.present].sort();
      if (k < 0.55 && present.length >= 2) {
        // 같이 통화: 한 방에서 n분(1분 기록), 짝 경험치(분당 1)
        const mins = 1 + Math.floor(r() * 40);
        // 들어온 뒤의 통화만(들어오기 전 기록은 버리는 게 맞아요)
        const room = present.filter((u) => r() < 0.6 && m.joinedAt.get(u)! <= now - mins * 60_000);
        if (room.length < 2) continue;
        const room_minutes = [];
        const pair_xp = [];
        for (let i = 0; i < mins; i++) {
          const at = now - (mins - i) * 60_000;
          room_minutes.push({ at: new Date(at).toISOString(), room: '900000000000000001', members: room });
        }
        for (let i = 0; i < room.length; i++)
          for (let j = i + 1; j < room.length; j++) pair_xp.push({ a: room[i]!, b: room[j]!, xp: mins, voice_seconds: mins * 60, at: new Date(now - mins * 60_000).toISOString() });
        const solo_xp = room.filter(() => r() < 0.3).map((u) => ({ id: u, xp: 20 }));
        const jelly_earned = solo_xp.map((s) => ({ id: s.id, amount: 1 }));
        const attendance = solo_xp.map((s) => ({ id: s.id, day: kstParts(new Date(now).toISOString()).day }));
        await sync({ pair_xp, room_minutes, solo_xp, jelly_earned, attendance });
        // 모델
        for (const p of pair_xp)
          for (const [o, t] of [[p.a, p.b], [p.b, p.a]] as const) {
            const key = `${o}|${t}`;
            const before = m.xp.get(key) ?? 0;
            const after = before + p.xp;
            m.xp.set(key, after);
            const steps = Math.floor(levelFromXp(after) / LEVEL_STEP) - Math.floor(levelFromXp(before) / LEVEL_STEP);
            if (steps > 0) m.levelJelly.set(o, (m.levelJelly.get(o) ?? 0) + steps * JELLY_PER_CARD_STEP);
          }
        for (const u of room) mustHave.add(u);
        for (const s of solo_xp) m.solo.set(s.id, (m.solo.get(s.id) ?? 0) + s.xp);
        for (const j of jelly_earned) m.jellyEarned.set(j.id, (m.jellyEarned.get(j.id) ?? 0) + j.amount);
        // 빙고 모델
        const periodsOf = (ms: number) => {
          const s = seasonFor(ms);
          return splitCycle(s.start, s.end).find((h) => h.start <= new Date(ms).toISOString() && new Date(ms).toISOString() < h.end)!.id;
        };
        for (const rm of room_minutes) {
          const ms = Date.parse(rm.at);
          const { day, hour } = kstParts(rm.at);
          const per = periodsOf(ms);
          const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
          for (const u of room) {
            const x = bm(per, u);
            x.voice++;
            if (room.length >= 4) x.crowd++;
            if (hour >= 22 || hour < 2) x.night++;
            if (dow === 0 || dow === 6) x.weekend++;
            x.days.set(day, (x.days.get(day) ?? 0) + 1);
            for (const o of room) if (o !== u) x.pairs.set(o, (x.pairs.get(o) ?? 0) + 1);
          }
        }
        for (const a of attendance) bm(periodsOf(Date.parse(`${a.day}T12:00:00Z`) - KST), a.id).attend.add(a.day);
        log.push(`${step} voice ${room.map((x) => x.slice(-1)).join('')} ${mins}m`);
      } else if (k < 0.62 && present.length > 3) {
        // 한 명 탈퇴
        const u = pick(present);
        await sync({ removed: [u] });
        m.present.delete(u);
        chosen.delete(u);
        for (const key of [...m.xp.keys()]) if (key.startsWith(`${u}|`)) m.xp.delete(key);
        m.levelJelly.delete(u);
        maxCards.delete(u);
        m.jellyEarned.delete(u);
        m.solo.delete(u);
        for (const p of bingo.values()) p.delete(u);
        log.push(`${step} leave ${u.slice(-1)}`);
      } else if (k < 0.7) {
        // 들어오기(새로 또는 다시)
        const out = ids.filter((x) => !m.present.has(x));
        if (!out.length) continue;
        const u = pick(out);
        m.present.add(u);
        m.everJoined.add(u);
        // 다시 들어오면 남은 사람이 가진 그 사람 카드도 0부터(#260, 나리 2026-11-19)
        for (const key of [...m.xp.keys()]) if (key.endsWith(`|${u}`)) m.xp.delete(key);
        m.joinedAt.set(u, now - 60_000);
        await sync({});
        log.push(`${step} join ${u.slice(-1)}`);
      } else if (k < 0.72) {
        // 나리 /도감젤리지급
        const u = pick(present);
        const res = await bot('/api/bot/jelly-grants', { id: `g${seed}-${step}`, user: u, amount: 1 + Math.floor(r() * 300), by: '300000000000000099' });
        expect(res.status).toBe(200);
        log.push(`${step} grant ${u.slice(-1)}`);
      } else if (k < 0.74 && lastBatch) {
        // 봇이 같은 묶음을 다시 보냄(응답을 못 받았을 때)
        const res = await app.request('/api/bot/sync', { method: 'POST', headers: { Authorization: 'Bearer bot', 'Content-Type': 'application/json' }, body: lastBatch }, env);
        expect(await res.json()).toMatchObject({ result: 'duplicate' });
        log.push(`${step} resend`);
      } else if (k < 0.8 && present.length >= 2) {
        // 칭찬
        const a = pick(present), b = pick(present);
        const res = await bot('/api/bot/praise', { from: a, to: b, note: r() < 0.5 ? '최고였어' : undefined });
        expect(res.status).toBe(200);
        log.push(`${step} praise ${a.slice(-1)}->${b.slice(-1)} ${(await res.json() as { result: string }).result}`);
      } else if (k < 0.84) {
        // 성별 고르기(처음) 또는 상점·칭호 사기
        const u = pick(present);
        if (!chosen.has(u) || r() < 0.2) {
          const res = await visit(u, '/api/me/gender', { pool: r() < 0.5 ? 'girl' : 'boy' });
          expect(res.status).toBe(302);
          chosen.add(u);
          log.push(`${step} gender ${u.slice(-1)}`);
        } else {
          const item = pick(['theme:moonnight', 'theme:rose', 'deco:maid', 'title:shop-1', 'svc:nickname']);
          const res = item.startsWith('title:')
            ? await visit(u, '/api/titles/buy', { title: item.slice(6) })
            : item.startsWith('svc:') ? await visit(u, '/api/shop/service', { item: 'svc:nickname', price: '5' }) : await visit(u, '/api/shop/buy', { item });
          expect([302, 303]).toContain(res.status);
          log.push(`${step} buy ${u.slice(-1)} ${item} -> ${res.headers.get('location')}`);
        }
      } else if (k < 0.9) {
        // 내 카드·도감·빙고 열기
        const u = pick(present);
        const path = pick(['/me', '/dogam', '/bingo', '/titles', '/rank', '/shop']);
        const res = await visit(u, path);
        expect(res.status, `${path} ${res.status} ${res.headers.get('location')}`).toBe(200);
        if (path === '/me' || path === '/dogam') mustHave.add(u);
        log.push(`${step} visit ${u.slice(-1)} ${path}`);
      }
      for (const u of m.present) if (!chosen.has(u)) {
        await visit(u, '/api/me/gender', { pool: r() < 0.5 ? 'girl' : 'boy' });
        chosen.add(u);
      }
      // ── 확인 ──
      const msg = () => `seed ${seed} step ${step}\n${log.slice(-12).join('\n')}`;
      // 1) 카드 경험치
      const cards = sql.prepare('SELECT owner_id, target_id, xp FROM cards').all() as { owner_id: string; target_id: string; xp: number }[];
      const dbXp = new Map(cards.map((c) => [`${c.owner_id}|${c.target_id}`, Number(c.xp)]));
      for (const [key, xp] of m.xp) expect(dbXp.get(key) ?? 0, `card ${key} ${msg()}`).toBe(xp);
      for (const [key, xp] of dbXp) expect(m.xp.get(key) ?? 0, `extra card ${key} ${msg()}`).toBe(xp);
      // 2) 내 카드 경험치(혼자)·젤리
      for (const u of m.present) {
        const p = sql.prepare('SELECT solo_xp, dogam_jelly FROM profiles WHERE user_id = ?').get(u) as { solo_xp: number; dogam_jelly: number } | undefined;
        const lines = sql.prepare('SELECT line FROM bingo_lines WHERE user_id = ?').all(u) as { line: number }[];
        const lineJelly = lines.reduce((a, l) => a + (l.line === 8 ? FULL_JELLY : LINE_JELLY), 0);
        const lineXp = lines.filter((l) => l.line !== 8).length * 30;
        const cardJelly = (sql.prepare('SELECT COALESCE(SUM(jelly),0) AS n FROM card_count_rewards WHERE user_id = ?').get(u) as { n: number }).n;
        const praiseJelly = (sql.prepare('SELECT COUNT(*) AS n FROM praises WHERE to_id = ? AND jelly = 1 AND created_at >= COALESCE((SELECT reset_at FROM members WHERE user_id = ?), \'\')').get(u, u) as { n: number }).n;
        const starter = (sql.prepare('SELECT starter_jelly_at FROM members WHERE user_id = ?').get(u) as { starter_jelly_at: string | null }).starter_jelly_at ? 1 : 0;
        // 처음 선물은 계정당 한 번(나갔다 오면 다시 안 줘요): 지금 프로필에 남았는지는 탈퇴 여부로 달라요
        const spent = Number((sql.prepare("SELECT COALESCE(SUM(price),0) AS n FROM purchases WHERE user_id = ? AND status IN ('done','pending')").get(u) as { n: number }).n);
        const granted = Number((sql.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM jelly_grants WHERE user_id = ? AND applied_at IS NOT NULL').get(u) as { n: number }).n);
        const want = granted - spent + (m.jellyEarned.get(u) ?? 0) + (m.levelJelly.get(u) ?? 0) + lineJelly + Number(cardJelly) + Number(praiseJelly);
        const got = Number(p?.dogam_jelly ?? 0);
        expect([want, want + STARTER_JELLY * starter], `jelly ${u} ${msg()}`).toContain(got);
        expect(Number(p?.solo_xp ?? 0), `solo ${u} ${msg()}`).toBe((m.solo.get(u) ?? 0) + lineXp);
      }
      // 칭찬 한도: 보낸 사람 하루 3번, 받은 사람 젤리 하루 3개, 같은 사람 하루 1번
      expect(sql.prepare('SELECT COUNT(*) AS n FROM (SELECT 1 FROM praises GROUP BY day, from_id HAVING COUNT(*) > 3)').get(), msg()).toEqual({ n: 0 });
      expect(sql.prepare('SELECT COUNT(*) AS n FROM (SELECT 1 FROM praises WHERE jelly = 1 GROUP BY day, to_id HAVING COUNT(*) > 3)').get(), msg()).toEqual({ n: 0 });
      expect(sql.prepare('SELECT COUNT(*) AS n FROM praises WHERE from_id = to_id').get(), msg()).toEqual({ n: 0 });
      expect(sql.prepare('SELECT COUNT(*) AS n FROM profiles WHERE dogam_jelly < 0').get(), msg()).toEqual({ n: 0 });
      // 2-1) 카드 장수 보상: 닿은 적 있는 단계만, 그리고 함께한 활동이 들어오거나 내 카드·도감을 열면 지금 장수까지 다
      for (const u of m.present) {
        maxCards.set(u, Math.max(maxCards.get(u) ?? 0, cardCount(u)));
        const claimed = (sql.prepare('SELECT cards FROM card_count_rewards WHERE user_id = ?').all(u) as { cards: number }[]).map((x) => x.cards);
        for (const n of claimed) expect(n, `card step ${u} ${msg()}`).toBeLessThanOrEqual(maxCards.get(u)!);
        for (const c of claimed) expect(CARD_JELLY.some(([n]) => n === c)).toBe(true);
        if (mustHave.has(u)) for (const [n] of CARD_JELLY) if (n <= cardCount(u)) expect(claimed, `card step ${n} missing ${u} ${msg()}`).toContain(n);
      }
      mustHave.clear();
      // 3) 떠난 사람 데이터 없음
      for (const u of ids.filter((x) => !m.present.has(x) && m.everJoined.has(x))) {
        expect(sql.prepare('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?').get(u), msg()).toEqual({ n: 0 });
        expect(sql.prepare('SELECT COUNT(*) AS n FROM bingo_lines WHERE user_id = ?').get(u), msg()).toEqual({ n: 0 });
      }
      // 4-0) 빙고 하루 기록: 기간·한국 날짜별 통화 분이 모델과 같아요(자정·기간 경계에 걸친 묶음 포함)
      {
        const rows = sql.prepare('SELECT week, user_id, day, minutes, crowd, night, attended FROM bingo_day').all() as { week: string; user_id: string; day: string; minutes: number; crowd: number; night: number; attended: number }[];
        const dbDays = new Map(rows.filter((x) => x.minutes > 0).map((x) => [`${x.week}|${x.user_id}|${x.day}`, x.minutes]));
        const want = new Map<string, number>();
        for (const [per, users] of bingo) for (const [u, x] of users) for (const [d, n] of x.days) want.set(`${per}|${u}|${d}`, n);
        expect(dbDays, `bingo_day ${msg()}`).toEqual(want);
        const att = new Set(rows.filter((x) => x.attended).map((x) => `${x.week}|${x.user_id}|${x.day}`));
        const wantAtt = new Set<string>();
        for (const [per, users] of bingo) for (const [u, x] of users) for (const d of x.attend) wantAtt.add(`${per}|${u}|${d}`);
        expect(att, `bingo attend ${msg()}`).toEqual(wantAtt);
        // 빙고 짝 통화(나갔다 온 사람은 나가기 전 짝 통화 빼고)
        const prs = sql.prepare(`SELECT x.week, x.user_id, x.other, x.minutes - COALESCE(r.minutes, 0) AS minutes FROM (
            SELECT week, a AS user_id, b AS other, minutes FROM bingo_pair UNION ALL SELECT week, b, a, minutes FROM bingo_pair) x
            LEFT JOIN bingo_pair_reset r ON r.week = x.week AND r.user_id = x.user_id AND r.other = x.other`).all() as { week: string; user_id: string; other: string; minutes: number }[];
        const dbPairs = new Map(prs.filter((x) => x.minutes > 0 && m.present.has(x.user_id)).map((x) => [`${x.week}|${x.user_id}|${x.other}`, x.minutes]));
        const wantPairs = new Map<string, number>();
        for (const [per, users] of bingo) for (const [u, x] of users) for (const [o, n] of x.pairs) wantPairs.set(`${per}|${u}|${o}`, n);
        expect(dbPairs, `bingo pair ${msg()}`).toEqual(wantPairs);
      }
      // 4) 빙고: 받은 줄은 모델로 계산한 지금 채운 줄 안에 있어야 해요(받은 기간마다)
      const got = sql.prepare('SELECT week, user_id, line FROM bingo_lines').all() as { week: string; user_id: string; line: number }[];
      for (const g of got) {
        const x = bingo.get(g.week)?.get(g.user_id);
        const st: BingoStats = emptyStats();
        if (x) {
          st.voice = x.voice; st.crowd = x.crowd; st.night = x.night; st.weekend = x.weekend;
          st.voiceDays = [...x.days.values()].filter((v) => v >= 30).length;
          st.attendDays = x.attend.size;
          st.partners = [...x.pairs.values()].filter((v) => v >= 10).length;
          st.bestPair = Math.max(0, ...x.pairs.values());
        }
        const per = sql.prepare('SELECT starts_at, ends_at FROM bingo_periods WHERE id = ?').get(g.week) as { starts_at: string; ends_at: string } | undefined;
        if (per) {
          const reset = (sql.prepare('SELECT COALESCE(reset_at, \'\') AS r FROM members WHERE user_id = ?').get(g.user_id) as { r: string }).r;
          st.praiseGiven = (sql.prepare('SELECT COUNT(*) AS n FROM praises WHERE from_id = ? AND created_at >= ? AND created_at < ? AND created_at >= ?').get(g.user_id, per.starts_at, per.ends_at, reset) as { n: number }).n;
          st.praiseGot = (sql.prepare('SELECT COUNT(*) AS n FROM praises WHERE to_id = ? AND created_at >= ? AND created_at < ? AND created_at >= ?').get(g.user_id, per.starts_at, per.ends_at, reset) as { n: number }).n;
        }
        const flags = sql.prepare('SELECT flag FROM bingo_flag WHERE week = ? AND user_id = ?').all(g.week, g.user_id) as { flag: string }[];
        st.web = flags.some((f) => f.flag === 'web') ? 1 : 0;
        st.panel = flags.some((f) => f.flag === 'panel') ? 1 : 0;
        const board = boardFor(g.week, g.user_id);
        const done = board.map((c) => (st[c.def.stat] as number) >= c.target);
        done.splice(CENTER, 0, false); // 팀 없음(이 시뮬은 팀을 만들지 않아요) → 가운데는 비어 있어야
        const earned = LINES.flatMap((l, i) => (l.every((c) => done[c]) ? [i] : []));
        if (g.line !== 8) expect(earned, `bingo line ${g.week} ${g.user_id} ${g.line} stats ${JSON.stringify(st)} ${msg()}`).toContain(g.line);
      }
    }
    if (process.env.SIM_STATS) console.log(`seed ${seed}`, JSON.stringify(sql.prepare("SELECT (SELECT COUNT(*) FROM purchases) buys, (SELECT COUNT(*) FROM praises) praises, (SELECT COUNT(*) FROM bingo_lines) lines, (SELECT COUNT(*) FROM card_count_rewards) cardsteps, (SELECT MAX(xp) FROM cards) maxxp, (SELECT COUNT(*) FROM members WHERE gender_chosen_at IS NOT NULL) chosen").get()));
  }
}, 600_000);
