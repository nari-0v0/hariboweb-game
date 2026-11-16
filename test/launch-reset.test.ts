import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { giveStarterJelly } from '../src/db';
import { loadTitleStats } from '../src/title-db';
import { praiseBox } from '../src/praise-note';

it('개시 초기화를 두 번 실행해도 겜블장과 이번 팀은 보존하고 옛 보상·칭찬·칭호는 되살리지 않아요', async () => {
  const sql = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) sql.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const stmt = (query: string, args: unknown[] = []) => ({
    query, args,
    bind: (...a: unknown[]) => stmt(query, a),
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    first: async () => sql.prepare(query).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
  });
  const db = {
    prepare: stmt,
    batch: async (list: ReturnType<typeof stmt>[]) => {
      sql.exec('BEGIN');
      try {
        const results = list.map((s) => /^\s*SELECT/i.test(s.query)
          ? { results: sql.prepare(s.query).all(...s.args) }
          : { results: [], meta: { changes: Number(sql.prepare(s.query).run(...s.args).changes) } });
        sql.exec('COMMIT');
        return results;
      } catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  } as unknown as D1Database;
  const now = Date.now();
  const iso = (offset: number) => new Date(now + offset).toISOString();
  sql.exec(`INSERT INTO members (user_id, display_name, updated_at, starter_jelly_at) VALUES ('a', 'a', 'x', 'given'), ('b', 'b', 'x', NULL);
    INSERT INTO profiles (user_id, solo_xp, dogam_jelly, title_id, title_applied, updated_at) VALUES ('a', 100, 99, 'gamble-season-winner', 'gamble-season-winner', 'x'), ('b', 0, 0, 'ace', 'ace', 'x');
    INSERT INTO owned_items (user_id, item_id, acquired_at) VALUES ('a', 'title:gamble-season-winner', 'x'), ('a', 'title:ace', 'x');
    INSERT INTO cards (owner_id, target_id, xp, first_met, updated_at) VALUES ('a', 'b', 400, 'x', 'x');
    INSERT INTO gamble_accounts (user_id, chips, won) VALUES ('a', 1000, 500);`);
  // 미완료 겜블 판도 초기화에 영향을 받지 않아야 해요(베팅 젤칩 100은 트리거로 차감).
  sql.exec(`INSERT INTO gamble_rounds (user_id, token, game, bet, all_in, state, expires_at) VALUES ('a', 'pending', 'cards', 100, 0, '{}', '2099-01-01');`);
  for (const [id, start, end] of [['old', iso(-3 * 86400000), iso(-86400000)], ['current', iso(-86400000), iso(86400000)]]) {
    sql.prepare('INSERT INTO seasons (id, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?)').run(id, start, end, start);
    sql.prepare("INSERT INTO season_members (season_id, user_id, group_no, start_member, joined_at) VALUES (?, 'a', 0, 1, ?)").run(id, start);
  }
  sql.exec(`INSERT INTO gamble_season_winners VALUES ('old', 'a', 500, 'x');
    INSERT INTO team_pairs VALUES ('current', 0, 'a', 'b');
    INSERT INTO server_quest VALUES ('current', 36, 18, 'x');
    INSERT INTO season_settle VALUES ('old', 'team', 'x', 'x'), ('old', 'server', 'x', 'x');
    INSERT INTO praises (day, from_id, to_id, created_at, note) VALUES ('2026-11-14', 'b', 'a', '2026-11-14T00:00:00.000Z#old', '옛 칭찬');
    INSERT INTO bingo_lines VALUES ('old', 'a', 0, 'x', 'x');
    INSERT INTO kidnap_min VALUES ('current', 'b', 'a', 30);
    INSERT INTO gq_pair VALUES ('current', 0, 'a', 'b', 30);`);
  const keep = ['gamble_accounts', 'gamble_rounds', 'gamble_season_winners', 'team_pairs', 'server_quest', 'season_settle'];
  const saved = keep.map((table) => sql.prepare(`SELECT * FROM ${table}`).all());
  for (let n = 0; n < 2; n++) {
    sql.exec(readFileSync('scripts/launch-reset.sql', 'utf8'));
    await giveStarterJelly(db, ['a', 'b']);
    for (const id of ['a', 'b']) expect(sql.prepare('SELECT dogam_jelly, solo_xp FROM profiles WHERE user_id = ?').get(id)).toEqual({ dogam_jelly: 5, solo_xp: 0 });
    expect(keep.map((table) => sql.prepare(`SELECT * FROM ${table}`).all())).toEqual(saved);
    expect(sql.prepare('SELECT season_id FROM season_members').all()).toEqual([{ season_id: 'current' }]);
    expect(sql.prepare('SELECT item_id FROM owned_items').all()).toEqual([{ item_id: 'title:gamble-season-winner' }]);
    expect(sql.prepare("SELECT title_id, title_applied FROM profiles WHERE user_id = 'b'").get()).toEqual({ title_id: null, title_applied: 'ace' });
    expect(sql.prepare("SELECT title_id FROM profiles WHERE user_id = 'a'").get()).toEqual({ title_id: 'gamble-season-winner' });
    const stats = await loadTitleStats(db, 'a', iso(0));
    expect([stats.bestXp, stats.bingoLines, stats.praiseGot, stats.fullClears]).toEqual([0, 0, 0, 0]);
    expect(stats.seasons).toEqual([]);
    expect(await praiseBox(db, 'a')).toEqual({ unread: 0, total: 0, items: [] });
    for (const table of ['cards', 'bingo_lines', 'gq_pair', 'kidnap_min']) expect(sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
  }
});
