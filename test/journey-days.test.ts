import { describe, expect, it } from 'vitest';
import { CAMP_MISSING, actJourney, startJourney, stat, type JourneyState } from '../src/journey';

// 멍쑤님 제보(2026-11-17): 모닥불·같은 이벤트가 연달아 나와 뜻 없는 날이 이어지지 않게
describe('원정대 하루 일 고르기', () => {
  it('싸움이 아닌 같은 일이 이틀 연달아 나오지 않고, 같은 이벤트는 한 판에 한 번씩 먼저 나와요', () => {
    let camps = 0;
    for (let n = 0; n < 300; n++) {
      let s: JourneyState = startJourney(`days-${n}`);
      let prev: string | undefined;
      const events: string[] = [];
      while (!s.done) {
        const before = s;
        s = actJourney(s, { a: 'idle' })!;
        if (s.day === before.day) continue; // 고르기만 한 걸음
        const k = s.last;
        if (k && k !== 'foe' && k !== 'skill' && prev) expect(k).not.toBe(prev === 'skill' ? 'camp' : prev);
        if (k?.startsWith('event:') && prev?.startsWith('event:')) throw new Error('이벤트 연달아');
        if (k?.startsWith('event:')) events.push(k);
        if (k === 'camp' && s.today.some((l) => l.icon === '🏕️')) {
          camps++;
          expect(s.today.find((l) => l.icon === '🏕️')!.text).toMatch(/체력 \+[1-9]/);
        }
        prev = k;
      }
      const firstFour = events.slice(0, 4);
      expect(new Set(firstFour).size).toBe(firstFour.length);
    }
    expect(camps).toBeGreaterThan(0);
  });

  it('체력이 거의 꽉 찼으면 모닥불이 나오지 않아요', () => {
    for (let n = 0; n < 300; n++) {
      const s = startJourney(`full-${n}`);
      s.day = 3;
      s.hp = stat(s).maxHp;
      const t = actJourney(s, { a: 'next' })!;
      if (t.last === 'camp') expect(stat(t).maxHp - s.hp).toBeGreaterThanOrEqual(stat(t).maxHp * CAMP_MISSING);
      expect(t.today.some((l) => l.text.includes('노래를 불렀어요'))).toBe(false);
    }
  });
});
