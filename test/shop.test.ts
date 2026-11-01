import { describe, expect, it } from 'vitest';
import { DECO_CHARACTERS } from '../src/characters';
import { PRICES, REWARD_STEP, SHOP_ITEMS, canUse, canUseTheme, shopItem } from '../src/shop';
import { THEMES } from '../src/themes';

describe('jelly shop items', () => {
  it('sells every theme except basic and lists every deco character once', () => {
    const themes = SHOP_ITEMS.filter((i) => i.kind === 'theme');
    expect(themes.map((i) => i.key)).toEqual(THEMES.filter((t) => t.id !== 'basic').map((t) => t.id));
    expect(themes.every((i) => i.price === PRICES.theme)).toBe(true);
    const deco = SHOP_ITEMS.filter((i) => i.kind === 'deco');
    expect(deco.length).toBe(DECO_CHARACTERS.length);
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
  });

  it('makes the 25 fantasy characters 도감 rewards at 3, 6, 9… cards', () => {
    const rewards = SHOP_ITEMS.filter((i) => i.price === null);
    expect(rewards.length).toBe(25);
    expect(rewards.map((i) => i.rewardCards)).toEqual(rewards.map((_, n) => (n + 1) * REWARD_STEP));
    expect(SHOP_ITEMS.filter((i) => i.kind === 'deco' && i.price !== null).every((i) => i.price === PRICES.deco)).toBe(true);
  });

  it('only finds real items', () => {
    expect(shopItem('deco:maid')?.kind).toBe('deco');
    expect(shopItem('theme:basic')).toBeUndefined();
    expect(shopItem('deco:nope')).toBeUndefined();
    expect(shopItem(42)).toBeUndefined();
  });

  it('lets members use bought items and earned rewards only', () => {
    const bought = shopItem('deco:maid')!;
    const reward = SHOP_ITEMS.find((i) => i.rewardCards === REWARD_STEP)!;
    expect(canUse(bought, new Set(), 999)).toBe(false);
    expect(canUse(bought, new Set([bought.id]), 0)).toBe(true);
    expect(canUse(reward, new Set(), REWARD_STEP - 1)).toBe(false);
    expect(canUse(reward, new Set(), REWARD_STEP)).toBe(true);
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
  const { objectParticle, resultLines } = await import('../src/views/shop');
  it('picks 을/를 by the last letter', () => {
    expect(objectParticle('요리사')).toBe('를');
    expect(objectParticle('장미 테마')).toBe('를');
    expect(objectParticle('달밤')).toBe('을');
    expect(objectParticle('ABC')).toBe('을(를)');
  });
  it('says done, not enough jelly, or ask the owner', () => {
    expect(resultLines({ status: 'done', reason: null }, '달밤')[0]!.text).toBe('달밤 구매가 완료되었습니다.');
    expect(resultLines({ status: 'failed', reason: 'not_enough_jelly' }, '요리사')[0]!.text).toContain('요리사를 구매하지 못했습니다');
    const err = resultLines({ status: 'failed', reason: 'error' }, '장미').map((l) => l.text);
    expect(err).toEqual(['장미 구매 중 오류가 발생하였습니다.', '방장에게 문의해주세요.']);
  });
});
