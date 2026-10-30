// 멤버마다 다른 2등신 픽셀 캐릭터. 디스코드 ID를 씨앗으로 머리, 눈, 표정, 옷, 후드, 소품을 골라
// 32 × 45 픽셀 격자에 그린 뒤 그림자와 테두리를 붙여요. 같은 ID는 언제나 같은 캐릭터가 나와요.

export const W = 32;
export const H = 45;
const CX = 15.5;

type Tone = 'hi' | 'base' | 'shade';
type Swatch = { hi: string; base: string; shade: string };
type Mat = Swatch | string;
type Cell = { mat: Mat; part: string } | null;

const sw = (base: string, hi: string, shade: string): Swatch => ({ base, hi, shade });

const SKIN = [
  sw('#ffe0cc', '#fff2e8', '#f2b99c'),
  sw('#fbd3b5', '#ffe7d4', '#e5a885'),
  sw('#f0c09c', '#fbd8bc', '#d49a75'),
  sw('#d9a27a', '#ebbb96', '#b9805b'),
];

const HAIR = [
  sw('#2f2c3a', '#4d4a63', '#1b1923'),
  sw('#4a3029', '#6c4738', '#2e1b16'),
  sw('#7a4a32', '#a06a49', '#553120'),
  sw('#a8653f', '#cf8a5e', '#7a4427'),
  sw('#e9c56f', '#f8e3a6', '#c69b41'),
  sw('#f29bb8', '#ffc8dc', '#cf7095'),
  sw('#a88de0', '#cdb9f5', '#7c63b8'),
  sw('#4c6db3', '#7493d8', '#304a85'),
  sw('#c9ced8', '#f1f3f7', '#9aa1ae'),
  sw('#c9473f', '#e8705f', '#922c27'),
  sw('#69c3ad', '#9fe6d3', '#47998a'),
  sw('#f0f0f4', '#ffffff', '#c6c6d2'),
];

const EYES = [
  { iris: '#6b3f2a', light: '#a8714f' },
  { iris: '#2f5fbf', light: '#6b9bf0' },
  { iris: '#3a8a52', light: '#74c98c' },
  { iris: '#7d4cc0', light: '#b18ae8' },
  { iris: '#2b2a33', light: '#5d5b6b' },
  { iris: '#3a7f8f', light: '#6fc1d0' },
];

const CLOTH = [
  sw('#f4f4f8', '#ffffff', '#c9cad6'),
  sw('#9aa0ad', '#c1c6d0', '#6f7482'),
  sw('#34333f', '#4d4c5c', '#1f1e27'),
  sw('#2f3d6b', '#47599a', '#1d2647'),
  sw('#4d86e0', '#7eabf2', '#335fb0'),
  sw('#8fd0f2', '#bfe6fa', '#5fa5cf'),
  sw('#7fd6b8', '#b0ecd6', '#55aa8e'),
  sw('#5aa65a', '#85c97f', '#3d7a40'),
  sw('#f6d35a', '#fde79a', '#d1a933'),
  sw('#f29245', '#fbb77c', '#c4672a'),
  sw('#e2524a', '#f2827a', '#a8352f'),
  sw('#f5a3c0', '#ffcadd', '#d27596'),
  sw('#b7a1ea', '#d6c8f7', '#8a71c4'),
  sw('#8a5a3c', '#ae7a56', '#5f3b25'),
  sw('#e8d6b8', '#f7ecd8', '#c2ab88'),
];

const OUTLINE = '#2a2030';
const WHITE = sw('#ffffff', '#ffffff', '#dfe0ea');
const BLUSH = '#ff9fb0';
const MOUTH = '#b2474f';
const PINK_INNER = sw('#ffb3c7', '#ffd1de', '#e88ea6');

function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

class Grid {
  cells: Cell[] = Array.from({ length: W * H }, () => null);
  get(x: number, y: number): Cell {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return this.cells[y * W + x] ?? null;
  }
  set(x: number, y: number, mat: Mat, part: string) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.cells[y * W + x] = { mat, part };
  }
  clear(x: number, y: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.cells[y * W + x] = null;
  }
  fill(test: (x: number, y: number) => boolean, mat: Mat, part: string) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (test(x, y)) this.set(x, y, mat, part);
  }
  // 왼쪽 반만 정하면 오른쪽은 거울처럼
  mirror(test: (x: number, y: number) => boolean, mat: Mat, part: string) {
    this.fill((x, y) => test(x, y) || test(W - 1 - x, y), mat, part);
  }
}

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const HEAD = (x: number, y: number) => inEllipse(x, y, CX, 19, 10.6, 9.6);
const FACE_OPEN = (x: number, y: number) => inEllipse(x, y, CX, 21.2, 8.6, 7.2);
const HOOD = (x: number, y: number) => inEllipse(x, y, CX, 18.6, 12.6, 11.6);

// ---------- 몸 ----------

type Outfit = { top: Swatch; bottom: Swatch; shoe: Swatch; skirt?: boolean; robe?: boolean };

function drawBody(g: Grid, skin: Swatch, o: Outfit) {
  // 다리와 신발
  if (!o.robe) {
    const legTop = o.skirt ? 39 : 37;
    g.fill((x, y) => (inRect(x, y, 11, 37, 14, 40) || inRect(x, y, 17, 37, 20, 40)) && y >= legTop, o.skirt ? skin : o.bottom, 'leg');
    if (!o.skirt) g.fill((x, y) => inRect(x, y, 11, 37, 20, 38), o.bottom, 'leg');
    g.fill((x, y) => inRect(x, y, 10, 41, 14, 42) || inRect(x, y, 17, 41, 21, 42), o.shoe, 'shoe');
  }
  // 몸통
  g.fill((x, y) => inRect(x, y, 10, 28, 21, 36) && !((x === 10 || x === 21) && y === 28), o.top, 'torso');
  if (o.skirt) g.fill((x, y) => inRect(x, y, 10 - (y - 36), 36, 21 + (y - 36), 39) && y >= 36, o.bottom, 'skirt');
  if (o.robe) {
    g.fill((x, y) => y >= 36 && y <= 41 && x >= 10 - Math.floor((y - 35) / 2) && x <= 21 + Math.floor((y - 35) / 2), o.top, 'robe');
    g.fill((x, y) => inRect(x, y, 11, 42, 14, 42) || inRect(x, y, 17, 42, 20, 42), o.shoe, 'shoe');
  }
  // 팔과 손
  g.fill((x, y) => inRect(x, y, 8, 29, 9, 33) || inRect(x, y, 22, 29, 23, 33), o.top, 'arm');
  g.fill((x, y) => inRect(x, y, 8, 34, 9, 35) || inRect(x, y, 22, 34, 23, 35), skin, 'hand');
}

// ---------- 머리카락 ----------

type HairStyle = {
  bangs: (x: number) => number; // 이 줄까지 앞머리
  side: number; // 옆머리가 내려오는 줄
  back?: number; // 뒷머리(몸 뒤) 끝 줄
  extra?: 'ponytail' | 'twintail' | 'buns' | 'bun' | 'ahoge' | 'braid';
};

const STYLES: HairStyle[] = [
  { bangs: () => 17, side: 22 }, // 일자 앞머리 단발
  { bangs: (x) => (x % 3 === 0 ? 18 : 17), side: 21, extra: 'ahoge' }, // 들쭉날쭉
  { bangs: (x) => 15 + Math.round(Math.abs(x - 12) / 4), side: 21 }, // 가르마
  { bangs: (x) => 19 - Math.floor((x - 5) / 6), side: 20 }, // 옆으로 넘김
  { bangs: () => 17, side: 26, back: 34 }, // 긴 생머리
  { bangs: (x) => (x % 4 < 2 ? 18 : 16), side: 25, back: 33 }, // 웨이브 긴 머리
  { bangs: () => 17, side: 22, extra: 'twintail' },
  { bangs: (x) => (x % 3 === 1 ? 18 : 17), side: 21, extra: 'ponytail' },
  { bangs: () => 16, side: 21, extra: 'buns' },
  { bangs: (x) => 15 + Math.round(Math.abs(x - 19) / 4), side: 23, extra: 'bun' },
  { bangs: (x) => (x % 2 === 0 ? 17 : 15), side: 19, extra: 'ahoge' }, // 짧은 삐죽 머리
  { bangs: () => 17, side: 24, back: 31, extra: 'braid' },
];

function drawBackHair(g: Grid, hair: Swatch, s: HairStyle) {
  if (s.back) g.fill((x, y) => y >= 18 && y <= s.back! && inRect(x, y, 4, 18, 27, 40) && (y < s.back! - 1 || x % 3 !== 0), hair, 'hairback');
  if (s.extra === 'twintail') {
    g.mirror((x, y) => inEllipse(x, y, 3, 26, 2.6, 7), hair, 'hairback');
    g.mirror((x, y) => inRect(x, y, 3, 15, 5, 18), hair, 'hairback');
  }
  if (s.extra === 'ponytail') g.fill((x, y) => inEllipse(x, y, 28, 22, 2.4, 7.5), hair, 'hairback');
  if (s.extra === 'braid') {
    g.fill((x, y) => x >= 25 && x <= 27 && y >= 22 && y <= 36 && !(y % 3 === 0 && x !== 26), hair, 'hairback');
  }
}

function drawFrontHair(g: Grid, hair: Swatch, s: HairStyle) {
  g.fill((x, y) => {
    if (!inEllipse(x, y, CX, 18, 11.6, 10.2)) return false;
    if (y <= s.bangs(x) && (y < 20 || !HEAD(x, y) || x <= 6 || x >= 25)) return true;
    // 옆머리
    return (x <= 6 || x >= 25) && y <= s.side;
  }, hair, 'hair');
  if (s.side > 21) g.mirror((x, y) => inRect(x, y, 4, 19, 6, s.side), hair, 'hair');
  if (s.extra === 'buns') g.mirror((x, y) => inEllipse(x, y, 6.5, 9.5, 3, 3), hair, 'hair');
  if (s.extra === 'bun') g.fill((x, y) => inEllipse(x, y, CX, 7.5, 3.4, 2.8), hair, 'hair');
  if (s.extra === 'ahoge') {
    g.set(16, 7, hair, 'hair');
    g.set(17, 6, hair, 'hair');
    g.set(18, 6, hair, 'hair');
  }
}

// ---------- 얼굴 ----------

function drawFace(g: Grid, eye: { iris: string; light: string }, expr: number) {
  const closed = expr === 3;
  for (const [x0, flip] of [
    [10, false],
    [19, true],
  ] as const) {
    if (closed || (expr === 4 && flip)) {
      // 웃는 눈 ^ ^
      g.set(x0, 22, OUTLINE, 'eye');
      g.set(x0 + 1, 21, OUTLINE, 'eye');
      g.set(x0 + 2, 22, OUTLINE, 'eye');
      continue;
    }
    for (let i = 0; i < 3; i++) g.set(x0 + i, 20, OUTLINE, 'eye');
    g.set(x0, 21, flip ? eye.iris : '#ffffff', 'eye');
    g.set(x0 + 1, 21, eye.iris, 'eye');
    g.set(x0 + 2, 21, flip ? '#ffffff' : eye.iris, 'eye');
    g.set(x0, 22, eye.iris, 'eye');
    g.set(x0 + 1, 22, eye.iris, 'eye');
    g.set(x0 + 2, 22, eye.iris, 'eye');
    for (let i = 0; i < 3; i++) g.set(x0 + i, 23, eye.light, 'eye');
  }
  g.set(8, 24, BLUSH, 'blush');
  g.set(9, 24, BLUSH, 'blush');
  g.set(22, 24, BLUSH, 'blush');
  g.set(23, 24, BLUSH, 'blush');
  if (expr === 1) {
    // 벌린 입
    g.set(15, 25, MOUTH, 'mouth');
    g.set(16, 25, MOUTH, 'mouth');
    g.set(15, 26, '#ff8c9a', 'mouth');
    g.set(16, 26, '#ff8c9a', 'mouth');
  } else if (expr === 2) {
    // 고양이 입
    g.set(14, 25, MOUTH, 'mouth');
    g.set(15, 26, MOUTH, 'mouth');
    g.set(16, 26, MOUTH, 'mouth');
    g.set(17, 25, MOUTH, 'mouth');
  } else {
    g.set(15, 25, MOUTH, 'mouth');
    g.set(16, 25, MOUTH, 'mouth');
  }
}

// ---------- 후드와 모자 ----------

const ANIMALS = ['cat', 'rabbit', 'bear', 'frog', 'dino', 'wolf', 'penguin', 'panda', 'chick', 'fox'] as const;
type Animal = (typeof ANIMALS)[number];

const ANIMAL_COLORS: Record<Animal, Swatch[]> = {
  cat: [WHITE, sw('#f3a95c', '#fbc98d', '#c97d38'), sw('#9aa0ad', '#c1c6d0', '#6f7482'), sw('#3a3846', '#55536a', '#24232c')],
  rabbit: [sw('#f7b6cc', '#ffd6e3', '#d98aa6'), WHITE],
  bear: [sw('#9a6a46', '#bf8c63', '#6e4a2f'), sw('#e8c79a', '#f6e0bd', '#c4a073')],
  frog: [sw('#7fcf5f', '#a8e58c', '#57a83f')],
  dino: [sw('#7fcf5f', '#a8e58c', '#57a83f'), sw('#b7a1ea', '#d6c8f7', '#8a71c4'), sw('#7fbdf0', '#addaf8', '#5592c9')],
  wolf: [sw('#8f96a6', '#b9bfcc', '#646b7a')],
  penguin: [sw('#34333f', '#4d4c5c', '#1f1e27')],
  panda: [WHITE],
  chick: [sw('#f8d75a', '#feeb9b', '#d6ad2e')],
  fox: [sw('#ef8c3f', '#f9b57a', '#c0642a')],
};

function drawHood(g: Grid, a: Animal, c: Swatch) {
  const black = sw('#34333f', '#4d4c5c', '#1f1e27');
  // 귀는 후드 뒤에 먼저
  if (a === 'cat' || a === 'wolf' || a === 'fox') {
    const ear = (x: number, y: number) => y >= 4 && y <= 11 && x >= 4 && x <= 4 + Math.floor((y - 3) * 0.75) + 1 && x >= 5 - (y > 8 ? 1 : 0);
    g.mirror(ear, c, 'ear');
    g.mirror((x, y) => y >= 7 && y <= 10 && x >= 6 && x <= 5 + Math.floor((y - 6) * 0.6), a === 'fox' ? WHITE : PINK_INNER, 'earin');
  }
  if (a === 'rabbit') {
    g.mirror((x, y) => inEllipse(x, y, 9.5, 4.5, 2.3, 6), c, 'ear');
    g.mirror((x, y) => inEllipse(x, y, 9.5, 5, 0.9, 4), PINK_INNER, 'earin');
  }
  if (a === 'bear' || a === 'panda') {
    g.mirror((x, y) => inEllipse(x, y, 6.5, 9, 3, 3), a === 'panda' ? black : c, 'ear');
    if (a === 'bear') g.mirror((x, y) => inEllipse(x, y, 6.5, 9.3, 1.4, 1.4), sw('#e8c79a', '#f6e0bd', '#c4a073'), 'earin');
  }
  if (a === 'frog') {
    g.mirror((x, y) => inEllipse(x, y, 9.5, 8, 3.2, 3), c, 'ear');
    g.mirror((x, y) => inEllipse(x, y, 9.5, 8, 2.1, 1.9), WHITE, 'earin');
    g.mirror((x, y) => inRect(x, y, 9, 8, 10, 9), OUTLINE, 'pupil');
  }
  if (a === 'dino') {
    for (const sx of [11, 15, 19]) g.fill((x, y) => y >= 3 && y <= 7 && Math.abs(x - (sx + 0.5)) <= (y - 3) * 0.6, sw(c.shade, c.base, c.shade), 'ear');
  }
  if (a === 'chick') {
    g.set(15, 5, c, 'ear');
    g.set(16, 4, c, 'ear');
    g.set(14, 6, c, 'ear');
    g.set(16, 6, c, 'ear');
  }
  // 후드 몸체 (얼굴 구멍은 비워요)
  const open = a === 'penguin' ? (x: number, y: number) => inEllipse(x, y, CX, 20.6, 9.4, 8) : FACE_OPEN;
  g.fill((x, y) => HOOD(x, y) && !open(x, y), c, 'hood');
  if (a === 'penguin') {
    g.fill((x, y) => inEllipse(x, y, CX, 20.6, 9.4, 8) && !FACE_OPEN(x, y) && !HEAD(x, y), WHITE, 'hood');
    g.fill((x, y) => inRect(x, y, 14, 8, 17, 9), sw('#f5a34a', '#fbc58a', '#c97a2a'), 'beak');
  }
  if (a === 'chick') g.fill((x, y) => inRect(x, y, 14, 9, 17, 10), sw('#f5a34a', '#fbc58a', '#c97a2a'), 'beak');
  if (a === 'dino') g.fill((x, y) => inEllipse(x, y, CX, 9.5, 5, 1.3), sw('#ffffff', '#ffffff', '#e8e8ef'), 'tooth');
}

type Hat = 'none' | 'cap' | 'beanie' | 'ribbon' | 'headphones' | 'flower' | 'glasses';

function drawHat(g: Grid, hat: Hat, c: Swatch, accent: Swatch) {
  if (hat === 'cap') {
    g.fill((x, y) => inEllipse(x, y, CX, 16, 11.2, 7.5) && y <= 15, c, 'hat');
    g.fill((x, y) => inRect(x, y, 3, 15, 18, 16) && !(x === 3 && y === 16), c, 'brim');
    g.set(15, 11, accent, 'logo');
    g.set(16, 11, accent, 'logo');
  }
  if (hat === 'beanie') {
    g.fill((x, y) => inEllipse(x, y, CX, 16, 11.4, 9) && y <= 15, c, 'hat');
    g.fill((x, y) => inRect(x, y, 4, 15, 27, 16), accent, 'brim');
    g.fill((x, y) => inEllipse(x, y, CX, 6.5, 2, 1.6), accent, 'hat');
  }
  if (hat === 'ribbon') {
    g.fill((x, y) => inEllipse(x, y, 22.5, 10.5, 2, 1.8) || inEllipse(x, y, 27.5, 10.5, 2, 1.8), accent, 'bow');
    g.fill((x, y) => inRect(x, y, 24, 10, 26, 11), accent, 'bow');
  }
  if (hat === 'flower') {
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ])
      g.set(8 + dx!, 13 + dy!, WHITE, 'petal');
    g.set(8, 13, '#f6d35a', 'petal');
  }
  if (hat === 'headphones') {
    g.fill((x, y) => inEllipse(x, y, CX, 18, 12.6, 11) && !inEllipse(x, y, CX, 18, 11.4, 9.8) && y <= 16, c, 'band');
    g.mirror((x, y) => inRect(x, y, 2, 17, 4, 23), c, 'cup');
    g.mirror((x, y) => inRect(x, y, 3, 18, 3, 22), accent, 'cup');
  }
  if (hat === 'glasses') {
    for (const x0 of [9, 18]) {
      g.fill((x, y) => inRect(x, y, x0, 19, x0 + 4, 24) && (x === x0 || x === x0 + 4 || y === 19 || y === 24), OUTLINE, 'glasses');
    }
    g.fill((x, y) => inRect(x, y, 14, 21, 17, 21), OUTLINE, 'glasses');
  }
}

// ---------- 직업 옷 ----------

function drawWizardHat(g: Grid, c: Swatch, star: Swatch) {
  g.fill((x, y) => inEllipse(x, y, CX, 13.5, 14, 2.2), c, 'brim');
  g.fill((x, y) => y >= 1 && y <= 12 && Math.abs(x - (CX + (12 - y) * 0.35)) <= (y - 1) * 0.62 + 1, c, 'hat');
  g.fill((x, y) => inRect(x, y, 9, 11, 23, 12) && y === 11, star, 'band');
  g.set(14, 7, star, 'star');
  g.set(13, 7, star, 'star');
  g.set(14, 6, star, 'star');
  g.set(14, 8, star, 'star');
  g.set(15, 7, star, 'star');
}

function drawKnight(g: Grid, metal: Swatch, plume: Swatch) {
  g.fill((x, y) => inEllipse(x, y, CX, 4.5, 2.4, 4.5) && y <= 8 && x >= 14, plume, 'plume');
  g.fill((x, y) => HOOD(x, y) && !FACE_OPEN(x, y), metal, 'hood');
  g.fill((x, y) => inRect(x, y, 15, 9, 16, 15), sw(metal.shade, metal.base, metal.shade), 'ridge');
}

function drawAstronaut(g: Grid) {
  g.fill((x, y) => HOOD(x, y) && !FACE_OPEN(x, y), WHITE, 'hood');
  g.fill((x, y) => inEllipse(x, y, CX, 21.2, 9.6, 8.2) && !FACE_OPEN(x, y), sw('#9fd8ff', '#d4efff', '#6fb4e8'), 'glass');
  g.fill((x, y) => inRect(x, y, 24, 2, 24, 8), sw('#9aa0ad', '#c1c6d0', '#6f7482'), 'antenna');
  g.fill((x, y) => inEllipse(x, y, 24, 2, 1.2, 1.2), sw('#e2524a', '#f2827a', '#a8352f'), 'antenna');
}

// ---------- 마무리: 그림자와 테두리 ----------

function toneOf(g: Grid, x: number, y: number): Tone {
  const c = g.get(x, y)!;
  const below = g.get(x, y + 1);
  const right = g.get(x + 1, y);
  const above = g.get(x, y - 1);
  const p = c.part;
  if (p === 'skin') {
    if (above && (above.part === 'hair' || above.part === 'hood' || above.part === 'hat' || above.part === 'brim' || above.part === 'glass')) return 'shade';
    return 'base';
  }
  if (p === 'hair' || p === 'hairback') {
    if (p === 'hair' && (y === 11 || y === 12) && x >= 8 && x <= 22 && (x + y) % 4 !== 0) return 'hi';
    if (below && below.part === 'skin') return 'shade';
    if (p === 'hairback') return 'shade';
    return 'base';
  }
  if (p === 'hood' || p === 'hat') {
    if (y <= 10 && x >= 9 && x <= 13 && (!above || above.part !== p)) return 'hi';
    if (!below || below.part !== p) return 'shade';
    return 'base';
  }
  if (!right || right.part !== p || !below || below.part !== p) return 'shade';
  if (!above || above.part !== p) return 'hi';
  return 'base';
}

export type Chibi = { pixels: (string | null)[]; desc: string };

export function makeChibi(seed: string): Chibi {
  const r = rng(seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)]!;
  const g = new Grid();

  const skin = pick(SKIN);
  const hair = pick(HAIR);
  const style = pick(STYLES);
  const eye = pick(EYES);
  const expr = Math.floor(r() * 5);
  const roll = r();
  const kind = roll < 0.4 ? 'hood' : roll < 0.5 ? 'job' : 'casual';

  const top = pick(CLOTH);
  const bottom = pick(CLOTH.filter((c) => c !== top));
  const shoe = pick([CLOTH[2]!, CLOTH[13]!, CLOTH[0]!, CLOTH[3]!]);
  const accent = pick(CLOTH.filter((c) => c !== top));
  let desc = '';

  if (kind === 'hood') {
    const animal = pick(ANIMALS);
    const c = pick(ANIMAL_COLORS[animal]);
    const limb = animal === 'panda' ? sw('#34333f', '#4d4c5c', '#1f1e27') : c;
    drawBody(g, skin, { top: c, bottom: limb, shoe: limb });
    if (animal === 'panda') g.fill((x, y) => inRect(x, y, 8, 29, 9, 33) || inRect(x, y, 22, 29, 23, 33), limb, 'arm');
    const belly = animal === 'penguin' || animal === 'panda' ? WHITE : animal === 'dino' ? sw('#f6d35a', '#fde79a', '#d1a933') : sw(c.hi, '#ffffff', c.base);
    g.fill((x, y) => inEllipse(x, y, CX, 32.5, 3.6, 3.2), belly, 'belly');
    g.fill(HEAD, skin, 'skin');
    drawFrontHair(g, hair, { ...style, side: 0, extra: undefined, back: undefined });
    drawFace(g, eye, expr);
    drawHood(g, animal, c);
    desc = `${animal} hood`;
  } else if (kind === 'job') {
    const job = pick(['wizard', 'knight', 'astronaut'] as const);
    if (job === 'wizard') {
      const robe = pick([CLOTH[3]!, CLOTH[12]!, CLOTH[2]!, CLOTH[10]!]);
      drawBackHair(g, hair, style);
      drawBody(g, skin, { top: robe, bottom: robe, shoe: CLOTH[13]!, robe: true });
      g.fill((x, y) => inRect(x, y, 15, 28, 16, 35), sw('#f6d35a', '#fde79a', '#d1a933'), 'trim');
      g.fill(HEAD, skin, 'skin');
      drawFrontHair(g, hair, style);
      drawFace(g, eye, expr);
      drawWizardHat(g, robe, sw('#f6d35a', '#fde79a', '#d1a933'));
    } else if (job === 'knight') {
      const metal = sw('#b9c0cc', '#e6eaf0', '#838b9a');
      drawBody(g, skin, { top: metal, bottom: sw('#8f96a6', '#b9bfcc', '#646b7a'), shoe: CLOTH[2]! });
      g.fill((x, y) => inRect(x, y, 14, 30, 17, 33), pick([CLOTH[10]!, CLOTH[4]!, CLOTH[8]!]), 'emblem');
      g.fill(HEAD, skin, 'skin');
      drawFrontHair(g, hair, { ...style, side: 0, extra: undefined, back: undefined });
      drawFace(g, eye, expr);
      drawKnight(g, metal, pick([CLOTH[10]!, CLOTH[4]!, CLOTH[12]!]));
    } else {
      drawBody(g, skin, { top: WHITE, bottom: WHITE, shoe: CLOTH[1]! });
      g.fill((x, y) => inRect(x, y, 13, 30, 18, 33), CLOTH[4]!, 'panel');
      g.set(14, 31, '#f2827a', 'light');
      g.set(16, 31, '#f6d35a', 'light');
      g.fill(HEAD, skin, 'skin');
      drawFrontHair(g, hair, { ...style, side: 0, extra: undefined, back: undefined });
      drawFace(g, eye, expr);
      drawAstronaut(g);
    }
    desc = job;
  } else {
    const outfit = pick(['hoodie', 'tee', 'sweater', 'school', 'sailor', 'dress', 'overalls'] as const);
    drawBackHair(g, hair, style);
    const skirt = outfit === 'sailor' || outfit === 'dress' || (outfit === 'tee' && r() < 0.3);
    if (outfit === 'school') {
      drawBody(g, skin, { top: CLOTH[3]!, bottom: CLOTH[1]!, shoe: CLOTH[13]! });
      g.fill((x, y) => inRect(x, y, 14, 28, 17, 30) && !(y === 30 && (x === 14 || x === 17)), WHITE, 'collar');
      g.fill((x, y) => inRect(x, y, 15, 29, 16, 33), CLOTH[10]!, 'tie');
    } else if (outfit === 'sailor') {
      drawBody(g, skin, { top: WHITE, bottom: CLOTH[3]!, shoe: CLOTH[13]!, skirt: true });
      g.fill((x, y) => inRect(x, y, 10, 28, 21, 29), CLOTH[3]!, 'collar');
      g.fill((x, y) => inRect(x, y, 14, 30, 17, 31), CLOTH[10]!, 'ribbon');
    } else if (outfit === 'dress') {
      drawBody(g, skin, { top, bottom: top, shoe, skirt: true });
      g.fill((x, y) => inRect(x, y, 10, 35, 21, 35), accent, 'belt');
    } else if (outfit === 'overalls') {
      drawBody(g, skin, { top: WHITE, bottom: CLOTH[4]!, shoe });
      g.fill((x, y) => inRect(x, y, 12, 31, 19, 36) || inRect(x, y, 12, 28, 12, 30) || inRect(x, y, 19, 28, 19, 30), CLOTH[4]!, 'overall');
    } else {
      drawBody(g, skin, { top, bottom, shoe, skirt });
      if (outfit === 'hoodie') {
        g.set(14, 30, WHITE, 'string');
        g.set(14, 31, WHITE, 'string');
        g.set(17, 30, WHITE, 'string');
        g.set(17, 31, WHITE, 'string');
        g.fill((x, y) => inRect(x, y, 12, 34, 19, 34), sw(top.shade, top.base, top.shade), 'pocket');
      }
      if (outfit === 'sweater') g.fill((x, y) => inRect(x, y, 10, 31, 21, 31) || inRect(x, y, 8, 31, 9, 31) || inRect(x, y, 22, 31, 23, 31), accent, 'stripe');
    }
    g.fill(HEAD, skin, 'skin');
    drawFrontHair(g, hair, style);
    drawFace(g, eye, expr);
    const hat = pick(['none', 'none', 'none', 'cap', 'beanie', 'ribbon', 'ribbon', 'headphones', 'flower', 'glasses'] as const);
    drawHat(g, hat, pick(CLOTH), accent);
    desc = `${outfit} ${hat}`;
  }

  const pixels: (string | null)[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = g.get(x, y);
      if (c) {
        pixels.push(typeof c.mat === 'string' ? c.mat : c.mat[toneOf(g, x, y)]);
      } else {
        const touching = [g.get(x - 1, y), g.get(x + 1, y), g.get(x, y - 1), g.get(x, y + 1)].some(Boolean);
        pixels.push(touching ? OUTLINE : null);
      }
    }
  return { pixels, desc };
}

// 같은 색이 이어지는 줄은 사각형 하나로 묶어서 SVG를 작게 만들어요.
export function chibiSvg(seed: string): string {
  const { pixels } = makeChibi(seed);
  let rects = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = pixels[y * W + x];
      if (!c) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < W && pixels[y * W + end] === c) end++;
      rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${c}"/>`;
      x = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects}</svg>`;
}
