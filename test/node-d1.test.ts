import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openD1, type NodeD1Database } from '../src/node/d1';
import { applyMigrations } from '../src/node/migrations';

const temporary: string[] = [];

function database(): { db: NodeD1Database; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'hariboweb-d1-'));
  temporary.push(directory);
  return { db: openD1(join(directory, 'test.sqlite')), directory };
}

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Node D1 호환 껍데기', () => {
  it('first/all/run과 D1 모양의 meta를 돌려줘요', async () => {
    const { db } = database();
    expect(await db.prepare('PRAGMA journal_mode').first()).toEqual({ journal_mode: 'wal' });
    expect(await db.prepare('PRAGMA busy_timeout').first()).toEqual({ timeout: 5000 });
    expect(await db.prepare('PRAGMA foreign_keys').first()).toEqual({ foreign_keys: 1 });
    db.execRaw('CREATE TABLE sample (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, enabled INTEGER, note TEXT)');

    const inserted = await db
      .prepare('INSERT INTO sample (name, enabled, note) VALUES (?, ?, ?)')
      .bind('하리보', true, null)
      .run();
    expect(inserted.success).toBe(true);
    expect(inserted.meta.changes).toBe(1);
    expect(inserted.meta.last_row_id).toBe(1);

    expect(await db.prepare('SELECT name, enabled, note FROM sample WHERE id = ?').bind(1).first()).toEqual({
      name: '하리보',
      enabled: 1,
      note: null,
    });
    const all = await db.prepare('SELECT id, name FROM sample ORDER BY id').all<{ id: number; name: string }>();
    expect(all).toMatchObject({ success: true, results: [{ id: 1, name: '하리보' }] });
    expect(all.meta.rows_read).toBe(1);
    expect(() => db.prepare('SELECT ?').bind(undefined)).toThrow(/undefined/);
    db.close();
  });

  it('batch 하나가 실패하면 앞 문장까지 모두 되돌려요', async () => {
    const { db } = database();
    db.execRaw('CREATE TABLE unique_value (value TEXT UNIQUE)');
    await expect(
      db.batch([
        db.prepare('INSERT INTO unique_value VALUES (?)').bind('same'),
        db.prepare('INSERT INTO unique_value VALUES (?)').bind('same'),
      ]),
    ).rejects.toThrow();
    expect(await db.prepare('SELECT COUNT(*) AS count FROM unique_value').first()).toEqual({ count: 0 });
    db.close();
  });

  it('빈 SQLite에 모든 마이그레이션을 번호 순서대로 한 번만 적용해요', async () => {
    const { db } = database();
    const first = await applyMigrations(db, join(process.cwd(), 'migrations'));
    expect(first).toHaveLength(53);
    expect(first[0]).toBe('0001_init.sql');
    expect(first.at(-1)).toBe('0053_tower_up_at.sql');
    expect(await applyMigrations(db, join(process.cwd(), 'migrations'))).toEqual([]);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first()).toEqual({ count: 53 });
    db.close();
  });
  it('run·all·batch가 반환 행과 실제 바뀐 행 수를 함께 돌려주고, 없는 열은 오류예요', async () => {
    const { db } = database();
    db.execRaw('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v INTEGER)');
    db.execRaw('INSERT INTO t (v) VALUES (1), (2), (3)');
    const updated = await db.prepare('UPDATE t SET v = v + 1').all();
    expect(updated.meta.changes).toBe(3);
    expect(updated.meta.changed_db).toBe(true);
    const selected = await db.prepare('SELECT 42 AS value').run();
    expect(selected.results).toEqual([{ value: 42 }]);
    expect(selected.meta.changes).toBe(0);
    const returning = await db.prepare('INSERT INTO t (v) VALUES (?) RETURNING id').bind(9).run();
    expect(returning.results).toEqual([{ id: 4 }]);
    expect(returning.meta.last_row_id).toBe(4);
    const [withInsert] = await db.batch([db.prepare('WITH x(n) AS (SELECT 7) INSERT INTO t (v) SELECT n FROM x')]);
    expect(withInsert!.meta.changes).toBe(1);
    await expect(db.prepare('SELECT 42 AS value').first('missing')).rejects.toThrow('Column not found');
    expect(await db.prepare('SELECT NULL AS value').first('value')).toBeNull();
    db.close();
  });
});
