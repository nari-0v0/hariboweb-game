import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { signSession } from '../src/crypto';
import type { Env } from '../src/env';
import { activeHand, betChips, expireHand, gambleRound, moveHand, type Game, type Round } from '../src/gamble-db';

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
  activeHand: vi.fn(),
  betChips: vi.fn(),
  betTooSoon: async () => false,
  claimDaily: async () => true,
  expireAllHands: async () => {},
  expireHand: vi.fn(async () => null as string | null),
  gambleAccount: async () => ({ chips: 15 }),
  gambleRanks: async () => [],
  gambleRound: vi.fn(),
  moveHand: vi.fn(),
}));

const USER = '100000000000000001';
const TOKEN = '6f3fcd87-7b57-43cb-919f-3930c62179ad';
const ENV = { SESSION_SECRET: 'route-test-only', DB: {} } as Env;
const GAMES = ['slot', 'roulette', 'cards'] as const;

function round(game: Game, multiplier: number | null = 0): Round {
  return {
    user_id: USER, token: TOKEN, game, bet: 20,
    state: game === 'slot' ? '[0,1,2]' : game === 'roulette' ? '0' :
      JSON.stringify({ player: [1, 2], dealer: [3, 4], deck: [5] }),
    expires_at: '2099-01-01T00:00:00.000Z', revision: 0, multiplier,
  };
}

async function request(path: string, form?: Record<string, string>) {
  const cookie = await signSession(ENV.SESSION_SECRET, { uid: USER, exp: Date.now() + 60_000 });
  return app.request(path, {
    method: form ? 'POST' : 'GET',
    headers: { Cookie: `hs=${cookie}` },
    body: form ? new URLSearchParams(form) : undefined,
  }, ENV);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(activeHand).mockResolvedValue(null);
  vi.mocked(gambleRound).mockResolvedValue(null);
});

describe('겜블장 로비와 게임 방', () => {
  it('로비에서 자정이 지난 카드 21을 정산하면 결과로 보내요', async () => {
    vi.mocked(expireHand).mockResolvedValueOnce(TOKEN);
    const response = await request('/gamble');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`/gamble/cards?r=${TOKEN}`);
  });

  it('이전 결과 주소에서 만료된 카드 판을 정산하면 방금 정산한 판을 보여 줘요', async () => {
    vi.mocked(expireHand).mockResolvedValueOnce(TOKEN);
    await request('/gamble/cards?r=6f3fcd87-7b57-43cb-919f-3930c62179ae');
    expect(gambleRound).toHaveBeenCalledWith(ENV.DB, USER, TOKEN);
  });

  it('전날 로비에서 다시 시작하면 날짜 변경 안내로 돌아가요', async () => {
    const response = await request('/gamble/rescue', { day: '2000-01-01' });
    expect(response.headers.get('location')).toBe('/gamble?n=rescue-day-changed');
  });
  it('로비에는 세 게임 방과 칭호 링크가 있고 칩을 거는 폼은 없다', async () => {
    const response = await request('/gamble');
    expect(response.status).toBe(200);
    const html = await response.text();
    for (const game of GAMES) expect(html).toContain(`href="/gamble/${game}"`);
    expect(html).toContain('오늘 젤칩 1000개 받았어요.');
    expect(html).toContain('href="/titles"');
    expect(html).not.toContain('class="gb-bet-steps"');
  });

  it.each(GAMES)('%s 시작 요청과 예전 결과 주소를 같은 게임 방으로 보낸다', async (game) => {
    vi.mocked(betChips).mockResolvedValue(round(game));
    vi.mocked(gambleRound).mockResolvedValue(round(game));
    const form = { token: TOKEN, bet: '20' };
    const post = await request(`/gamble/${game}/play`, form);
    const resultPath = `/gamble/${game}?r=${TOKEN}`;
    expect(post.status).toBe(303);
    expect(post.headers.get('location')).toBe(resultPath);
    expect(betChips).toHaveBeenCalledWith(ENV.DB, USER, game, 20, TOKEN, expect.any(String));
    const old = await request(`/gamble?r=${TOKEN}`);
    expect(old.status).toBe(302);
    expect(old.headers.get('location')).toBe(resultPath);
    expect(gambleRound).toHaveBeenCalledWith(ENV.DB, USER, TOKEN);
    const html = await (await request(resultPath)).text();
    expect(html).toContain(`action="/gamble/${game}/play"`);
    expect(html).toContain('name="bet" value="15"');
    expect(html).toContain('한 번 더');
    expect((await request(`/gamble/${game}/play`, { ...form, bet: '0' })).headers.get('location'))
      .toBe(`/gamble/${game}?n=bet`);
  });

  it('카드 21 진행 표시와 이어하기 링크가 있고 조작 후에도 카드 방으로 돌아온다', async () => {
    vi.mocked(activeHand).mockResolvedValue(round('cards', null));
    const lobby = await (await request('/gamble')).text();
    expect(lobby).toContain('<span class="gb-game-progress">진행 중</span>');
    for (const game of ['slot', 'roulette']) {
      const html = await (await request(`/gamble/${game}`)).text();
      expect(html).toContain('href="/gamble/cards">진행 중인 카드 21로 가기</a>');
    }
    const cards = await (await request('/gamble/cards')).text();
    expect(cards).toContain('가려진 카드');
    expect(cards).not.toContain('action="/gamble/cards/play"');
    vi.mocked(moveHand).mockResolvedValueOnce(true);
    const post = await request('/gamble/cards', { token: TOKEN, revision: '0', move: 'stand' });
    expect(post.status).toBe(303);
    expect(post.headers.get('location')).toBe(`/gamble/cards?r=${TOKEN}`);
    expect(moveHand).toHaveBeenCalledWith(ENV.DB, USER, TOKEN, 0, 'stand', expect.any(String));
    // 다른 탭에서 이미 진행해서 옛 버튼이 거절되면 알려 줘요
    vi.mocked(moveHand).mockResolvedValueOnce(false);
    const stale = await request('/gamble/cards', { token: TOKEN, revision: '0', move: 'stand' });
    expect(stale.headers.get('location')).toBe('/gamble/cards?n=stale');
  });
});
