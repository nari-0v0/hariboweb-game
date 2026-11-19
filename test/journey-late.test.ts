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
    expect(journeyNeed(9)).toEqual({ cards: 48, lv: 20, lvCards: 5 });
    expect(journeyNeed(10)).toEqual({ cards: 50, lv: 25, lvCards: 8 });
    expect(journeyNeed(15)).toEqual({ cards: 55, lv: 45, lvCards: 12 });
    // 나리 2026-11-19: 카드는 15장 55장이 끝, 장마다 조건이 내려가지 않아요
    for (let n = 2; n <= 15; n++) {
      expect(journeyNeed(n).cards).toBeGreaterThanOrEqual(journeyNeed(n - 1).cards);
      expect(journeyNeed(n).lv ?? 0).toBeGreaterThanOrEqual(journeyNeed(n - 1).lv ?? 0);
    }
    expect(Object.keys(JOURNEY_RELEASE)).toEqual([]); // 나리 2026-11-19: 날짜 잠금 없이 도감 조건만
  });
  it('10~15장은 도감 조건만 채우면 열려요', () => {
    expect(journeyOpenTo(everyone)).toBe(15);
    expect(journeyReleased(10)).toBe(true);
    expect(releaseText(10)).toBe('');
    expect(releasedTop(MAX_CHAPTER)).toBe(15); // 장비도 +15까지
    expect(journeyOpenTo({ cards: 49, levels: Array(49).fill(99) })).toBe(9);
    expect(journeyOpenTo({ cards: 50, levels: Array(50).fill(99) })).toBe(10);
    expect(journeyOpenTo({ cards: 55, levels: Array(55).fill(44) })).toBe(14); // 15장은 Lv45 카드 12장
    expect(journeyOpenTo({ cards: 55, levels: Array(55).fill(24) })).toBe(9); // 10장은 Lv25 카드 8장
  });
  it('나중에 새 장을 날짜로 잠그면: null은 "준비 중", 날짜는 그날(한국 0시)부터 열려요', () => {
    try {
      Object.assign(JOURNEY_RELEASE, { 10: '2027-01-04', 15: null });
      expect(journeyOpenTo(everyone, kst('2027-01-03'))).toBe(9);
      expect(journeyOpenTo(everyone, new Date(kst('2027-01-04').getTime() - 1))).toBe(9);
      expect(journeyOpenTo(everyone, kst('2027-01-04'))).toBe(14);
      expect(releaseText(10)).toBe('1월 4일에 열려요');
      expect(releaseText(15)).toBe('준비 중이에요');
      expect(releasedTop(MAX_CHAPTER, kst('2030-01-01'))).toBe(14);
    } finally {
      for (const k of Object.keys(JOURNEY_RELEASE)) delete JOURNEY_RELEASE[Number(k)];
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
  it('9장을 깨고 도감을 다 채우면 10장을 고를 수 있어요', async () => {
    const { ChapterPick } = await import('../src/views/journey');
    const html = String(ChapterPick({ unlocked: 10, top: 9, dogam: everyone, farmed: {}, coins: 0 }));
    expect(html).not.toMatch(/value="10"[^>]*disabled/);
    expect(html).not.toContain('준비 중');
  });
  it('도감 조건이 모자라면 10장은 "도감이 필요해요"로 잠겨요', async () => {
    const { ChapterPick } = await import('../src/views/journey');
    const html = String(ChapterPick({ unlocked: 10, top: 9, dogam: { cards: 49, levels: Array(49).fill(99) }, farmed: {}, coins: 0 }));
    expect(html).toMatch(/value="10"[^>]*disabled/);
    expect(html).toContain('도감이 필요해요');
  });
  it('앞 장 조건이 깨지면 뒤 장 조건을 채워도 화면에서도 못 골라요(서버와 같게)', async () => {
    const { ChapterPick } = await import('../src/views/journey');
    const p = { cards: 47, levels: Array(47).fill(99) };
    const html = String(ChapterPick({ unlocked: 10, top: 9, dogam: p, farmed: {}, coins: 0 }));
    expect(html).toMatch(/value="9"[^>]*disabled/);
    expect(html).toMatch(/value="10"[^>]*disabled/);
    expect(html).toContain('name="kl" value="8"');
  });
});

describe('끝없는 탑은 15장(300층)까지가 기준이에요', () => {
  it('탑 몬스터·재료가 10~15장까지 나와요', async () => {
    const { towerMonster, towerFoe, towerMat } = await import('../src/tower');
    const all = new Set(CHAPTERS.flatMap((c) => [...c.foes, c.elite, c.boss].map((m) => m.key)));
    const late = new Set(CHAPTERS.filter((c) => c.n >= 10).flatMap((c) => [...c.foes, c.elite, c.boss].map((m) => m.key)));
    let sawLate = false;
    for (let f = 1; f <= 400; f++) {
      const k = towerMonster(f).key;
      expect(all.has(k), `${f}층`).toBe(true);
      if (late.has(k)) sawLate = true;
    }
    expect(sawLate).toBe(true);
    expect(towerMat(300, 15)?.ch).toBe(15);
    expect(towerFoe(301).hp).toBeGreaterThan(towerFoe(299).hp);
  });
});

