import { DECO_CHARACTERS } from './characters';
import { THEMES } from './themes';

// 젤리 상점 물건. 값은 여기서만 바꾸면 돼요.
// 테마는 젤리로 사고, 꾸밈 캐릭터는 대부분 젤리로 사요. 판타지 캐릭터는 도감 카드를 모으면 열려요.
export const PRICES = {
  theme: 30,
  deco: 20,
} as const;

// 판타지 캐릭터는 도감 카드 3장, 6장, 9장… 모을 때마다 하나씩 열려요(순서는 그림 순서).
export const REWARD_STEP = 3;

export type ShopItem = {
  id: string; // theme:rose, deco:maid
  kind: 'theme' | 'deco';
  key: string;
  name: string;
  price: number | null; // null이면 살 수 없고 보상으로만 열려요
  rewardCards: number | null; // 도감 카드 몇 장이면 열리는지
};

const FANTASY = new Set([
  'wizard', 'witch', 'knight', 'valkyrie', 'archer', 'rogue', 'assassin', 'elf', 'dark-elf', 'fairy',
  'angel', 'demon', 'dragon-tamer', 'necromancer', 'priestess', 'monk', 'pirate', 'prince', 'princess', 'queen',
  'king', 'summoner', 'alchemist', 'star-mage', 'reaper',
]);

const fantasyOrder = DECO_CHARACTERS.filter((d) => FANTASY.has(d.id)).map((d) => d.id as string);

export const SHOP_ITEMS: ShopItem[] = [
  ...THEMES.filter((t) => t.id !== 'basic').map(
    (t): ShopItem => ({ id: `theme:${t.id}`, kind: 'theme', key: t.id, name: t.name, price: PRICES.theme, rewardCards: null }),
  ),
  ...DECO_CHARACTERS.map((d): ShopItem => {
    const reward = fantasyOrder.indexOf(d.id);
    return {
      id: `deco:${d.id}`,
      kind: 'deco',
      key: d.id,
      name: d.name,
      price: reward >= 0 ? null : PRICES.deco,
      rewardCards: reward >= 0 ? (reward + 1) * REWARD_STEP : null,
    };
  }),
];

const BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

export function shopItem(id: unknown): ShopItem | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

export const decoItemId = (key: string) => `deco:${key}`;
export const themeItemId = (key: string) => `theme:${key}`;

// 이 멤버가 쓸 수 있는지: 산 물건이거나, 도감 카드를 충분히 모은 보상
export function canUse(item: ShopItem, owned: Set<string>, cardsOwned: number): boolean {
  if (owned.has(item.id)) return true;
  return item.rewardCards !== null && cardsOwned >= item.rewardCards;
}

export function canUseTheme(theme: string, owned: Set<string>): boolean {
  if (theme === 'basic') return true;
  const item = shopItem(themeItemId(theme));
  return !!item && owned.has(item.id);
}
