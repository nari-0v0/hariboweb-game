import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CHAR_OFFSETS } from '../src/char-offsets';
import type { Member } from '../src/env';
import { actJourney, startJourney, type JourneyState } from '../src/journey';
import type { JourneyBank, JourneyRecord, JourneyRun } from '../src/journey-db';
import { JourneyPage } from '../src/views/journey';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

const VIEWER: Member = { user_id: '100000000000000001', display_name: '테스트', avatar_url: null, joined_at: null, is_newbie: 0, active: 1, gender_chosen_at: '2026-01-01' };
const RECORD: JourneyRecord = { best: 0, clears: 0, rewardedToday: 0, farmed: {}, unlocked: 1, top: 0 };
const BANK: JourneyBank = { coins: 0, atk: 0, hp: 0, def: 0, weapon: 0, armor: 0, charm: 0, mats: {}, pets: {}, pet: null, tower: 0, towerAt: null, towerLast: null };

// 이긴 싸움이 있는 하루를 찾아요(싸우기 전 젤코인과 그 뒤 값을 같이 봐요).
function wonFight(): { before: JourneyState; after: JourneyState } {
  let s = startJourney('coin-reveal');
  for (let i = 0; i < 200 && !s.done; i++) {
    const next = actJourney(s, { a: 'idle' })!;
    if (next.fx?.won && !next.done && next.coins > next.fx.c0!) return { before: s, after: next };
    s = next;
  }
  throw new Error('이긴 싸움을 못 찾았어요');
}

const runOf = (state: JourneyState): JourneyRun => ({
  row: { id: 'r1', user_id: VIEWER.user_id, state: '', rev: 1, status: 'going', day: state.day, cleared: 0, xp: 0, jelly: 0, reward_day: null },
  state,
});

async function render(state: JourneyState) {
  return String(await (<JourneyPage viewer={VIEWER} art="/a.png" run={runOf(state)} result={null} record={RECORD} bank={BANK} dogam={{ cards: 0, levels: [] }} />));
}

describe('원정대 싸움 중 젤코인 (슬금님 제보 2026-11-20)', () => {
  it('싸움 기록에 싸우기 전 젤코인을 남겨요', () => {
    const { after } = wonFight();
    expect(after.fx!.c0).toBeLessThan(after.coins);
  });

  it('싸우는 동안은 싸우기 전 값, 모션이 끝나면 지금 값을 보여 줘요', async () => {
    const { after } = wonFight();
    const html = await render(after);
    expect(html).toContain('jr-coins-swap');
    expect(html).toContain(`<span class="jr-c0">🪙<small class="jr-lab">얻음</small> ${after.fx!.c0}</span>`);
    expect(html).toContain(`<span class="jr-c1">🪙<small class="jr-lab">얻음</small> ${after.coins}</span>`);
  });

  it('싸움이 없는 날은 젤코인을 하나만 보여 줘요', async () => {
    const { after } = wonFight();
    const html = await render({ ...after, fx: undefined });
    expect(html).not.toContain('jr-coins-swap');
    expect(html).toContain(`<span class="jr-coins"><span>🪙<small class="jr-lab">얻음</small> ${after.coins}</span></span>`);
  });

  it('움직임 줄이기 설정에서는 처음부터 지금 값만 보여요', () => {
    const css = readFileSync('public/styles.css', 'utf8');
    // 기본(모션 없음): 싸우기 전 값은 숨겨요
    expect(css).toContain('.jr-coins-swap .jr-c0 { opacity: 0; }');
    // 바꾸는 모션은 prefers-reduced-motion: no-preference 안에만 있어요
    const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference) {\n  .jr-fighting .jr-today'));
    const block = motion.slice(0, motion.indexOf('\n}\n'));
    expect(block).toContain('.jr-fighting .jr-coins-swap .jr-c0 { opacity: 1; animation: jr-gone 0s var(--reveal, 0s) both; }');
    expect(block).toContain('.jr-fighting .jr-coins-swap .jr-c1 { animation: jr-reveal 0s var(--reveal, 0s) both; }');
  });
});

describe('꾸밈 캐릭터 가운데 맞추기 (멍쑤님 제보 2026-11-20, 얼굴 기준으로 바꿈 #291)', () => {
  it('꼬리가 발 높이에 있어도 꼬리 때문에 크게 옮기지 않아요(얼굴을 가운데에 둬요)', () => {
    // 드래곤: 얼굴이 거의 가운데라 따로 옮기지 않아요(예전 발 기준일 땐 꼬리 때문에 7.6%)
    expect(CHAR_OFFSETS['deco/dragon.png']).toBeUndefined();
    // 꼬리 달린 동물 옷들도 예전 발 기준(7~9%)보다 덜 옮겨요
    for (const k of ['deco/fox.png', 'deco/wolf.png', 'deco/dino.png', 'deco/tiger.png', 'deco/raccoon.png']) expect(Math.abs(CHAR_OFFSETS[k] ?? 0)).toBeLessThan(6);
  });

  it('포니테일 멤버 캐릭터는 여전히 얼굴 쪽으로 옮겨요', () => {
    expect(CHAR_OFFSETS['girl-36-0.png']).toBeGreaterThan(10);
    expect(CHAR_OFFSETS['girl-43-0.png']).toBeGreaterThan(10);
    expect(CHAR_OFFSETS['girl-08-0.png']).toBeLessThan(-6);
  });

  it('기본 캐릭터는 발 가운데로 재서 손·귀에 끌려 쏠리지 않아요 (나리 2026-11-21 로도·도치·둥이·하프)', () => {
    for (const k of ['boy-35-0.png', 'boy-47-0.png', 'boy-33-1.png', 'boy-48-1.png', 'boy-34-0.png', 'girl-40-0.png', 'boy-43-0.png'])
      expect(Math.abs(CHAR_OFFSETS[k] ?? 0)).toBeLessThan(4);
  });

  it('스크립트는 얼굴 가운데를 먼저 찾고, 못 찾으면 몸 가운데를 써요', () => {
    const py = readFileSync('scripts/char_offsets.py', 'utf8');
    expect(py).toContain('def face_center');
    expect(py).toContain('def body_center');
  });
});
