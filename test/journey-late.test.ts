import { describe, expect, it } from 'vitest';
import { CHAPTERS, MAX_CHAPTER, chapterAtk, chapterBg, chapterPower } from '../src/journey-chapters';
import { GEAR_MAX, MATERIALS, gearBonus, gearNeed, journeyJelly } from '../src/journey';
import { JOURNEY_NEEDS, JOURNEY_RELEASE, journeyNeed, journeyOpenTo, journeyReleased, releaseText, releasedTop } from '../src/unlock';
import { TITLES, titleProgress, type TitleStats } from '../src/titles';
import { BAND_MAX, petCap } from '../src/pets';

const everyone = { cards: 70, levels: Array(70).fill(99) };
const kst = (day: string) => new Date(`${day}T00:00:00+09:00`);

describe('원정대 10~15장', () => {
  it('15장까지 있고, 장마다 재료·도감 조건·여는 날이 있어요', () => {
    expect(MAX_CHAPTER).toBe(15);
    expect(CHAPTERS.map((c) => c.n)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(MATERIALS).toHaveLength(15);
    expect(JOURNEY_NEEDS).toHaveLength(15);
    expect(journeyNeed(10)).toEqual({ cards: 60, lv: 20, lvCards: 8 });
    expect(journeyNeed(15)).toEqual({ cards: 70, lv: 35, lvCards: 12 });
    expect(Object.keys(JOURNEY_RELEASE).map(Number)).toEqual([10, 11, 12, 13, 14, 15]);
  });
  it('지금은 10~15장이 "준비 중"으로 잠겨 있어서 도감을 다 채워도 9장까지만 열려요', () => {
    expect(Object.values(JOURNEY_RELEASE).every((d) => d === null)).toBe(true);
    expect(journeyOpenTo(everyone, kst('2030-01-01'))).toBe(9);
    expect(journeyReleased(9, kst('2020-01-01'))).toBe(true);
    expect(journeyReleased(10, kst('2030-01-01'))).toBe(false);
    expect(releaseText(10)).toBe('준비 중이에요');
    expect(releaseText(9)).toBe('');
    expect(releasedTop(MAX_CHAPTER)).toBe(9); // 장비도 +9까지만
  });
  it('여는 날을 정하면 그날(한국 0시)부터 열려요', () => {
    const saved = { ...JOURNEY_RELEASE };
    Object.assign(JOURNEY_RELEASE, { 10: '2027-01-04', 11: '2027-03-01', 12: '2027-05-03', 13: '2027-07-05', 14: '2027-09-06', 15: '2027-11-01' });
    try {
      expect(journeyOpenTo(everyone, kst('2027-01-03'))).toBe(9);
      expect(journeyOpenTo(everyone, new Date(kst('2027-01-04').getTime() - 1))).toBe(9);
      expect(journeyOpenTo(everyone, kst('2027-01-04'))).toBe(10);
      expect(journeyOpenTo(everyone, kst('2027-09-06'))).toBe(14);
      expect(journeyOpenTo(everyone, kst('2027-11-01'))).toBe(15);
      expect(journeyOpenTo({ cards: 61, levels: Array(61).fill(99) }, kst('2027-12-01'))).toBe(10);
      expect(releaseText(10)).toBe('1월 4일에 열려요');
      expect(releaseText(15)).toBe('11월 1일에 열려요');
    } finally {
      for (const k of Object.keys(JOURNEY_RELEASE)) JOURNEY_RELEASE[Number(k)] = saved[Number(k)] ?? null;
    }
  });
  it('10장부터는 장마다 배경이 있고, 1~9장은 날짜별 배경 그대로예요', () => {
    expect(chapterBg(9)).toBeNull();
    expect(chapterBg(10)).toBe('/journey/bg/c10-bg.webp');
    expect(chapterBg(15)).toBe('/journey/bg/c15-bg.webp');
  });
  it('1~9장 몬스터 세기는 그대로이고, 10장부터 더 가파르게 세져요', () => {
    expect(chapterPower(9)).toBeCloseTo(1 + 0.45 * 8);
    expect(chapterAtk(9)).toBeCloseTo(1 + 0.7 * 8);
    for (let n = 10; n <= 15; n++) {
      expect(chapterAtk(n) - chapterAtk(n - 1)).toBeGreaterThan(0.7);
      expect(chapterPower(n) - chapterPower(n - 1)).toBeGreaterThan(0.45);
    }
  });
  it('장비는 +15까지, +N에는 N장 재료가 들어요', () => {
    expect(GEAR_MAX).toBe(15);
    for (let n = 10; n <= 15; n++) {
      expect(gearNeed(n).ch).toBe(n);
      expect(gearBonus('weapon', n)).toBeGreaterThan(gearBonus('weapon', n - 1));
      expect(gearNeed(n).coins).toBeGreaterThan(gearNeed(n - 1).coins);
    }
    expect(gearBonus('weapon', 16)).toBe(gearBonus('weapon', 15));
  });
  it('도감 젤리: 9장 첫 클리어 10개, 15장 첫 클리어 10개 더, 그 밖엔 없어요', () => {
    expect(journeyJelly(true, 9, 8)).toBe(10);
    expect(journeyJelly(true, 10, 9)).toBe(0);
    expect(journeyJelly(true, 14, 13)).toBe(0);
    expect(journeyJelly(true, 15, 14)).toBe(10);
    expect(journeyJelly(true, 15, 15)).toBe(0);
    expect(journeyJelly(false, 15, 14)).toBe(0);
  });
  it('15장을 깨면 칭호 「시간정복」', () => {
    const t = TITLES.find((x) => x.id === 'journey-15')!;
    expect(t.name).toBe('시간정복');
    const base = { bestXp: 0, ownXp: 0, friendXps: [], cards: 0, seasons: [], fullClears: 0, bingoLines: 0, bingoFull: 0, praiseGot: 0, praiseGave: 0, voiceSeconds: 0 } satisfies TitleStats;
    expect(titleProgress(t, { ...base, journeyTop: 14 }).ok).toBe(false);
    expect(titleProgress(t, { ...base, journeyTop: 15 }).ok).toBe(true);
    expect(titleProgress(t, base).ok).toBe(false);
  });
  it('펫은 그대로 9장 재료까지(이미 키운 펫이 바뀌지 않아요)', () => {
    expect(BAND_MAX).toBe(45);
    expect(petCap(9)).toBe(Infinity);
    expect(petCap(8)).toBe(40);
  });
});

describe('10장 배경 화면', () => {
  it('싸움·길 화면은 그 장 배경, 모닥불 쉬는 날은 밤 배경', async () => {
    const { Stage } = await import('../src/views/journey');
    const { startJourney } = await import('../src/journey');
    const s = { ...startJourney('bg', undefined, 10), day: 3 };
    expect(String(Stage({ s, art: '/a.webp', name: 'n', lost: false }))).toContain('/journey/bg/c10-bg.webp');
    const nine = { ...startJourney('bg', undefined, 9), day: 3 };
    expect(String(Stage({ s: nine, art: '/a.webp', name: 'n', lost: false }))).not.toContain('c9-bg');
  });
});

describe('장 고르기 화면', () => {
  it('9장을 깨고 도감을 다 채워도 10장은 고를 수 없고 "준비 중"이 보여요', async () => {
    const { ChapterPick } = await import('../src/views/journey');
    const html = String(ChapterPick({ unlocked: 10, top: 9, dogam: everyone, farmed: {}, coins: 0 }));
    expect(html).toMatch(/value="10"[^>]*disabled/);
    expect(html).toContain('🚧 준비 중이에요');
    expect(html).not.toMatch(/value="9"[^>]*disabled/);
  });
});
