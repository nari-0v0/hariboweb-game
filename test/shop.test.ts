import { describe, expect, it } from 'vitest';
import { DECO_CHARACTERS } from '../src/characters';
import { DECO_PRICES, PRICES, REWARD_COUNT, REWARD_STEP, SHOP_ITEMS, canUse, canUseTheme, rewardNeed, shopItem, shopOrder } from '../src/shop';
import { THEMES } from '../src/themes';

describe('jelly shop items', () => {
  it('sells every theme except basic and lists every deco character once', () => {
    const themes = SHOP_ITEMS.filter((i) => i.kind === 'theme');
    expect(themes.map((i) => i.key)).toEqual(THEMES.filter((t) => t.id !== 'basic').map((t) => t.id));
    // 나리: 테마는 20개부터, 물건마다 값이 달라요
    expect(themes.every((i) => i.price! >= PRICES.theme)).toBe(true);
    expect(new Set(themes.map((i) => i.price)).size).toBe(themes.length);
    const deco = SHOP_ITEMS.filter((i) => i.kind === 'deco');
    expect(deco.length).toBe(DECO_CHARACTERS.length);
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
  });

  it('makes the 26 fantasy characters + 11 mecha 도감 rewards in unlock order', () => {
    const rewards = SHOP_ITEMS.filter((i) => i.price === null);
    expect(rewards.length).toBe(37);
    expect(REWARD_COUNT).toBe(37);
    expect(rewards.map((i) => i.rewardRank)).toEqual(rewards.map((_, n) => n + 1));
    expect(rewards.filter((i) => i.key.startsWith('mech-')).length).toBe(11);
    expect(rewards.at(-1)!.key).toBe('robot'); // 로봇 기사는 그대로 맨 마지막
    // 메카는 기존 캐릭터 사이사이에(두 메카가 붙어 있지 않아요)
    const keys = rewards.map((i) => i.key);
    keys.forEach((k, n) => k.startsWith('mech-') && expect(keys[n + 1]!.startsWith('mech-')).toBe(false));
    // 나리: 꾸밈 캐릭터는 30개부터, 값이 여러 가지예요. 파는 캐릭터는 모두 값 표에 있어요
    const sold = SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price !== null);
    expect(sold.every((i) => i.price! >= PRICES.deco && DECO_PRICES[i.key] === i.price)).toBe(true);
    expect(new Set(sold.map((i) => i.price)).size).toBeGreaterThan(3);
  });

  it('only finds real items', () => {
    expect(shopItem('deco:maid')?.kind).toBe('deco');
    expect(shopItem('theme:basic')).toBeUndefined();
    expect(shopItem('deco:nope')).toBeUndefined();
    expect(shopItem(42)).toBeUndefined();
  });

  it('lets members use bought items and earned rewards only', () => {
    const bought = shopItem('deco:maid')!;
    const reward = SHOP_ITEMS.find((i) => i.rewardRank === 1)!;
    expect(canUse(bought, new Set(), 999, 10)).toBe(false);
    expect(canUse(bought, new Set([bought.id]), 0, 10)).toBe(true);
    expect(canUse(reward, new Set(), REWARD_STEP - 1, 10)).toBe(false);
    expect(canUse(reward, new Set(), REWARD_STEP, 10)).toBe(true);
    // 서버 인원이 많으면 더 모아야 하고, 마지막 캐릭터는 도감을 다 채워야 열려요
    expect(rewardNeed(1, 101)).toBe(4);
    expect(rewardNeed(REWARD_COUNT, 101)).toBe(100);
    expect(canUse(reward, new Set(), REWARD_STEP, 101)).toBe(false);
    for (let r = 2; r <= REWARD_COUNT; r++) expect(rewardNeed(r, 96)).toBeGreaterThan(rewardNeed(r - 1, 96));
    // 인원이 적어 최소 장수(3장씩)가 인원보다 크면, 도감을 다 채웠을 때 마지막 캐릭터까지 열려요
    expect(rewardNeed(REWARD_COUNT, 60)).toBe(59);
    expect(rewardNeed(1, 60)).toBe(REWARD_STEP);
  });

  it('keeps the card counts of the first 26 rewards exactly as before the mecha (nobody loses an unlocked one)', () => {
    const OLD = ['wizard', 'witch', 'knight', 'valkyrie', 'archer', 'rogue', 'assassin', 'elf', 'dark-elf', 'fairy', 'angel', 'demon', 'dragon-tamer', 'necromancer', 'priestess', 'monk', 'pirate', 'prince', 'princess', 'queen', 'king', 'summoner', 'alchemist', 'star-mage', 'reaper', 'robot'];
    const oldNeed = (rank: number, members: number) => {
      const others = Math.max(0, members - 1);
      return Math.min(Math.max(1, others), Math.max(rank * REWARD_STEP, Math.ceil((rank * others) / 26)));
    };
    for (const members of [1, 2, 5, 10, 30, 60, 99, 100, 150, 300])
      OLD.forEach((key, n) => expect(rewardNeed(shopItem(`deco:${key}`)!.rewardRank!, members)).toBe(oldNeed(n + 1, members)));
    // 지금 인원(99명)에서 메카가 열리는 장수(나리가 확인한 표)
    const mecha = SHOP_ITEMS.filter((i) => i.key.startsWith('mech-')).map((i) => rewardNeed(i.rewardRank!, 99));
    expect(mecha).toEqual([10, 17, 25, 36, 44, 51, 59, 66, 74, 85, 93]);
  });

  it('keeps the basic theme free and locks the rest until bought', () => {
    const theme = THEMES.find((t) => t.id !== 'basic')!.id;
    expect(canUseTheme('basic', new Set())).toBe(true);
    expect(canUseTheme(theme, new Set())).toBe(false);
    expect(canUseTheme(theme, new Set([`theme:${theme}`]))).toBe(true);
    expect(canUseTheme('made-up', new Set(['theme:made-up']))).toBe(false);
  });
});

describe('shop popup text', async () => {
  const { objectParticle, resultLines, OWNER_CONTACT_URL } = await import('../src/views/shop');
  it('picks 을/를 by the last letter', () => {
    expect(objectParticle('요리사')).toBe('를');
    expect(objectParticle('장미 테마')).toBe('를');
    expect(objectParticle('달밤')).toBe('을');
    expect(objectParticle('ABC')).toBe('을(를)');
  });
  it('says done, not enough jelly, or ask the owner', () => {
    expect(resultLines({ status: 'done', reason: null }, '달밤')[0]!.text).toBe('달밤 구매가 완료되었습니다.');
    expect(resultLines({ status: 'failed', reason: 'not_enough_jelly' }, '요리사')[0]!.text).toContain('요리사를 구매하지 못했습니다');
    expect(resultLines({ status: 'failed', reason: 'shop_changed' }, '달밤')[0]!.text).toContain('도감 젤리로 바뀌어서 달밤 구매가 취소되었습니다');
    const err = resultLines({ status: 'failed', reason: 'error' }, '장미').map((l) => l.text);
    expect(err).toEqual(['장미 구매 중 오류가 발생하였습니다.', '방장에게 문의해주세요.']);
    expect(resultLines({ status: 'failed', reason: 'error' }, '장미').some((l) => l.contact)).toBe(true);
    expect(resultLines({ status: 'failed', reason: 'not_enough_jelly' }, '장미').some((l) => l.contact)).toBe(false);
    expect(OWNER_CONTACT_URL).toBe('https://open.kakao.com/o/sznz9sHg');
  });
});

describe('shop order', () => {
  it('shows cheaper items first and, at the same price, in 가나다 order', () => {
    const list = SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price !== null).sort(shopOrder);
    for (let i = 1; i < list.length; i++) {
      const [a, b] = [list[i - 1]!, list[i]!];
      expect(a.price! <= b.price!, `${a.name} → ${b.name}`).toBe(true);
      if (a.price === b.price) expect(a.name.localeCompare(b.name, 'ko') <= 0, `${a.name} → ${b.name}`).toBe(true);
    }
    const at35 = list.filter((i) => i.price === 35).map((i) => i.name);
    expect(at35.indexOf('간호사')).toBeLessThan(at35.indexOf('건설공 소녀'));
    expect(at35.indexOf('건설공 소녀')).toBeLessThan(at35.indexOf('건설공 소년'));
  });
});
