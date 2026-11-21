// 시뮬레이션: 시즌 여러 개를 넘기며 통화방 1분 기록·탈퇴·재가입·초록하리보 역할 바뀜을 무작위로 보내고,
// 팀 퀘스트(같이 통화한 팀원 분)·서버 퀘스트(초록하리보와 같이 있던 분)·시즌 끝 보상이
// 따로 계산한 모델과 같은지 확인해요. SIM_STEPS·SIM_SEEDS로 늘릴 수 있어요.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';

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

const MIN = 60_000;
const DAY = 86_400_000;
const ids = Array.from({ length: 12 }, (_, i) => `5000000000000000${String(i).padStart(2, '0')}`);
const newbie = new Set(ids.filter((_, i) => i % 3 === 0));
const pk = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

type SeasonModel = {
  id: string;
  start: number;
  end: number;
  group: Map<string, number>; // 팀원 → 팀(떠난 사람 포함)
  left: Set<string>;
  pair: Map<string, number>; // 팀번호|a|b → 분
  kidnap: Map<string, number>; // 초록하리보|사람 → 분
  newbiesAtStart: number;
  settled: boolean;
  // 같은 시즌에 나갔다 온 사람의 나가기 전 분: team|나|상대, kidnap|나|초록하리보, kidnapped|나|상대
  reset: Map<string, number>;
};

afterEach(() => vi.useRealTimers());

it('시뮬: 시즌을 넘기며 팀·서버 퀘스트 분과 시즌 끝 보상이 모델과 같아요', async () => {
  const STEPS = Number(process.env.SIM_STEPS ?? 400);
  for (const seed of (process.env.SIM_SEEDS ?? '1,2,3').split(',').map(Number)) {
    const r = rng(seed);
    const { sql, db } = fakeD1();
    const env = { DB: db, SESSION_SECRET: 'sim', BOT_SYNC_SECRET: 'bot' } as Env;
    const cycleStart = Date.parse('2026-11-13T21:00:00Z');
    let now = cycleStart + 20 * MIN;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const seasonAt = (ms: number) => {
      const s = cycleStart + Math.floor((ms - cycleStart) / (14 * DAY)) * 14 * DAY;
      return { start: s, end: s + 14 * DAY };
    };
    const present = new Set(ids);
    const green = new Map(ids.map((u) => [u, true]));
    const joinedAt = new Map(ids.map((u) => [u, cycleStart - 60 * DAY]));
    const resetAt = new Map<string, number>(); // 재가입 시각
    const seasons = new Map<string, SeasonModel>();
    let batchNo = 0;
    let prev = now;
    const stats = { minutes: 0, leaves: 0, rejoins: 0, greenFlips: 0, teamRewards: 0, serverRewards: 0, seasons: 0 };

    const kstDayId = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

    for (let step = 0; step < STEPS; step++) {
      now += r() < 0.04 ? Math.floor(r() * 10) * 3_600_000 : Math.floor(1 + r() * 120) * MIN;
      vi.setSystemTime(now);
      const removed: string[] = [];
      const freshJoin = new Set<string>();
      // 사건: 탈퇴·재가입·초록하리보 역할
      const ev = r();
      if (ev < 0.03 && present.size > 4) {
        const u = [...present][Math.floor(r() * present.size)]!;
        present.delete(u);
        removed.push(u);
        stats.leaves++;
      } else if (ev < 0.06) {
        const gone = ids.filter((u) => !present.has(u));
        if (gone.length) {
          const u = gone[Math.floor(r() * gone.length)]!;
          present.add(u);
          joinedAt.set(u, now - MIN);
          resetAt.set(u, now - MIN);
          freshJoin.add(u);
          stats.rejoins++;
        }
      } else if (ev < 0.09) {
        const u = [...present][Math.floor(r() * present.size)]!;
        green.set(u, !green.get(u));
        stats.greenFlips++;
      }
      // 통화방 1분 기록: prev~now 사이 몇 분, 방 1~2개
      const rooms: { at: string; room: string; members: string[] }[] = [];
      const pool = [...present].filter((u) => !freshJoin.has(u));
      for (let room = 0; room < (r() < 0.5 ? 1 : 2); room++) {
        if (r() < 0.75 || pool.length < 2) continue;
        const n = 2 + Math.floor(r() * Math.min(4, pool.length - 1));
        const who = [...pool].sort(() => r() - 0.5).slice(0, n);
        for (const u of who) pool.splice(pool.indexOf(u), 1);
        const span = Math.floor((now - prev) / MIN);
        const k = Math.min(span, 1 + Math.floor(r() * (seed % 2 ? 8 : 40)));
        const from = prev + Math.floor(r() * (span - k + 1)) * MIN + 1000;
        for (let i = 0; i < k; i++) rooms.push({ at: new Date(from + i * MIN).toISOString(), room: `90000000000000000${room}`, members: who });
      }
      stats.minutes += rooms.length;
      const cur = seasonAt(now);
      const season = { start: new Date(cur.start).toISOString(), end: new Date(cur.end).toISOString() };
      const members = [...present].map((u) => ({ id: u, name: `n${u.slice(-2)}`, joined_at: new Date(joinedAt.get(u)!).toISOString(), is_newbie: newbie.has(u), green: green.get(u)! }));
      const body = { batch_id: `${new Date(now).toISOString()}-s${seed}b${++batchNo}`, members, removed, room_minutes: rooms, season, full_members: true };

      // ── 모델: 이번 묶음이 바꿀 시즌 팀 ──
      // 가끔 봇이 묶음을 만들고 늦게 보내요(웹 시각 = 받은 때). 다음 묶음은 받은 뒤에 만들어요.
      const deliver = r() < 0.15 ? now + Math.floor(r() * 60) * MIN : now;
      const t = deliver;
      for (const s of seasons.values()) if (s.end > t) for (const u of removed) if (s.group.has(u)) s.left.add(u);
      // 진행 중인 시즌에서 나가면, 그때까지 쌓인 분을 본인 판정에서 뺄 값으로 적어 둬요(나갈 때마다 새로)
      for (const s of seasons.values()) {
        if (s.end <= t) continue;
        for (const u of removed) {
          for (const k of [...s.reset.keys()]) if (k.split('|')[1] === u) s.reset.delete(k);
          for (const [k, m] of s.pair) {
            const [, a, b] = k.split('|') as [string, string, string];
            if (a === u || b === u) {
              const key = `team|${u}|${a === u ? b : a}`;
              s.reset.set(key, (s.reset.get(key) ?? 0) + m);
            }
          }
          for (const [k, m] of s.kidnap) {
            const [nb, v] = k.split('|') as [string, string];
            if (v === u) s.reset.set(`kidnap|${u}|${nb}`, m);
            if (nb === u) s.reset.set(`kidnapped|${u}|${v}`, m);
          }
        }
      }
      const targets = [...seasons.values()].filter((s) => s.id === kstDayId(cur.start) || rooms.some((x) => Date.parse(x.at) >= s.start && Date.parse(x.at) < s.end));
      const leftNow = new Map<string, Set<string>>();
      for (const s of targets) {
        const ln = new Set(removed.filter((u) => s.group.has(u)));
        if (s.id === kstDayId(cur.start)) {
          for (const u of present) {
            if (!s.group.has(u)) continue;
            if (!green.get(u) && !s.left.has(u)) {
              s.left.add(u);
              ln.add(u);
            } else if (green.get(u) && s.left.has(u) && !removed.includes(u)) s.left.delete(u); // 원래 팀으로
          }
        }
        leftNow.set(s.id, ln);
      }

      vi.setSystemTime(deliver);
      const res = await app.request('/api/bot/sync', { method: 'POST', headers: { Authorization: 'Bearer bot', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env);
      expect(res.status, await res.clone().text()).toBe(200);
      expect(((await res.json()) as { result: string }).result).toBe('applied');

      // 새 시즌이 생겼으면 팀 배정과 초록하리보 수를 받아 와요
      const curId = kstDayId(cur.start);
      if (!seasons.has(curId) && sql.prepare('SELECT 1 FROM seasons WHERE id = ?').get(curId)) {
        const rows = sql.prepare('SELECT user_id u, group_no g FROM season_members WHERE season_id = ?').all(curId) as { u: string; g: number }[];
        const sm: SeasonModel = { id: curId, start: cur.start, end: cur.end, group: new Map(rows.map((x) => [x.u, x.g])), left: new Set(), pair: new Map(), kidnap: new Map(), reset: new Map(), newbiesAtStart: [...present].filter((u) => newbie.has(u)).length, settled: false };
        // 처음 팀은 초록하리보 역할이 있는 지금 멤버 전부
        expect(new Set(rows.map((x) => x.u)), `seed ${seed} step ${step}`).toEqual(new Set([...present].filter((u) => green.get(u))));
        seasons.set(curId, sm);
        targets.push(sm);
        leftNow.set(curId, new Set());
        stats.seasons++;
      } else if (seasons.has(curId)) {
        // 시즌 중에 처음 들어온 사람(다른 시즌에 나갔다 온 사람 등)은 웹이 고른 팀을 받아요
        const s = seasons.get(curId)!;
        for (const x of sql.prepare('SELECT user_id u, group_no g FROM season_members WHERE season_id = ?').all(curId) as { u: string; g: number }[])
          if (!s.group.has(x.u)) {
            expect(green.get(x.u) && present.has(x.u), `late join ${x.u}`).toBe(true);
            s.group.set(x.u, x.g);
          }
      }
      for (const s of targets) {
        for (const room of rooms) {
          const at = Date.parse(room.at);
          if (at < s.start || at >= s.end) continue;
          const byG = new Map<number, string[]>();
          for (const u of room.members) {
            const inTeam = s.group.has(u) && (!s.left.has(u) || leftNow.get(s.id)!.has(u));
            if (inTeam) (byG.get(s.group.get(u)!) ?? byG.set(s.group.get(u)!, []).get(s.group.get(u)!)!).push(u);
          }
          for (const [g, gm] of byG)
            for (let i = 0; i < gm.length; i++)
              for (let j = i + 1; j < gm.length; j++) {
                const key = `${g}|${pk(gm[i]!, gm[j]!)}`;
                s.pair.set(key, (s.pair.get(key) ?? 0) + 1);
              }
          for (const nb of room.members) if (newbie.has(nb)) for (const u of room.members) if (u !== nb) s.kidnap.set(`${nb}|${u}`, (s.kidnap.get(`${nb}|${u}`) ?? 0) + 1);
        }
      }
      prev = now;
      now = deliver;

      // ── 확인: 분 기록 ──
      for (const s of seasons.values()) {
        const pairs = sql.prepare('SELECT group_no g, a, b, minutes m FROM gq_pair WHERE season_id = ?').all(s.id) as { g: number; a: string; b: string; m: number }[];
        expect(new Map(pairs.map((x) => [`${x.g}|${x.a}|${x.b}`, x.m])), `seed ${seed} step ${step} gq_pair ${s.id}`).toEqual(s.pair);
        const kid = sql.prepare('SELECT newbie_id n, user_id u, minutes m FROM kidnap_min WHERE season_id = ?').all(s.id) as { n: string; u: string; m: number }[];
        expect(new Map(kid.map((x) => [`${x.n}|${x.u}`, x.m])), `seed ${seed} step ${step} kidnap ${s.id}`).toEqual(s.kidnap);
        const left = sql.prepare('SELECT user_id u FROM season_members WHERE season_id = ? AND left_at IS NOT NULL').all(s.id) as { u: string }[];
        expect(new Set(left.map((x) => x.u)), `seed ${seed} step ${step} left ${s.id}`).toEqual(s.left);
        const sq = sql.prepare('SELECT newbies, target FROM server_quest WHERE season_id = ?').get(s.id) as { newbies: number; target: number } | undefined;
        expect(sq?.newbies, `server quest ${s.id}`).toBe(s.newbiesAtStart);
      }

      // ── 확인: 끝난 시즌 보상 ──
      for (const s of seasons.values()) {
        if (s.settled || now < s.end + 30 * MIN) continue;
        s.settled = true;
        const minutes = new Map<string, number>();
        for (const [k, m] of s.pair) {
          const [, a, b] = k.split('|');
          minutes.set(pk(a!, b!), (minutes.get(pk(a!, b!)) ?? 0) + m);
        }
        const teamWin = new Set<string>();
        for (const g of new Set(s.group.values())) {
          const all = [...s.group].filter(([, x]) => x === g).map(([u]) => u);
          const cand = all.filter((u) => !s.left.has(u));
          // 2026-11-21 전에 시작한 시즌: 팀 절반과 각각 30분, 절반 달성. 그 뒤: 팀원 누구와든 60분, 4명 달성(나리 2026-11-21)
          const old = s.id < '2026-11-21';
          const goal = old ? 30 : 60;
          const need = old ? Math.max(1, Math.min(cand.length - 1, Math.round(cand.length / 2))) : Math.min(cand.length - 1, 1);
          const ach = cand.filter((u) => all.filter((v) => v !== u && (minutes.get(pk(u, v)) ?? 0) - (s.reset.get(`team|${u}|${v}`) ?? 0) >= goal).length >= need);
          const target = old ? Math.min(Math.max(2, Math.round(cand.length / 2)), cand.length) : Math.min(4, cand.length);
          if (cand.length >= 2 && ach.length >= target) for (const u of ach) teamWin.add(u);
        }
        const kidRows = [...s.kidnap].filter(([, m]) => m >= 30).map(([k]) => k.split('|') as [string, string]);
        const kidnapped = new Set(kidRows.map(([nb]) => nb));
        const target = Math.max(1, Math.round(s.newbiesAtStart / 2));
        const part = new Set<string>();
        for (const [nb, u] of kidRows) {
          const m = s.kidnap.get(`${nb}|${u}`)!;
          if (m - (s.reset.get(`kidnapped|${nb}|${u}`) ?? 0) >= 30) part.add(nb);
          if (m - (s.reset.get(`kidnap|${u}|${nb}`) ?? 0) >= 30) part.add(u);
        }
        const serverWin = kidnapped.size >= target ? part : new Set<string>();
        const eligible = (u: string) => present.has(u) && (resetAt.get(u) ?? 0) < s.end;
        const jp = sql.prepare('SELECT user_id u, source, amount FROM jellypi WHERE season_id = ? AND source IN (\'team\', \'server\')').all(s.id) as { u: string; source: string; amount: number }[];
        expect(new Set(jp.filter((x) => x.source === 'team').map((x) => x.u)), `seed ${seed} team reward ${s.id}`).toEqual(new Set([...teamWin].filter(eligible)));
        expect(new Set(jp.filter((x) => x.source === 'server').map((x) => x.u)), `seed ${seed} server reward ${s.id}`).toEqual(new Set([...serverWin].filter(eligible)));
        stats.teamRewards += jp.filter((x) => x.source === 'team').length;
        stats.serverRewards += jp.filter((x) => x.source === 'server').length;
        // 결과 알림은 지금 있는 시즌 팀원 모두에게 한 번
        const alerts = sql.prepare('SELECT user_id u FROM alerts WHERE ref = ?').all(`season:${s.id}`) as { u: string }[];
        expect(alerts.length).toBe(new Set(alerts.map((x) => x.u)).size);
      }
    }
    if (process.env.SIM_STATS) console.log(`seed ${seed}`, JSON.stringify(stats));
  }
}, 600_000);
