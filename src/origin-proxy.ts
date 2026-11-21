import type { Env } from './env';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// 경로를 한 가지 모양으로 풀어요: %2F·%5C·%63 같은 %표기를 풀고(두 번 감싼 것까지), \를 /로, 겹친 //를 하나로.
// //char/x.png, /%2Fchar/x.png, /%2fchar/x.png처럼 써도 보호 그림 폴더로 알아보게요(2026-11-21 점검).
export function plainPath(pathname: string): string {
  let p = pathname;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(p);
    } catch {
      break;
    }
    if (next === p) break;
    p = next;
  }
  return p.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

export function workerHandlesPath(pathname: string): boolean {
  return /^\/(?:char|case|journey)\//i.test(plainPath(pathname));
}

// 보호 그림 주소를 //char/·%2Fchar/처럼 다르게 써서 왔으면 /char/… 모양으로 바꿔요. 그래야 앱의 그림 확인(imageGuard)
// 길로 들어가요. ..가 섞인 경로는 바꾸지 않아요(위 폴더로 가는 길을 열지 않게).
export function canonicalImageRequest(request: Request): Request {
  const url = new URL(request.url);
  const plain = plainPath(url.pathname);
  if (!workerHandlesPath(plain) || plain === url.pathname || /(?:^|\/)\.\.?(?:\/|$)/.test(plain)) return request;
  return new Request(url.origin + plain + url.search, request);
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
