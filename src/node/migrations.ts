import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NodeD1Database } from './d1';

const TABLE = `CREATE TABLE IF NOT EXISTS d1_migrations(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;

const migrationNumber = (name: string) => Number.parseInt(name.split('_', 1)[0] ?? '', 10);

export async function applyMigrations(database: NodeD1Database, directory: string): Promise<string[]> {
  database.execRaw(TABLE);
  const { results } = await database
    .prepare('SELECT name FROM d1_migrations ORDER BY id')
    .all<{ name: string }>();
  const applied = new Set(results.map((row) => row.name));
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => migrationNumber(a) - migrationNumber(b) || a.localeCompare(b));
  const completed: string[] = [];

  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(directory, name), 'utf8');
    const escaped = name.replaceAll("'", "''");
    database.transaction(() => {
      database.execRaw(sql);
      database.execRaw(`INSERT INTO d1_migrations (name) VALUES ('${escaped}')`);
    });
    completed.push(name);
  }
  return completed;
}
