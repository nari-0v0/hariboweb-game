import type { Env } from './env';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function workerHandlesPath(pathname: string): boolean {
  return /^\/(?:char|case|journey)\//.test(pathname);
}

// 그림은 Worker의 imageGuard가 계속 확인하고, 나머지는 본문을 읽지 않은 채 원본 서버로 넘겨요.
export async function forwardToOrigin(
  request: Request,
  env: Pick<Env, 'ORIGIN_URL' | 'ORIGIN_SECRET'>,
  fetcher: FetchFn = fetch,
): Promise<Response> {
  const origin = env.ORIGIN_URL?.trim();
  if (!origin) throw new Error('ORIGIN_URL이 비어 있어요');

  const incoming = new URL(request.url);
  // 경로가 //다른주소/... 이어도 호스트가 바뀌지 않게, ORIGIN_URL로 주소를 만든 뒤 경로와 검색어만 바꿔 넣어요.
  const target = new URL(origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  // 실제 Host는 fetch가 ORIGIN_URL에 맞게 만들고, 이용자가 접속한 Host는 별도 머리글로 보존해요.
  headers.delete('Host');
  headers.set('X-Forwarded-Host', incoming.host);
  headers.set('X-Origin-Secret', env.ORIGIN_SECRET ?? '');

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    // Node의 fetch도 같은 함수를 테스트할 수 있게 해요. Workers에서는 무시되는 값이에요.
    init.duplex = 'half';
  }
  return fetcher(target, init);
}
