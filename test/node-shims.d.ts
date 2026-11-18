// 기존 테스트의 작은 D1 가짜 객체는 값을 unknown[]으로 모아 node:sqlite에 넘겨요.
// 운영 코드는 src/node/d1.ts에서 undefined와 지원하지 않는 값을 따로 막습니다.
declare module 'node:sqlite' {
  interface StatementSync {
    all(...anonymousParameters: unknown[]): Record<string, SQLOutputValue>[];
    get(...anonymousParameters: unknown[]): Record<string, SQLOutputValue> | undefined;
    run(...anonymousParameters: unknown[]): StatementResultingChanges;
  }
}
