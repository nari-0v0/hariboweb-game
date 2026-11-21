import app, { originDownResponse } from './index';
import type { Env } from './env';
import { canonicalImageRequest, forwardToOrigin, workerHandlesPath } from './origin-proxy';
import { maintenanceOn } from './maintenance';

// 광장은 없앴지만 이미 만든 Durable Object 칸은 Cloudflare 정리 단계 전까지 이름을 남겨 둬요.
export { PlazaRoom } from './plaza-room';

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext) {
    const protectedImage = workerHandlesPath(new URL(request.url).pathname);
    // 점검 중(MAINTENANCE)이면 원본 서버로 넘기지 않고 워커가 바로 점검 화면을 보여 줘요(서버를 옮기는 동안에도 쓸 수 있게).
    if (env.ORIGIN_URL?.trim() && !protectedImage && !maintenanceOn(env.MAINTENANCE)) {
      // 원본 서버가 꺼졌거나 35초 안에 답이 없거나(AI 재시도 15초+15초보다 길게) 앞단(Caddy 등)이 502·503·504를 주면 Cloudflare 기본 오류 대신 우리 "오류가 생겼어요!" 화면을 보여 줘요.
      try {
        const response = await forwardToOrigin(request, env, (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(35_000) }));
        // 앱이 스스로 보낸 503(점검·DB 한도)에는 Retry-After가 있어서 그대로 보여 줘요. 그 밖의 502·503·504는 서버가 멈춘 거예요.
        const appBusy = response.status === 503 && response.headers.has('Retry-After');
        if ([502, 503, 504].includes(response.status) && !appBusy) return originDownResponse(request);
        return response;
      } catch (error) {
        console.error('원본 서버 연결 실패', error instanceof Error ? error.message : String(error));
        return originDownResponse(request);
      }
    }
    // 보호 그림은 //char/·%2Fchar/처럼 써도 /char/로 맞춰서 그림 확인을 거치게 해요(2026-11-21 점검).
    return app.fetch(protectedImage ? canonicalImageRequest(request) : request, env, executionCtx);
  },
} satisfies ExportedHandler<Env>;
