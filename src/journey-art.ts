// 원정대 화면 그림: 적, 캠핑장, 상인 같은 것들을 글자 격자로 그린 픽셀 그림이에요.
// 글자 하나 = 픽셀 하나, '.'은 빈칸. 색은 그림마다 palette로 정해요.
// 화면에는 <svg> 안의 네모들로 나가서 그림 파일 없이 바로 보여요.

export type Sprite = { rows: string[]; pal: Record<string, string> };

const K = '#2a2030'; // 웹 공통 선 색(--ink)
const W = '#ffffff';

// 같은 색이 옆으로 이어지면 네모 하나로 합쳐서 그려요.
export function spriteRects(sp: Sprite): string {
  let out = '';
  sp.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = sp.pal[ch];
      if (ch !== '.' && fill) out += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`;
      x = end;
    }
  });
  return out;
}

export const spriteSize = (sp: Sprite) => ({ w: Math.max(...sp.rows.map((r) => r.length)), h: sp.rows.length });

export function spriteSvg(sp: Sprite, scale: number, cls = ''): string {
  const { w, h } = spriteSize(sp);
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges" aria-hidden="true">${spriteRects(sp)}</svg>`;
}

// ── 적 ──
export const FOES: Record<string, Sprite> = {
  mushroom: {
    pal: { k: K, r: '#ff6f8f', d: '#d94a6c', w: W, s: '#ffe9c9', b: '#e9c79d' },
    rows: [
      '................',
      '.....kkkkkk.....',
      '...kkrrrrrrkk...',
      '..krrwwrrrrwrk..',
      '.krrrwwrrrrrrrk.',
      '.krrrrrrrrwwrrk.',
      'krwwrrrrrrwwrrrk',
      'krwwrrrrrrrrrwrk',
      'kddddddddddddddk',
      '.kkkkkkkkkkkkkk.',
      '...kskksssskksk.',
      '...ksskssskssk..',
      '...kskksssskksk.',
      '...kssssssssssk.',
      '...kbsskkkksbsk.',
      '....kkkk..kkkk..',
    ].map((r) => r.slice(0, 16)),
  },
  slime: {
    pal: { k: K, g: '#7fdcc0', d: '#4fb89a', w: W, p: '#ff9cb8' },
    rows: [
      '................',
      '................',
      '................',
      '.......kk.......',
      '......kggk......',
      '.....kgwggk.....',
      '....kgwwgggk....',
      '...kggwggggk....',
      '..kgggggggggk...',
      '.kggkkgggkkggk..',
      '.kggkwgggkwggk..',
      'kgggggggggggggk.',
      'kgpgggkkkggpggk.',
      'kdggggggggggddk.',
      '.kdddddddddddk..',
      '..kkkkkkkkkkk...',
    ],
  },
  bat: {
    pal: { k: K, p: '#8a6fd6', d: '#5e48a8', w: W, r: '#ff6f8f', f: '#fff1e0' },
    rows: [
      '................',
      '................',
      'k..............k',
      'kk....k..k....kk',
      'kpk...kppk...kpk',
      'kppk.kppppk.kppk',
      'kpppkpwppwpkpppk',
      'kppppkkppkkppppk',
      'kpdpppprrppppdpk',
      'kpdkdpkfkfkpdkdk',
      '.kk.kdpppppdk.kk',
      '.....kdppppk....',
      '......kkkkk.....',
      '................',
      '................',
      '................',
    ],
  },
  hedgehog: {
    pal: { k: K, b: '#a8734a', d: '#7a5233', s: '#f3d3a8', w: W, p: '#ff9cb8' },
    rows: [
      '................',
      '................',
      '......k.k.k.....',
      '....k.kbkbkbk...',
      '...kbkbdbdbdbk..',
      '..kbdbdbdbdbdbk.',
      '.kbdbdbdbdbdbdbk',
      '.kdbdbdbdbdbkkkk',
      'kbdbdbdbdbdksssk',
      'kdbdbdbdbdbkswsk',
      'kbdbdbdbdbdkskssk',
      'kdbdbdbdbdbkspssk',
      '.kdddddddddksssk.',
      '..kkskkkkskkkkk..',
      '...kk....kk......',
      '................',
    ].map((r) => r.slice(0, 16)),
  },
  wolf: {
    pal: { k: K, g: '#9aa4c4', d: '#6b7496', w: W, y: '#ffd35a', l: '#e3e8f5' },
    rows: [
      '................',
      '.k...k..........',
      '.kk.kk..........',
      '.kgkgk..........',
      'kggggk..........',
      'kgykgkkkkkkkk...',
      'kggggggggggggk.k',
      'kkllgggggggggkkg',
      '.kllgddgggggggk.',
      '..kgggdddgggggk.',
      '..kggkkkkkggggk.',
      '..kggk...kggggk.',
      '..kdgk...kdggk..',
      '..kdk.....kdk...',
      '..kk......kk....',
      '................',
    ],
  },
  crab: {
    pal: { k: K, o: '#ff9b6b', d: '#e0703e', w: W, s: '#b9c2cf', g: '#8d97a6' },
    rows: [
      '................',
      '.kk..........kk.',
      'kook........kook',
      'kook........koook',
      '.kokk.k..k.kkok.',
      '..kok.kwkwk.kok.',
      '...kkokkkkokk...',
      '...kssssssssk...',
      '..kssgsssgsssk..',
      '.ksssssssssssk..',
      '.kggsssssssggk..',
      '..kkoooooookk...',
      '..kok.kook.kok..',
      '.kok..kook..kok.',
      '.kk...kkkk...kk.',
      '................',
    ].map((r) => r.slice(0, 16)),
  },
  bees: {
    pal: { k: K, y: '#ffd35a', d: '#e5b23a', w: '#e8f6ff', b: '#bfe6ff' },
    rows: [
      '................',
      '..kk............',
      '.kbbk...........',
      '.kbbkkkk........',
      '..kykykyk.......',
      '..kykykyk.k.....',
      '...kkkkk.kbk....',
      '.........kbkkkk.',
      '..........kykyk.',
      '...kk.....kykyk.',
      '..kbbk.....kkk..',
      '..kbbkkkk.......',
      '...kykykyk......',
      '...kykykyk......',
      '....kkkkk.......',
      '................',
    ],
  },
  ghost: {
    pal: { k: K, w: '#f4f1ff', b: '#cfc6f2', p: '#ff9cb8' },
    rows: [
      '................',
      '.....kkkkkk.....',
      '....kwwwwwwk....',
      '...kwwwwwwwwk...',
      '..kwwwwwwwwwwk..',
      '..kwwkwwwwkwwk..',
      '..kwwkwwwwkwwk..',
      '..kwpwwwwwwpwk..',
      '.kwwwwwkkwwwwwk.',
      'kwwwwwwwwwwwwwwk',
      '.kkwwwwwwwwwwbk.',
      '...kwwwwwwwwbk..',
      '...kbwwbwwbwbk..',
      '...kbbkbbkbbk...',
      '...kk.kk.kk.....',
      '................',
    ],
  },
  bear: {
    pal: { k: K, b: '#a8734a', d: '#7a5233', s: '#f3d3a8', w: W, r: '#ff6f8f', g: '#5e8f4a' },
    rows: [
      '....................',
      '..kkk..........kkk..',
      '.kbsbk........kbsbk.',
      '.kbbbkkkkkkkkkkbbbk.',
      '..kbbbbbbbbbbbbbbk..',
      '..kbbkkbbbbbbkkbbk..',
      '.kbbbkwkbbbbkwkbbbk.',
      '.kbbbbbbsssssbbbbbk.',
      '.kbbbbbsskkssbbbbbk.',
      '..kbbbbssrrssbbbbk..',
      '...kkbbbsssbbbbkk...',
      '..kbbkkkkkkkkkkbbk..',
      '.kbbbksssssssskbbbk.',
      'kbbbbkssssssssskbbbk',
      'kbdbbkssssssssskbdbk',
      '.kkbbksssssssskbbkk.',
      '...kbbksssssskbbk...',
      '...kbbbkkkkkkbbbk...',
      '..kdddk......kdddk..',
      '..kkkkk......kkkkk..',
    ],
  },
  dragon: {
    pal: { k: K, p: '#c46be0', d: '#8e45aa', b: '#ffd3e1', y: '#ffd35a', w: W, r: '#ff6f8f', o: '#ffb35a' },
    rows: [
      '..........................',
      '...........k......k.......',
      '..........kyk....kyk......',
      '..k.......kyk....kyk......',
      '.kpk.....kkpkkkkkkpkk.....',
      '.kppk...kppppppppppppk....',
      '.kpppk..kppkwkpppkwkppk...',
      '.kppppk.kppkkkpppkkkpppk..',
      '.kpdpppkkppppppppppppppkk.',
      '.kpddpppkpprpppppppppprrpk',
      '.kpdddppkkppppkkkkkppppk..',
      '.kpdddpppkkppbbbbbppkkk...',
      '..kpddpppppkbbbbbbbk......',
      '...kpdppppkbbybbbybk..kk..',
      '....kpppppkbbbbbbbbkkkpk..',
      '.....kpppkbbbbybbbbkppk...',
      '......kpkbbbbbbbbbbkpk....',
      '......kpkpbbbbbbbbkppk....',
      '.....kppkppkkkkkkppkk.....',
      '.....kpppk.kppk.kppk......',
      '....kdddk..kddk..kddk.....',
      '....kkkk...kkkk...kkk.....',
    ],
  },
};

// ── 길에서 만나는 것들 ──
export const PROPS: Record<string, Sprite> = {
  camp: {
    pal: { k: K, t: '#ff9cb8', d: '#e5718f', s: '#fff1e0', b: '#8a5a3a', y: '#ffd35a', o: '#ff9b4a', r: '#ff5a5a', g: '#9aa4c4' },
    rows: [
      '..........k.............',
      '.........ktk............',
      '........ktttk...........',
      '.......kttdttk..........',
      '......kttdsdttk.........',
      '.....kttdsssdttk........',
      '....kttdsssssdttk.......',
      '...kttdsssksssdttk......',
      '..kttdsssskkssssdttk....',
      '.kttdssssskkkssssdttk...',
      'kkkkkkkkkkkkkkkkkkkkkk..',
      '.................y......',
      '................yoy.....',
      '...............yoroy....',
      '..............yorrroy...',
      '.............kkbkkkbkk..',
      '............kgbbbkbbbgk.',
      '.............kkkkkkkkk..',
    ],
  },
  merchant: {
    pal: { k: K, h: '#7fdcc0', d: '#4fb89a', s: '#f3d3a8', b: '#a8734a', w: W, y: '#ffd35a', p: '#ff9cb8' },
    rows: [
      '.....kkkk...........',
      '....khhhhk..........',
      '...khhhhhhk.........',
      '..kkkkkkkkkk........',
      '...kssssssk.........',
      '...kskssksk.........',
      '...ksssssskkkkkk....',
      '....kspsssbbbbbbk...',
      '...kkkkkkkbybybyk...',
      '..khhhhhhkbbbbbbk...',
      '..khhhhhhkbpbpbbk...',
      '..khhkkhhkbbbbbbk...',
      '..khhkskhhkkkkkk....',
      '..khhhhhhhk.........',
      '...kddkddk..........',
      '...kbbkbbk..........',
      '...kkk.kkk..........',
    ],
  },
  chest: {
    pal: { k: K, b: '#c58a52', d: '#93603a', y: '#ffd35a', o: '#e5b23a' },
    rows: [
      '...kkkkkkkkkk...',
      '..kbbbbbbbbbbk..',
      '.kbbdbbbbbbdbbk.',
      '.kbbdbbbbbbdbbk.',
      '.kyyyyykkyyyyyk.',
      '.kbbdbbkykbdbbk.',
      '.kbbdbbkokbdbbk.',
      '.kbbdbbbbbbdbbk.',
      '.kddddddddddddk.',
      '..kkkkkkkkkkkk..',
    ],
  },
  spring: {
    pal: { k: K, s: '#b9c2cf', g: '#8d97a6', b: '#9fd8ff', w: W, l: '#d6f0ff' },
    rows: [
      '.......w........',
      '......wbw.......',
      '.......b..w.....',
      '...w...b.wbw....',
      '..wbw..b..b.....',
      '...b..kkk.b.....',
      '...b.kslsk......',
      '.....kslsk......',
      '.kkkkkslskkkkkk.',
      'ksssbbbbbbbbsssk',
      'ksgbbwbbbbwbbgsk',
      'kssgbbbbbbbbgssk',
      '.kgssssssssssgk.',
      '..kkkkkkkkkkkk..',
    ],
  },
  fairy: {
    pal: { k: K, s: '#f3d3a8', h: '#ff9cb8', w: '#e8f6ff', b: '#bfe6ff', y: '#ffd35a', g: '#7fdcc0' },
    rows: [
      '.....kkk........',
      '....khhhk.......',
      '.kk.kskskkk.kk..',
      'kwbkksssskbkwbk.',
      'kwwbkkkkkkbbwbk.',
      '.kwbkgggggkbbk..',
      '..kkkgggggkkk...',
      '....kgggggk.....',
      '.....kk.kk...kk.',
      '.....k...k..kyyk',
      '............kyyk',
      '.............kk.',
    ],
  },
  gummy: {
    pal: { k: K, r: '#ff8fab', d: '#e0607e', w: W },
    rows: [
      '.kk......kk.',
      'krrk....krrk',
      'krrrkkkkrrrk',
      '.krrrrrrrrk.',
      '.krkrrrrkrk.',
      '.krrrkkrrrk.',
      '..krrrrrrk..',
      '.krrrrrrrrk.',
      'krwrrrrrrrrk',
      'krrrrrrrrrrk',
      '.krrrkkrrrk.',
      '.kddk..kddk.',
      '..kk....kk..',
    ],
  },
  sign: {
    pal: { k: K, b: '#c58a52', d: '#93603a', w: '#fff1e0' },
    rows: [
      '......kk........',
      'kkkkkkkkkkkkk...',
      'kbbbbbbbbbbbbk..',
      'kbwwbwwwbwbbbbk.',
      'kbbbbbbbbbbbbk..',
      'kkkkkkkkkkkkk...',
      '...kkkkkkkkkkkkk',
      '..kbbbbbbbbbbbbk',
      '.kbbbwwbwwwbwwbk',
      '..kbbbbbbbbbbbbk',
      '...kkkkkkkkkkkkk',
      '......kdk.......',
      '......kdk.......',
      '......kdk.......',
      '.....kkkkk......',
    ],
  },
  trophy: {
    pal: { k: K, y: '#ffd35a', o: '#e5b23a', w: W },
    rows: [
      '.kkkkkkkkkkkk.',
      'kkyywyyyyyyokk',
      'ky.kywyyyyok.k',
      'ky.kyyyyyyok.k',
      '.kykyyyyyyokk.',
      '..kkyyyyyyok..',
      '....kyyyyok...',
      '.....kyyok....',
      '......kok.....',
      '.....kyyok....',
      '....kkkkkkk...',
      '...kyyyyyyok..',
      '...kkkkkkkkk..',
    ],
  },
};

// 적 이름표(원정 상태에 저장되는 key)
export const FOE_KEYS = Object.keys(FOES);

// ── 배경 ──
// 날이 지날수록 숲 입구 → 깊은 숲 → 노을 언덕 → 용의 둥지로 바뀌어요. 쉬는 날(모닥불)은 밤이에요.
export type Zone = 'meadow' | 'deep' | 'dusk' | 'lair' | 'night';
export const ZONE_NAMES: Record<Zone, string> = {
  meadow: '말랑 숲 입구',
  deep: '깊은 숲',
  dusk: '노을 언덕',
  lair: '용의 둥지',
  night: '모닥불 쉼터',
};
export function zoneFor(day: number): Exclude<Zone, 'night'> {
  if (day >= 20) return 'lair';
  if (day >= 14) return 'dusk';
  if (day >= 7) return 'deep';
  return 'meadow';
}

type ZoneLook = { sky: string[]; hill: string; hill2: string; tree: string; tree2: string; trunk: string; ground: string; ground2: string; sun: string; kind: 'round' | 'pine' | 'rock' };
const LOOKS: Record<Zone, ZoneLook> = {
  meadow: { sky: ['#9fd8ff', '#b8e3ff', '#d2eeff', '#e8f7ff'], hill: '#bfe3a8', hill2: '#a6d68c', tree: '#7fc86a', tree2: '#5fae54', trunk: '#a8734a', ground: '#8fd17a', ground2: '#6fb35c', sun: '#fff1a8', kind: 'round' },
  deep: { sky: ['#8cc9e8', '#a3d6ea', '#bfe3ec', '#d5eee9'], hill: '#8fbf8a', hill2: '#76a874', tree: '#4f9a6a', tree2: '#3a7d55', trunk: '#7a5233', ground: '#6fb35c', ground2: '#56984a', sun: '#fff1a8', kind: 'pine' },
  dusk: { sky: ['#9c8fd6', '#d6a0c8', '#ffb8a8', '#ffd9a8'], hill: '#c79ab8', hill2: '#a97f9e', tree: '#8c7fb8', tree2: '#6f6399', trunk: '#6b4a5a', ground: '#b8a06a', ground2: '#9c8656', sun: '#ffe08a', kind: 'round' },
  lair: { sky: ['#4a3060', '#6a3a5e', '#9a4a5a', '#d06a5a'], hill: '#5a3a4a', hill2: '#45303d', tree: '#7a4a4a', tree2: '#5e3a3a', trunk: '#3a2a30', ground: '#7a5a5a', ground2: '#5e4448', sun: '#ffb35a', kind: 'rock' },
  night: { sky: ['#2c2f73', '#3b3d85', '#4f4c96', '#6a5aa8'], hill: '#3d3f86', hill2: '#33356f', tree: '#3a6a6a', tree2: '#2c5656', trunk: '#4a3a40', ground: '#3f6a52', ground2: '#335a45', sun: '#fff6c8', kind: 'pine' },
};

const enc = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// 하늘(띠 모양 + 해/달 + 구름이나 별)
function skyLayer(z: Zone): string {
  const L = LOOKS[z];
  const bands = L.sky.map((c, i) => `<rect x="0" y="${i * 8}" width="64" height="${i === 3 ? 20 : 8}" fill="${c}"/>`).join('');
  const night = z === 'night' || z === 'lair';
  const sun = night
    ? `<rect x="48" y="4" width="6" height="6" fill="${L.sun}"/><rect x="47" y="5" width="8" height="4" fill="${L.sun}"/><rect x="50" y="4" width="4" height="4" fill="${L.sky[0]}"/>`
    : `<rect x="49" y="5" width="6" height="6" fill="${L.sun}"/><rect x="48" y="6" width="8" height="4" fill="${L.sun}"/>`;
  const deco =
    z === 'night'
      ? [3, 14, 22, 31, 38, 60].map((x, i) => `<rect x="${x}" y="${2 + ((i * 5) % 11)}" width="1" height="1" fill="#fff"/>`).join('')
      : z === 'lair'
        ? [6, 20, 33, 41].map((x, i) => `<rect x="${x}" y="${18 + (i % 2) * 4}" width="1" height="1" fill="#ffb35a"/>`).join('')
        : `<rect x="6" y="6" width="10" height="2" fill="#fff"/><rect x="8" y="4" width="5" height="2" fill="#fff"/><rect x="28" y="12" width="8" height="2" fill="#fff"/><rect x="30" y="10" width="4" height="2" fill="#fff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 44" width="64" height="44" preserveAspectRatio="none" shape-rendering="crispEdges">${bands}${deco}${sun}</svg>`;
}

// 먼 언덕(가로로 이어 붙여요)
function hillLayer(z: Zone): string {
  const L = LOOKS[z];
  const tops = z === 'lair' ? [10, 8, 5, 3, 6, 9, 7, 4, 2, 5, 8, 10, 11, 9, 7, 9] : [9, 8, 7, 6, 6, 7, 8, 9, 9, 8, 7, 7, 8, 9, 10, 10];
  let r = '';
  tops.forEach((t, i) => {
    r += `<rect x="${i * 4}" y="${t}" width="4" height="${16 - t}" fill="${L.hill}"/>`;
    r += `<rect x="${i * 4}" y="${Math.min(15, t + 4)}" width="4" height="${16 - Math.min(15, t + 4)}" fill="${L.hill2}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 16" width="64" height="16" shape-rendering="crispEdges">${r}</svg>`;
}

// 가까운 나무(또는 바위)
function treeLayer(z: Zone): string {
  const L = LOOKS[z];
  const one = (x: number, h: number) => {
    if (L.kind === 'pine')
      return [0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${x + 3 - Math.floor(i / 2)}" y="${h + i * 2}" width="${1 + Math.floor(i / 2) * 2}" height="2" fill="${i % 3 === 2 ? L.tree2 : L.tree}"/>`).join('') + `<rect x="${x + 3}" y="${h + 14}" width="1" height="${20 - h - 14}" fill="${L.trunk}"/>`;
    if (L.kind === 'rock')
      return `<rect x="${x}" y="${h + 6}" width="7" height="${14 - h}" fill="${L.tree}"/><rect x="${x + 1}" y="${h + 4}" width="5" height="2" fill="${L.tree}"/><rect x="${x + 2}" y="${h + 2}" width="2" height="2" fill="${L.tree}"/><rect x="${x + 4}" y="${h + 6}" width="3" height="${14 - h}" fill="${L.tree2}"/>`;
    return `<rect x="${x + 1}" y="${h}" width="5" height="1" fill="${L.tree}"/><rect x="${x}" y="${h + 1}" width="7" height="5" fill="${L.tree}"/><rect x="${x + 1}" y="${h + 6}" width="5" height="1" fill="${L.tree}"/><rect x="${x + 4}" y="${h + 2}" width="2" height="4" fill="${L.tree2}"/><rect x="${x + 3}" y="${h + 7}" width="1" height="${20 - h - 7}" fill="${L.trunk}"/>`;
  };
  const r = one(2, 4) + one(13, 8) + one(26, 2) + one(40, 6) + one(52, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 20" width="64" height="20" shape-rendering="crispEdges">${r}</svg>`;
}

// 땅(풀 포기와 작은 돌)
function groundLayer(z: Zone): string {
  const L = LOOKS[z];
  let r = `<rect x="0" y="0" width="64" height="16" fill="${L.ground}"/><rect x="0" y="0" width="64" height="1" fill="${L.ground2}"/>`;
  [3, 11, 19, 30, 37, 45, 56].forEach((x, i) => {
    r += `<rect x="${x}" y="${3 + (i % 3) * 4}" width="2" height="1" fill="${L.ground2}"/><rect x="${x + (i % 2)}" y="${2 + (i % 3) * 4}" width="1" height="1" fill="${L.ground2}"/>`;
  });
  r += `<rect x="24" y="9" width="2" height="1" fill="#fff8" /><rect x="50" y="5" width="2" height="1" fill="#fff8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 16" width="64" height="16" shape-rendering="crispEdges">${r}</svg>`;
}

// 무대 배경(CSS 변수 4개). 3배로 키워서 픽셀이 또렷하게 보여요.
const sceneCache = new Map<Zone, string>();
export function sceneStyle(z: Zone): string {
  let v = sceneCache.get(z);
  if (!v) {
    v = `--jr-sky:${enc(skyLayer(z))};--jr-hill:${enc(hillLayer(z))};--jr-tree:${enc(treeLayer(z))};--jr-ground:${enc(groundLayer(z))}`;
    sceneCache.set(z, v);
  }
  return v;
}
