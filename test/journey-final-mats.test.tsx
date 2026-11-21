import { describe, expect, it, vi } from 'vitest';
import type { Member } from '../src/env';
import { actJourney, autoChoice, startJourney, type JourneyState } from '../src/journey';
import type { JourneyBank, JourneyRecord, JourneyRun } from '../src/journey-db';
import { JourneyPage } from '../src/views/journey';

vi.mock('../src/plaza-room', () => ({ PlazaRoom: class {} }));

const VIEWER: Member = { user_id: '100000000000000001', display_name: '테스트', avatar_url: null, joined_at: null, is_newbie: 0, active: 1, gender_chosen_at: '2026-01-01' };
const RECORD: JourneyRecord = { best: 0, clears: 0, rewardedToday: 0, farmed: {}, unlocked: 1, top: 0 };

// 싸움으로 끝난 원정(마지막 싸움 미리보기가 나오는 결과)
function finished(): JourneyState {
  for (let k = 0; k < 50; k++) {
    let s = startJourney(`final-mats-${k}`);
    for (let i = 0; i < 400 && !s.done; i++) s = actJourney(s, (s.pending ? autoChoice(s) : null) ?? { a: 'idle' }) ?? s;
    if (s.done && s.fx) return s;
  }
  throw new Error('싸움으로 끝난 원정을 못 찾았어요');
}

describe('원정대 마지막 싸움 미리보기의 재료 칸 (Codex #301)', () => {
  it('결과 앞 마지막 싸움에도 재료 칸이 있고, 이미 넣은 재료는 보유에서 빼요', async () => {
    const s = { ...finished(), matsBanked: 2, mats: 2 };
    const run: JourneyRun = { row: { id: 'r1', user_id: VIEWER.user_id, state: '', rev: 1, status: 'done', day: s.day, cleared: 1, xp: 0, jelly: 0, reward_day: null }, state: s };
    const bank: JourneyBank = { coins: 0, atk: 0, hp: 0, def: 0, weapon: 0, armor: 0, charm: 0, mats: { [s.ch ?? 1]: 9 }, pets: {}, pet: null, tower: 0, towerAt: null, towerLast: null };
    const html = String(await (<JourneyPage viewer={VIEWER} art="/a.png" run={null} result={run} record={RECORD} bank={bank} dogam={{ cards: 0, levels: [] }} />));
    expect(html).toContain('jr-final-fight');
    expect(html).toContain('jr-mat-hud');
    expect(html).toContain('<small>보유</small>7');
  });
});
