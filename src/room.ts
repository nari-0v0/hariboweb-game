// 내 방 꾸미기: 멤버마다 방이 하나 있고, 도감 젤리로 가구·벽지·바닥을 사서 꾸며요.
// 방은 가로 10칸 × 세로 7칸. 위 2줄은 벽(벽 장식만), 아래 5줄은 바닥(가구만)이에요.
// 가구 그림은 나리가 만든 픽셀 그림이 오기 전까지 이모지로 보여 줘요(art가 생기면 그림을 써요).

export const COLS = 10;
export const ROWS = 7;
export const WALL_ROWS = 2;
export const MAX_ITEMS = 40;
export const ME = 'me'; // 방 주인 캐릭터(늘 있어요)

export type Zone = 'wall' | 'floor';
export type Furniture = {
  key: string;
  name: string;
  emoji: string;
  art?: string; // 나리 그림이 생기면 /room/<key>.png
  w: number;
  h: number;
  zone: Zone;
  price: number; // 0이면 처음부터 가지고 있어요
  cat: '기본' | '거실' | '취미' | '식물' | '동물' | '간식' | '벽 장식';
};

const f = (key: string, name: string, emoji: string, cat: Furniture['cat'], price: number, w = 1, h = 1, zone: Zone = 'floor'): Furniture => ({
  key,
  name,
  emoji,
  cat,
  price,
  w,
  h,
  zone,
});

export const FURNITURE: Furniture[] = [
  f('chair', '나무 의자', '🪑', '기본', 0),
  f('plant', '작은 화분', '🪴', '기본', 0),
  f('window', '창문', '🪟', '기본', 0, 1, 1, 'wall'),
  f('sofa', '푹신 소파', '🛋️', '거실', 15, 2, 1),
  f('bed', '포근 침대', '🛏️', '거실', 15, 2, 1),
  f('tv', '텔레비전', '📺', '거실', 10),
  f('bath', '거품 욕조', '🛁', '거실', 15, 2, 1),
  f('mirror', '전신 거울', '🪞', '거실', 6),
  f('lamp', '스탠드 조명', '💡', '거실', 4),
  f('basket', '빨래 바구니', '🧺', '거실', 3),
  f('pc', '컴퓨터', '🖥️', '취미', 12),
  f('console', '게임기', '🎮', '취미', 8),
  f('arcade', '오락기', '🕹️', '취미', 12),
  f('guitar', '기타', '🎸', '취미', 8),
  f('piano', '피아노', '🎹', '취미', 18, 2, 1),
  f('drum', '드럼', '🥁', '취미', 10),
  f('mic', '노래방 마이크', '🎤', '취미', 6),
  f('books', '책 더미', '📚', '취미', 5),
  f('radio', '라디오', '📻', '취미', 6),
  f('teddy', '곰 인형', '🧸', '취미', 6),
  f('trophy', '우승 트로피', '🏆', '취미', 10),
  f('moai', '수상한 석상', '🗿', '취미', 20),
  f('cactus', '선인장', '🌵', '식물', 4),
  f('tulip', '튤립', '🌷', '식물', 4),
  f('sunflower', '해바라기', '🌻', '식물', 4),
  f('tree', '크리스마스트리', '🎄', '식물', 12, 1, 2),
  f('snowman', '눈사람', '⛄', '식물', 8),
  f('cat', '고양이', '🐈', '동물', 10),
  f('dog', '강아지', '🐕', '동물', 10),
  f('hamster', '햄스터', '🐹', '동물', 8),
  f('fish', '어항', '🐠', '동물', 8),
  f('jelly', '젤리 단지', '🍬', '간식', 5),
  f('cake', '조각 케이크', '🍰', '간식', 3),
  f('coffee', '커피', '☕', '간식', 3),
  f('gift', '선물 상자', '🎁', '간식', 4),
  f('painting', '그림 액자', '🖼️', '벽 장식', 8, 1, 1, 'wall'),
  f('clock', '벽시계', '🕰️', '벽 장식', 6, 1, 1, 'wall'),
  f('star', '별 장식', '⭐', '벽 장식', 3, 1, 1, 'wall'),
  f('moon', '달 장식', '🌙', '벽 장식', 3, 1, 1, 'wall'),
  f('balloon', '풍선', '🎈', '벽 장식', 3, 1, 1, 'wall'),
  f('rainbow', '무지개', '🌈', '벽 장식', 10, 2, 1, 'wall'),
];

export type Surface = { key: string; name: string; price: number };
// 벽지·바닥 색은 styles.css의 .wall-<key>, .floor-<key>
export const WALLS: Surface[] = [
  { key: 'sky', name: '하늘 벽지', price: 0 },
  { key: 'strawberry', name: '딸기우유 벽지', price: 10 },
  { key: 'mint', name: '민트 벽지', price: 10 },
  { key: 'lemon', name: '레몬 벽지', price: 10 },
  { key: 'lavender', name: '라벤더 벽지', price: 10 },
  { key: 'stripe', name: '줄무늬 벽지', price: 10 },
  { key: 'dots', name: '물방울 벽지', price: 10 },
];
export const FLOORS: Surface[] = [
  { key: 'wood', name: '나무 바닥', price: 0 },
  { key: 'check', name: '체크 바닥', price: 10 },
  { key: 'pink', name: '분홍 카펫', price: 10 },
  { key: 'grass', name: '잔디 바닥', price: 10 },
  { key: 'marble', name: '대리석 바닥', price: 10 },
  { key: 'night', name: '밤하늘 카펫', price: 10 },
];

const BY_KEY = new Map(FURNITURE.map((x) => [x.key, x]));
export const furniture = (key: string) => BY_KEY.get(key);
export const furnId = (key: string) => `furn:${key}`;
export const wallId = (key: string) => `wall:${key}`;
export const floorId = (key: string) => `floor:${key}`;

// 상점에서 살 수 있는 방 물건(owned_items의 item_id → 값)
export function roomItem(id: unknown): { id: string; name: string; price: number } | null {
  if (typeof id !== 'string') return null;
  const [kind, key = ''] = id.split(':');
  const x = kind === 'furn' ? furniture(key) : kind === 'wall' ? WALLS.find((s) => s.key === key) : kind === 'floor' ? FLOORS.find((s) => s.key === key) : undefined;
  return x && x.price > 0 ? { id, name: x.name, price: x.price } : null;
}

export const ownsFurniture = (key: string, owned: Set<string>) => key === ME || (furniture(key)?.price === 0) || owned.has(furnId(key));
export const ownsWall = (key: string, owned: Set<string>) => WALLS.some((s) => s.key === key && (s.price === 0 || owned.has(wallId(key))));
export const ownsFloor = (key: string, owned: Set<string>) => FLOORS.some((s) => s.key === key && (s.price === 0 || owned.has(floorId(key))));

export type Placed = { k: string; x: number; y: number };

export const size = (k: string) => (k === ME ? { w: 1, h: 1, zone: 'floor' as Zone } : furniture(k) ?? null);

// 처음 방: 주인 캐릭터와 기본 가구
export const DEFAULT_LAYOUT: Placed[] = [
  { k: 'window', x: 4, y: 0 },
  { k: 'plant', x: 0, y: 2 },
  { k: 'chair', x: 6, y: 4 },
  { k: ME, x: 4, y: 4 },
];

// 저장하려는 배치가 올바른지: 가진 물건만, 한 번씩, 방 안에, 벽/바닥 자리에 맞게, 겹치지 않게.
// 주인 캐릭터가 빠졌으면 빈 바닥 칸에 넣어 줘요.
// lenient: 저장된 방을 읽을 때는 잘못된 물건만 빼고 나머지를 살려요.
export function checkLayout(raw: unknown, owned: Set<string>, lenient = false): Placed[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return null;
  const grid: (string | null)[] = Array(COLS * ROWS).fill(null);
  const out: Placed[] = [];
  const seen = new Set<string>();
  const put = (p: Placed): boolean => {
    const s = size(p.k);
    if (!s) return false;
    if (p.x < 0 || p.y < 0 || p.x + s.w > COLS || p.y + s.h > ROWS) return false;
    if (s.zone === 'wall' ? p.y + s.h > WALL_ROWS : p.y < WALL_ROWS) return false;
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) if (grid[(p.y + dy) * COLS + p.x + dx]) return false;
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) grid[(p.y + dy) * COLS + p.x + dx] = p.k;
    out.push(p);
    return true;
  };
  for (const v of raw) {
    const { k, x, y } = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const ok =
      typeof k === 'string' && Number.isInteger(x) && Number.isInteger(y) && !seen.has(k) && ownsFurniture(k, owned) && put({ k, x: x as number, y: y as number });
    if (!ok) {
      if (lenient) continue;
      return null;
    }
    seen.add(k as string);
  }
  if (!seen.has(ME)) {
    let ok = false;
    for (let y = ROWS - 1; y >= WALL_ROWS && !ok; y--) for (let x = 0; x < COLS && !ok; x++) ok = put({ k: ME, x, y });
    if (!ok) return null;
  }
  return out;
}

// 저장된 배치 읽기(못 쓰는 값이면 기본 방)
export function parseLayout(json: string | null | undefined, owned: Set<string>): Placed[] {
  try {
    return checkLayout(JSON.parse(json ?? ''), owned, true) ?? DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}
