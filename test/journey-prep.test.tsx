import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { signSession } from '../src/crypto';
import type { Env, Member } from '../src/env';
import type { JourneyBank, JourneyRecord } from '../src/journey-db';
import { JourneyPage, prepTab } from '../src/views/journey';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));
vi.mock('../src/db', async (original) => ({
  ...(await original<typeof import('../src/db')>()),
  getMember: async () => VIEWER,
  touchVisit: async () => {},
}));
vi.mock('../src/journey-db', async (original) => ({
  ...(await original<typeof import('../src/journey-db')>()),
  buyPerk: async () => true,
  upgradeGear: async () => false,
}));

const VIEWER: Member = { user_id: '100000000000000001', display_name: '테스트', avatar_url: null, joined_at: null, is_newbie: 0, active: 1, gender_chosen_at: '2026-01-01' };
const RECORD: JourneyRecord = { best: 0, clears: 3, rewardedToday: 0, farmed: { 1: 2 }, unlocked: 4 };
const BANK: JourneyBank = { coins: 180, atk: 1, hp: 0, def: 0, weapon: 1, armor: 0, charm: 0, mats: { 1: 3, 2: 1 } };

async function render(prep?: string) {
  const html = String(
    await (
      <JourneyPage viewer={VIEWER} art="/a.png" run={null} result={null} record={RECORD} bank={BANK} dogam={{ cards: 0, levels: [] }} prep={prep} />
    ),
  );
  return html;
}

describe('원정 준비소 탭', () => {
  it('모르는 탭 값은 탭을 안 연 것으로 봐요', () => {
    expect(prepTab('gear')).toBe('gear');
    expect(prepTab('nope')).toBeNull();
    expect(prepTab(undefined)).toBeNull();
  });

  it('처음엔 버튼과 안내만 있고 탭 내용은 없어요', async () => {
    const html = await render();
    for (const t of ['bag', 'train', 'gear']) expect(html).toContain(`?prep=${t}#perks`);
    expect(html).toContain('jp-tip');
    expect(html).not.toContain('jp-pane');
  });

  it('누른 탭 내용만 보여 주고, 같은 버튼을 다시 누르면 닫혀요', async () => {
    const bag = await render('bag');
    expect(bag).toContain('jp-bag');
    expect(bag).not.toContain('jp-gear');
    expect(bag).toContain('href="?#perks"');
    const gear = await render('gear');
    expect(gear).toContain('/api/journey/gear');
    expect(gear).toMatch(/jp-pane-title[^<]*<span[^>]*>⚒️<\/span> 장비 강화/);
    expect(gear).not.toContain('jp-bag');
    const train = await render('train');
    expect(train).toContain('/api/journey/perk');
    expect(train).not.toContain('/api/journey/gear');
    expect(await render('x')).not.toContain('jp-pane');
  });
});

describe('훈련·장비 강화 뒤 돌아오는 곳', () => {
  const ENV = { SESSION_SECRET: 'route-test-only', DB: {} } as Env;
  async function post(path: string, k: string) {
    const cookie = await signSession(ENV.SESSION_SECRET, { uid: VIEWER.user_id, exp: Date.now() + 60_000 });
    return app.request(path, { method: 'POST', headers: { Cookie: `hs=${cookie}` }, body: new URLSearchParams({ k }) }, ENV);
  }
  it('훈련하면 훈련 탭으로 돌아와요', async () => {
    const r = await post('/api/journey/perk', 'atk');
    expect(r.status).toBe(303);
    expect(r.headers.get('Location')).toBe('/expedition/go?prep=train&n=perk#perks');
  });
  it('장비 강화는 실패해도 장비 탭으로 돌아와요', async () => {
    const r = await post('/api/journey/gear', 'weapon');
    expect(r.status).toBe(303);
    expect(r.headers.get('Location')).toBe('/expedition/go?prep=gear&n=nogear#perks');
  });
});
