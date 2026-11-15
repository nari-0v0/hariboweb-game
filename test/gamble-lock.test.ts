import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { signSession } from '../src/crypto';
import type { Env } from '../src/env';
import { betChips, claimDaily, rescueChips } from '../src/gamble-db';

// 스위치를 켠 상태(GAMBLE_LOCKED = true)를 미리 확인해요
vi.mock('../src/gamble', async (original) => ({ ...await original<typeof import('../src/gamble')>(), GAMBLE_LOCKED: true }));
vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));
vi.mock('../src/db', async (original) => ({
  ...await original<typeof import('../src/db')>(),
  getMember: async () => ({
    user_id: '100000000000000001', display_name: '테스트', avatar_url: null,
    joined_at: null, is_newbie: 0, active: 1, gender_chosen_at: '2026-01-01',
  }),
  touchVisit: async () => {},
}));
vi.mock('../src/gamble-db', async (original) => ({
  ...await original<typeof import('../src/gamble-db')>(),
  betChips: vi.fn(),
  claimDaily: vi.fn(),
  rescueChips: vi.fn(),
}));

const USER = '100000000000000001';
const ENV = { SESSION_SECRET: 'lock-test-only', DB: {} } as Env;

async function request(path: string, form?: Record<string, string>) {
  const cookie = await signSession(ENV.SESSION_SECRET, { uid: USER, exp: Date.now() + 60_000 });
  return app.request(path, {
    method: form ? 'POST' : 'GET',
    headers: { Cookie: `hs=${cookie}` },
    body: form ? new URLSearchParams(form) : undefined,
  }, ENV);
}

describe('겜블장 잠금', () => {
  it('로비와 게임 방은 잠금 안내만 보여 줘요', async () => {
    for (const path of ['/gamble', '/gamble/slot', '/gamble/coinflip?r=6f3fcd87-7b57-43cb-919f-3930c62179ad']) {
      const res = await request(path);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain('겜블장은 지금 잠겨 있어요');
    }
    expect(claimDaily).not.toHaveBeenCalled();
  });

  it('젤칩 걸기·다시 시작·카드 진행 요청은 막아요', async () => {
    for (const path of ['/gamble/slot/play', '/gamble/play', '/gamble/cards', '/gamble/rescue']) {
      const res = await request(path, { bet: '10', token: '6f3fcd87-7b57-43cb-919f-3930c62179ad', game: 'slot' });
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/gamble');
    }
    expect(betChips).not.toHaveBeenCalled();
    expect(rescueChips).not.toHaveBeenCalled();
  });

  it('메뉴에는 링크 대신 잠금 표시가 나와요', async () => {
    const html = await (await request('/gamble')).text();
    expect(html).toContain('menu-locked');
    expect(html).not.toContain('href="/gamble"');
  });
});
