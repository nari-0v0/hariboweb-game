import app, { originDownResponse } from './index';
import type { Env } from './env';
import { forwardToOrigin, workerHandlesPath } from './origin-proxy';
import { maintenanceOn } from './maintenance';
import { toActivityResponse, wantsActivityPage } from './activity';
import { activityScriptTag } from './views/activity';

// 광장은 없앴지만 이미 만든 Durable Object 칸은 Cloudflare 정리 단계 전까지 이름을 남겨 둬요.
export { PlazaRoom } from './plaza-room';

// 원본 서버가 멈췄을 때 워커가 직접 만드는 오류 화면도 디스코드 안이면 디스코드 안 화면으로 바꿔요(문의 링크가 열리게).
function downResponse(request: Request, env: Env): Response | Promise<Response> {
  const res = originDownResponse(request);
  return wantsActivityPage(env, request) ? toActivityResponse(res, activityScriptTag(env.DISCORD_CLIENT_ID)) : res;
}

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext) {
    const protectedImage = workerHandlesPath(new URL(request.url).pathname);
    // 점검 중(MAINTENANCE)이면 원본 서버로 넘기지 않고 워커가 바로 점검 화면을 보여 줘요(서버를 옮기는 동안에도 쓸 수 있게).
    if (env.ORIGIN_URL?.trim() && !protectedImage && !maintenanceOn(env.MAINTENANCE)) {
      // 원본 서버가 꺼졌거나 20초 안에 답이 없거나 앞단(Caddy 등)이 502·503·504를 주면 Cloudflare 기본 오류 대신 우리 "오류가 생겼어요!" 화면을 보여 줘요.
      try {
        const response = await forwardToOrigin(request, env, (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }));
        // 앱이 스스로 보낸 503(점검·DB 한도)에는 Retry-After가 있어서 그대로 보여 줘요. 그 밖의 502·503·504는 서버가 멈춘 거예요.
        const appBusy = response.status === 503 && response.headers.has('Retry-After');
        if ([502, 503, 504].includes(response.status) && !appBusy) return downResponse(request, env);
        return response;
      } catch (error) {
        console.error('원본 서버 연결 실패', error instanceof Error ? error.message : String(error));
        return downResponse(request, env);
      }
    }
    return app.fetch(request, env, executionCtx);
  },
} satisfies ExportedHandler<Env>;
