import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearReadAlerts, deleteAlert, listAlerts, markAlertsRead, purgeAlerts, seasonLabel, seasonResultAlerts } from '../src/alerts';
import { getMember } from '../src/db';

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

const A = '100000000000000001';
const B = '100000000000000002';
const NOW = Date.parse('2026-11-17T03:00:00Z');
const DAY = 86_400_000;

function setup() {
  const f = fakeD1();
  f.sql.prepare("INSERT INTO members (user_id, display_name, active, updated_at) VALUES (?, 'a', 1, 'x')").run(A);
  const add = f.sql.prepare('INSERT INTO alerts (user_id, ref, title, body, created_at) VALUES (?, ?, ?, ?, ?)');
  add.run(A, 'r1', '새 알림', '내용', new Date(NOW - DAY).toISOString());
  add.run(A, 'r2', '오래된 알림', '내용', new Date(NOW - 16 * DAY).toISOString());
  add.run(B, 'r1', '남의 알림', '내용', new Date(NOW).toISOString());
  return f;
}

describe('알림함', () => {
  it('15일 안의 내 알림만 보이고, 열면 읽음이 돼요', async () => {
    const { db } = setup();
    const list = await listAlerts(db, A, NOW);
    expect(list.map((a) => a.title)).toEqual(['새 알림']);
    expect(list[0]!.read_at).toBeNull();
    await markAlertsRead(db, A, NOW);
    expect((await listAlerts(db, A, NOW))[0]!.read_at).not.toBeNull();
  });

  it('빨간 점 수는 안 읽은 알림만 세요', async () => {
    const { sql, db } = setup();
    sql.prepare("UPDATE alerts SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE ref = 'r1'").run();
    expect((await getMember(db, A))?.unread_alerts).toBe(1);
    await markAlertsRead(db, A, Date.now());
    expect((await getMember(db, A))?.unread_alerts).toBe(0);
  });

  it('읽은 알림만 지울 수 있고, 남의 알림은 못 지워요', async () => {
    const { sql, db } = setup();
    const id = (sql.prepare("SELECT id FROM alerts WHERE user_id = ? AND ref = 'r1'").get(A) as { id: number }).id;
    const other = (sql.prepare('SELECT id FROM alerts WHERE user_id = ?').get(B) as { id: number }).id;
    expect(await deleteAlert(db, A, id)).toBe(false); // 아직 안 읽음
    await markAlertsRead(db, A, NOW);
    expect(await deleteAlert(db, A, other)).toBe(false);
    expect(await deleteAlert(db, A, id)).toBe(true);
    await markAlertsRead(db, B, NOW);
    expect(await clearReadAlerts(db, A)).toBe(1); // 오래된 것(읽음 처리됨)
    expect((sql.prepare('SELECT COUNT(*) AS n FROM alerts WHERE user_id = ?').get(B) as { n: number }).n).toBe(1);
  });

  it('15일 지난 알림은 지워요', async () => {
    const { sql, db } = setup();
    await purgeAlerts(db, NOW).run();
    expect((sql.prepare('SELECT ref FROM alerts ORDER BY id').all() as { ref: string }[]).map((r) => r.ref)).toEqual(['r1', 'r1']);
  });

  it('시즌 결과 문구', () => {
    expect(seasonLabel('2026-11-02T15:00:00Z', '2026-11-16T15:00:00Z')).toBe('11.3~11.16');
    const lines = seasonResultAlerts(
      [
        { complete: false, bonus: false, achievers: [A], members: [{ id: A, left: false }, { id: B, left: false }, { id: 'x', left: true }] },
        { complete: true, bonus: true, achievers: [], members: [{ id: 'y', left: false }] },
      ],
      { met: false, participants: [B] },
      { teamJelly: 3, teamJp: 3, serverJelly: 5, serverJp: 2 },
    );
    expect([...lines.keys()]).toEqual([A, B]);
    expect(lines.get(A)).toEqual(['🤝 팀 퀘스트: 내 목표는 달성했지만 팀이 완료하지 못해서 보상은 없어요.']);
    expect(lines.get(B)).toEqual(['🤝 팀 퀘스트: 이번에는 달성하지 못했어요.', '🟢 납치 대소동: 참여했지만 서버 목표를 채우지 못해서 보상은 없어요.']);
  });
});
