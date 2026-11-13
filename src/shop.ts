import { DECO_CHARACTERS } from './characters';
import { THEMES } from './themes';

// 젤리 상점 물건. 값은 여기서만 바꾸면 돼요.
// 테마는 젤리로 사고, 꾸밈 캐릭터는 대부분 젤리로 사요. 판타지 캐릭터는 도감 카드를 모으면 열려요.
// 테마와 꾸밈 캐릭터는 물건마다 값이 달라요(나리: 테마 20~, 캐릭터 30~). 표에 없는 새 물건은 제일 싼 값이에요.
export const PRICES = {
  theme: 20, // 테마 시작값
  deco: 30, // 꾸밈 캐릭터 시작값
  gender: 30, // 성별 바꾸기(처음 한 번 고르는 건 무료)
} as const;

export const THEME_PRICES: Record<string, number> = {
  moonnight: 20,
  rose: 22,
  teaparty: 24,
  ice: 26,
  mermaid: 28,
  forest: 30,
  space: 35,
  blackgold: 40,
  cyber: 45,
  racing: 50,
};

const DECO_TIERS: [number, string[]][] = [
  [30, ['hoodie', 'pink-knit', 'student', 'sailor', 'office', 'winter', 'winter-scarf', 'red-cap', 'prep', 'camper', 'bookworm', 'courier']],
  [35, ['teacher', 'professor', 'nurse', 'barista', 'baker', 'chef', 'painter', 'photographer', 'soccer', 'basketball', 'tennis', 'baseball', 'swimmer', 'varsity', 'beret-girl', 'sailor-boy', 'sunflower', 'skater']],
  [40, ['rabbit', 'bear', 'puppy', 'calico', 'frog', 'chick', 'duck', 'sheep', 'hamster', 'cow', 'monkey', 'koala', 'seal', 'penguin', 'deer', 'raccoon']],
  [45, ['fox', 'wolf', 'tiger', 'panda', 'polar-bear', 'red-panda', 'shark', 'dino', 'bunny-hoodie', 'bunny-pajama', 'cat-girl', 'wolf-jacket', 'gamer-girl', 'streamer', 'guitarist', 'ballerina', 'detective', 'explorer', 'techwear']],
  [50, ['maid', 'butler', 'rocker', 'black-dress', 'cyber', 'idol']],
  [60, ['gothic', 'lolita', 'kimono', 'admiral', 'dragon']],
];
export const DECO_PRICES: Record<string, number> = Object.fromEntries(DECO_TIERS.flatMap(([price, ids]) => ids.map((id) => [id, price])));

// 판타지 캐릭터는 도감 카드 3장, 6장, 9장… 모을 때마다 하나씩 열려요(순서는 그림 순서).
export const REWARD_STEP = 3; // 멤버가 적을 때도 캐릭터마다 최소 이만큼은 모아야 해요
// 판타지 캐릭터 N번째가 열리는 도감 카드 수: 지금 서버 인원(나 빼고)을 판타지 캐릭터 수로 나눠 고르게 늘어나요.
// 마지막 캐릭터는 도감을 다 채워야 열려요. 사람이 늘거나 줄면 같이 바뀌어요.
export function rewardNeed(rank: number, members: number): number {
  const others = Math.max(0, members - 1);
  // 도감을 다 채우면(나 빼고 모든 멤버 카드) 어떤 캐릭터든 열려요. 최소 장수가 인원보다 커지면 인원까지만 요구해요.
  return Math.min(Math.max(1, others), Math.max(rank * REWARD_STEP, Math.ceil((rank * others) / REWARD_COUNT)));
}

export type ShopItem = {
  id: string; // theme:rose, deco:maid
  kind: 'theme' | 'deco';
  key: string;
  name: string;
  price: number | null; // null이면 살 수 없고 보상으로만 열려요
  rewardRank: number | null; // 판타지 캐릭터 몇 번째인지(1부터). 필요한 카드 수는 rewardNeed로 계산해요
};

const FANTASY = new Set([
  'wizard', 'witch', 'knight', 'valkyrie', 'archer', 'rogue', 'assassin', 'elf', 'dark-elf', 'fairy',
  'angel', 'demon', 'dragon-tamer', 'necromancer', 'priestess', 'monk', 'pirate', 'prince', 'princess', 'queen',
  'king', 'summoner', 'alchemist', 'star-mage', 'reaper',
]);

const fantasyOrder = DECO_CHARACTERS.filter((d) => FANTASY.has(d.id)).map((d) => d.id as string);
export const REWARD_COUNT = fantasyOrder.length;

export const SHOP_ITEMS: ShopItem[] = [
  ...THEMES.filter((t) => t.id !== 'basic').map(
    (t): ShopItem => ({ id: `theme:${t.id}`, kind: 'theme', key: t.id, name: t.name, price: THEME_PRICES[t.id] ?? PRICES.theme, rewardRank: null }),
  ),
  ...DECO_CHARACTERS.map((d): ShopItem => {
    const reward = fantasyOrder.indexOf(d.id);
    return {
      id: `deco:${d.id}`,
      kind: 'deco',
      key: d.id,
      name: d.name,
      price: reward >= 0 ? null : (DECO_PRICES[d.id] ?? PRICES.deco),
      rewardRank: reward >= 0 ? reward + 1 : null,
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
export function canUse(item: ShopItem, owned: Set<string>, cardsOwned: number, members: number): boolean {
  if (owned.has(item.id)) return true;
  return item.rewardRank !== null && cardsOwned >= rewardNeed(item.rewardRank, members);
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
