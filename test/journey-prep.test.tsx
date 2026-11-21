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
const RECORD: JourneyRecord = { best: 0, clears: 3, rewardedToday: 0, farmed: { 1: 2 }, unlocked: 4, top: 3 };
const BANK: JourneyBank = { coins: 180, atk: 1, hp: 0, def: 0, weapon: 1, armor: 0, charm: 0, mats: { 1: 3, 2: 1 }, pets: {}, pet: null, tower: 0, towerAt: null, towerLast: null };

async function render(prep?: string) {
  const html = String(
    await (
      <JourneyPage viewer={VIEWER} art="/a.png" run={null} result={null} record={RECORD} bank={BANK} dogam={{ cards: 0, levels: [] }} prep={prep} />
    ),
  );
  return html;
}

describe('원정 준비소 탭', () => {
  it('아직 기록이 없으면 가장 높이를 Lv.0 대신 "아직 없음"으로 보여요', async () => {
    const html = await render();
    expect(html).toContain('가장 높이 아직 없음');
    expect(html).not.toContain('가장 높이 Lv.0');
  });

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

describe('원정대 장 고르기', () => {
  const checked = (html: string) => [...html.matchAll(/<input type="radio" name="ch" value="(\d+)" checked/g)].map((m) => Number(m[1]));
  const page = (record: JourneyRecord) =>
    (async () => String(await (<JourneyPage viewer={VIEWER} art="/a.png" run={null} result={null} record={record} bank={BANK} dogam={{ cards: 0, levels: [] }} />)))();

  it('처음엔 갈 수 있는 가장 높은 장이 골라져 있어요', async () => {
    const top = checked(await page(RECORD));
    expect(top).toHaveLength(1);
    expect(top[0]).toBeGreaterThan(1);
  });

  it('오늘 떠난 원정 판 수를 하루 100판 중 몇 판인지 보여 줘요', async () => {
    const html = String(await (<JourneyPage viewer={VIEWER} art="/a.png" run={null} result={null} record={RECORD} bank={BANK} dogam={{ cards: 0, levels: [] }} runsToday={37} />));
    expect(html).toContain('🧭 37/100판');
    const full = String(await (<JourneyPage viewer={VIEWER} art="/a.png" run={null} result={null} record={RECORD} bank={BANK} dogam={{ cards: 0, levels: [] }} runsToday={120} />));
    expect(full).toContain('🧭 100/100판');
    expect(full).toContain('jr-runs full');
  });

  it('마지막으로 돈 장이 그대로 골라져 있어요', async () => {
    expect(checked(await page({ ...RECORD, last: 1 }))).toEqual([1]);
  });

  it('마지막 장을 못 가면 가장 높은 장으로 돌아가요', async () => {
    const top = checked(await page(RECORD))[0];
    expect(checked(await page({ ...RECORD, last: 9 }))).toEqual([top]);
  });
});
