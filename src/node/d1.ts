import { DatabaseSync } from 'node:sqlite';

type SQLiteBind = null | number | bigint | string | NodeJS.ArrayBufferView;

function bindValue(value: unknown): SQLiteBind {
  if (value === undefined) throw new TypeError('D1_ERROR: undefined는 SQL에 bind할 수 없어요');
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return value as NodeJS.ArrayBufferView;
  throw new TypeError(`D1_ERROR: 지원하지 않는 bind 값이에요 (${typeof value})`);
}

function meta(changes = 0, lastRowId = 0, rowsRead = 0): D1Meta & Record<string, unknown> {
  return {
    duration: 0,
    size_after: 0,
    rows_read: rowsRead,
    rows_written: changes,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    changes,
  };
}

class NodeD1Statement {
  constructor(
    private readonly owner: NodeD1Database,
    readonly query: string,
    private readonly values: SQLiteBind[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new NodeD1Statement(this.owner, this.query, values.map(bindValue)) as unknown as D1PreparedStatement;
  }

  // D1처럼 한 번 실행해서 반환 행(SELECT, RETURNING)과 실제 바뀐 행 수를 함께 돌려줘요.
  execute<T>(): D1Result<T> {
    const db = this.owner.sqlite;
    const before = Number((db.prepare('SELECT total_changes() AS n').get() as { n: number | bigint }).n);
    const results = db.prepare(this.query).all(...this.values) as T[];
    const after = Number((db.prepare('SELECT total_changes() AS n').get() as { n: number | bigint }).n);
    // D1처럼 트리거가 바꾼 행은 빼고 이 문장이 바꾼 행만 세요(total_changes는 트리거까지 세요).
    const changes = after > before ? Number((db.prepare('SELECT changes() AS n').get() as { n: number | bigint }).n) : 0;
    const lastRowId = changes > 0 ? Number((db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number | bigint }).id) : 0;
    return { success: true, results, meta: meta(changes, lastRowId, results.length) };
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.owner.sqlite.prepare(this.query).get(...this.values);
    if (!row) return null;
    if (columnName !== undefined) {
      // D1처럼 행은 있는데 그 열이 없으면 오류예요(열 이름 실수를 빈 결과로 숨기지 않게).
      if (!Object.prototype.hasOwnProperty.call(row, columnName)) throw new Error(`D1_ERROR: Column not found: ${columnName}`);
      return (row[columnName] ?? null) as T | null;
    }
    return row as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  executeBatch<T>(): D1Result<T> {
    return this.execute<T>();
  }

  belongsTo(database: NodeD1Database): boolean {
    return this.owner === database;
  }
}

export class NodeD1Database {
  readonly sqlite: DatabaseSync;

  constructor(path: string) {
    this.sqlite = new DatabaseSync(path);
    // D1도 외래 키 검사를 기본으로 켜므로 Node 쪽도 같은 설정을 사용해요.
    this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  }

  prepare(query: string): D1PreparedStatement {
    return new NodeD1Statement(this, query) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.transaction(() =>
      statements.map((statement) => {
        if (!(statement instanceof NodeD1Statement) || !statement.belongsTo(this)) {
          throw new TypeError('D1_ERROR: 다른 데이터베이스의 statement예요');
        }
        return statement.executeBatch<T>();
      }),
    );
  }

  execRaw(sql: string): void {
    this.sqlite.exec(sql);
  }

  transaction<T>(work: () => T): T {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.sqlite.exec('ROLLBACK');
      } catch {
        // 원래 오류를 유지해요.
      }
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

export function openD1(path: string): NodeD1Database {
  return new NodeD1Database(path);
}
