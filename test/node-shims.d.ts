// 테스트에서만 쓰는 Node 기능의 최소 타입(@types/node를 따로 깔지 않으려고)
declare module 'node:sqlite' {
  interface StatementSync {
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
    run(...args: unknown[]): { changes: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare const process: { cwd(): string };
