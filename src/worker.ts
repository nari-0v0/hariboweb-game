import app from './index';
import type { Env } from './env';
import { forwardToOrigin, workerHandlesPath } from './origin-proxy';

// 광장은 없앴지만 이미 만든 Durable Object 칸은 Cloudflare 정리 단계 전까지 이름을 남겨 둬요.
export { PlazaRoom } from './plaza-room';

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext) {
    const protectedImage = workerHandlesPath(new URL(request.url).pathname);
    if (env.ORIGIN_URL?.trim() && !protectedImage) {
      return forwardToOrigin(request, env);
    }
    return app.fetch(request, env, executionCtx);
  },
} satisfies ExportedHandler<Env>;
