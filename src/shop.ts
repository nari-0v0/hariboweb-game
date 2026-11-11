import { DECO_CHARACTERS } from './characters';
import { THEMES } from './themes';

// 젤리 상점 물건. 값은 여기서만 바꾸면 돼요.
// 테마는 젤리로 사고, 꾸밈 캐릭터는 대부분 젤리로 사요. 판타지 캐릭터는 도감 카드를 모으면 열려요.
export const PRICES = {
  theme: 30,
  deco: 20,
  gender: 30, // 성별 바꾸기(처음 한 번 고르는 건 무료)
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

// ── 디스코드에 적용되는 물건(벌점·경고 지우기, 닉네임 변경권) ─────────────
// 도감 젤리로 사면 하리보봇이 디스코드 쪽에 적용해요. 적용할 수 없으면(지울 벌점이 없음 등) 젤리를 돌려줘요.
// 벌점·경고 지우기는 살 때마다 값이 1.5배씩 올라요(나리 계획).
export type ServiceKey = 'penalty' | 'warning' | 'nickname';
export type ServiceItem = { id: string; key: ServiceKey; name: string; base: number; grow: number; text: string; done: string };

export const SERVICES: ServiceItem[] = [
  { id: 'svc:penalty', key: 'penalty', name: '벌점 1점 지우기', base: 100, grow: 1.5, text: '하리보 벌점을 1점 지워요. 살 때마다 값이 1.5배씩 올라요.', done: '벌점 1점이 지워졌습니다.' },
  { id: 'svc:warning', key: 'warning', name: '경고 1점 지우기', base: 200, grow: 1.5, text: '하리보 경고를 1점 지워요. 살 때마다 값이 1.5배씩 올라요.', done: '경고 1점이 지워졌습니다.' },
  {
    id: 'svc:nickname',
    key: 'nickname',
    name: '닉네임 변경권',
    base: 5,
    grow: 1,
    text: '디스코드 닉네임(앞부분)을 바꾸는 변경권이에요. 여기 매점에서 바로 써요. 겜블장 변경권과는 따로예요.',
    done: '닉네임 변경권 1장을 받았습니다. 아래 닉네임 변경권 칸에서 바로 쓸 수 있어요.',
  },
];

const SERVICE_BY_ID = new Map(SERVICES.map((s) => [s.id, s]));

export function serviceItem(id: unknown): ServiceItem | undefined {
  return typeof id === 'string' ? SERVICE_BY_ID.get(id) : undefined;
}

// 이번에 살 값: 지금까지 산 횟수만큼 1.5배씩(올림)
export function servicePrice(item: ServiceItem, bought: number): number {
  return Math.ceil(item.base * item.grow ** Math.max(0, bought));
}
