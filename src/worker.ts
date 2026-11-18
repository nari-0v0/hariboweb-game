import app from './index';
import type { Env } from './env';
import { forwardToOrigin, workerHandlesPath } from './origin-proxy';
import { maintenanceOn } from './maintenance';

// 광장은 없앴지만 이미 만든 Durable Object 칸은 Cloudflare 정리 단계 전까지 이름을 남겨 둬요.
export { PlazaRoom } from './plaza-room';

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext) {
    const protectedImage = workerHandlesPath(new URL(request.url).pathname);
    // 점검 중(MAINTENANCE)이면 원본 서버로 넘기지 않고 워커가 바로 점검 화면을 보여 줘요(서버를 옮기는 동안에도 쓸 수 있게).
    if (env.ORIGIN_URL?.trim() && !protectedImage && !maintenanceOn(env.MAINTENANCE)) {
      return forwardToOrigin(request, env);
    }
    return app.fetch(request, env, executionCtx);
  },
} satisfies ExportedHandler<Env>;
