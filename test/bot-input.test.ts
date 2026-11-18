import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

const routes = [
  '/api/bot/assign-blocks/1/posted',
  '/api/bot/assign-blocks/1/decide',
  '/api/bot/ai-logs/posted',
  '/api/bot/gender',
  '/api/bot/praise',
];
describe('봇 API의 JSON null 입력', () => {
  it.each(routes)('%s: 서버 오류 대신 입력 오류 JSON을 돌려주고 DB를 건드리지 않아요', async (path) => {
    const prepare = vi.fn(() => { throw new Error('invalid input must not reach DB'); });
    const response = await app.request(path, {
      method: 'POST', headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' }, body: 'null',
    }, { BOT_SYNC_SECRET: 's', DB: { prepare } } as unknown as Env);
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toHaveProperty('error');
    expect(prepare).not.toHaveBeenCalled();
  });
});
