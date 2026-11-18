import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { signSession } from '../src/crypto';
import { countActiveMembers, countOwnedCards, getOwnedItems, setDeco, type Profile } from '../src/db';
import type { Env, Member } from '../src/env';
import { REWARD_COUNT, rewardNeed, SHOP_ITEMS, usableDecos } from '../src/shop';
import { MySkins } from '../src/views/pages';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));
vi.mock('../src/db', async (original) => ({
  ...await original<typeof import('../src/db')>(),
  getMember: async () => ({
    user_id: '100000000000000001', display_name: '테스트', avatar_url: null,
    joined_at: null, is_newbie: 0, active: 1, gender_chosen_at: '2026-01-01',
  }),
  touchVisit: async () => {},
  getOwnedItems: vi.fn(),
  countOwnedCards: vi.fn(),
  countActiveMembers: vi.fn(),
  setDeco: vi.fn(),
}));

const USER = '100000000000000001';
const ENV = { SESSION_SECRET: 'skin-test-only', DB: {} } as Env;
const firstReward = SHOP_ITEMS.find((i) => i.rewardRank === 1)!;

describe('가진 꾸밈 캐릭터 목록', () => {
  it('산 캐릭터와 열린 보상 캐릭터만 보여 줘요', () => {
    const none = usableDecos(new Set(), 0, 100);
    expect(none).toEqual([]);
    const list = usableDecos(new Set(['deco:maid']), rewardNeed(1, 100), 100).map((i) => i.key);
    expect(list).toContain('maid');
    expect(list).toContain(firstReward.key);
    expect(list).not.toContain('hoodie'); // 안 산 캐릭터
    expect(list.filter((k) => SHOP_ITEMS.find((i) => i.key === k)?.rewardRank)).toHaveLength(1); // 다음 보상은 아직 잠김
    expect(REWARD_COUNT).toBeGreaterThan(1);
  });
});

describe('내 캐릭터 고르기 화면', () => {
  const viewer: Member = { user_id: USER, display_name: '나', avatar_url: null, joined_at: null, active: 1, is_newbie: 0 };
  const profile: Profile = { user_id: USER, solo_xp: 0, intro: '', theme_id: 'basic', character_id: 'girl-01', deco_id: 'maid', dogam_jelly: 0 };
  it('기본 캐릭터와 가진 캐릭터를 보여 주고, 쓰는 중인 것은 표시해요', async () => {
    const skins = usableDecos(new Set(['deco:maid', 'deco:hoodie']), 0, 100);
    const html = String(await (<MySkins viewer={viewer} profile={profile} skins={skins} />));
    expect(html).toContain('기본 캐릭터');
    expect(html).toContain('/char/deco/hoodie.png');
    expect(html).toContain('사용 중');
    expect(html).toContain('name="back" value="me"');
    expect(html).toContain('가진 캐릭터 3개');
    // 쓰는 중인 메이드에는 쓰기 버튼이 없어요(기본·후디 두 개만)
    expect(html.match(/action="\/api\/me\/deco"/g)).toHaveLength(2);
  });
});

describe('내 카드에서 캐릭터 바꾸기', () => {
  async function post(form: Record<string, string>) {
    const cookie = await signSession(ENV.SESSION_SECRET, { uid: USER, exp: Date.now() + 60_000 });
    return app.request('/api/me/deco', { method: 'POST', headers: { Cookie: `hs=${cookie}` }, body: new URLSearchParams(form) }, ENV);
  }
  beforeEach(() => {
    vi.mocked(setDeco).mockReset().mockResolvedValue(true);
    vi.mocked(getOwnedItems).mockResolvedValue(new Set(['deco:maid']));
    vi.mocked(countOwnedCards).mockResolvedValue(0);
    vi.mocked(countActiveMembers).mockResolvedValue(100);
  });

  it('가진 캐릭터를 고르면 꾸밈 캐릭터만 바꾸고 내 카드로 돌아가요', async () => {
    const res = await post({ deco: 'maid', back: 'me' });
    expect(res.headers.get('Location')).toBe('/me?skin=ok#skins');
    expect(setDeco).toHaveBeenCalledWith(ENV.DB, USER, 'maid');
  });

  it('기본 캐릭터로 돌아가면 꾸밈 캐릭터만 비워요', async () => {
    const res = await post({ deco: '', back: 'me' });
    expect(res.headers.get('Location')).toBe('/me?skin=ok#skins');
    expect(setDeco).toHaveBeenCalledWith(ENV.DB, USER, null);
  });

  it('안 가진 캐릭터는 바꾸지 않아요', async () => {
    const res = await post({ deco: 'hoodie', back: 'me' });
    expect(res.headers.get('Location')).toBe('/me?skin=locked#skins');
    expect(setDeco).not.toHaveBeenCalled();
  });

  it('상점에서 고르면 예전처럼 상점으로 돌아가요', async () => {
    const res = await post({ deco: 'maid' });
    expect(res.headers.get('Location')).toBe('/shop/deco?n=equipped');
  });
});
