// 디스코드에서 보여 줄 카드 그림(봇이 그려요)에 쓰는 색표예요.
// 웹 카드(public/styles.css)와 같은 색이에요. 카드 색을 바꾸면 여기도 같이 바꿔 주세요.
import { tierEffects, tierFor, type Tier } from './levels';
import { themeOrBasic, type ThemeId } from './themes';

export type CardPalette = {
  // 카드 맨 바깥 테두리
  rim: string;
  // 카드 몸통 색(위에서 아래로 그라데이션)
  body: string[];
  // 몸통 안쪽 테두리 두 줄(없으면 null)
  ring: [string, string] | null;
  // 그림 칸 하늘 (위 → 아래)과 바닥
  sky: [string, string];
  ground: string;
  // 이름칸(위 → 아래)
  plate: [string, string];
  // 글자와 선 색
  ink: string;
  // 반짝이(Lv.50부터)
  sparkle: boolean;
};

const INK = '#2a2030';
const PAPER = '#fffaf2';

type ThemeLook = { frame: string; sky: [string, string]; ground: string; paper?: string };
const THEME_LOOK: Record<ThemeId, ThemeLook> = {
  basic: { frame: '#ff8fab', sky: ['#a9dcff', '#e6f6ff'], ground: '#8fd67a' },
  moonnight: { frame: '#6c6fd6', sky: ['#2c2f73', '#6a5aa8'], ground: '#3d3f86' },
  rose: { frame: '#e65873', sky: ['#ffc9d6', '#fff0f4'], ground: '#6fbf73' },
  teaparty: { frame: '#d7b08a', sky: ['#fff0d2', '#ffe1ea'], ground: '#f7c9d6' },
  ice: { frame: '#7cc4ef', sky: ['#e3f5ff', '#c3e9ff'], ground: '#ffffff' },
  mermaid: { frame: '#3cb7b2', sky: ['#8fe9df', '#3fb3cf'], ground: '#f3dfa6' },
  forest: { frame: '#5aa65a', sky: ['#dcf6cc', '#a6dc95'], ground: '#5a9a4a' },
  space: { frame: '#4a3a8a', sky: ['#1a1240', '#4b2f84'], ground: '#7e6bb8' },
  blackgold: { frame: '#3a3540', sky: ['#5a4a22', '#1e1a12'], ground: '#c99b3a', paper: '#fff4d6' },
  cyber: { frame: '#3a3f8f', sky: ['#141640', '#4a1f6e'], ground: '#24e0ff' },
  racing: { frame: '#e2524a', sky: ['#ffffff', '#e9e9ef'], ground: '#6b6b78' },
};

type TierLook = { rim: string; ring: [string, string]; plate: [string, string]; body: string[] };
// 기본(하리보) 카드는 10레벨마다 카드 색, 테두리, 이름칸이 함께 바뀌어요.
const BASIC_TIER: Partial<Record<Tier, TierLook>> = {
  silver: { rim: '#6b7a90', ring: ['#f4f7fb', '#9aa8bc'], plate: ['#ffffff', '#dfe5ee'], body: ['#eef2f8', '#c3cedd', '#e6ebf3', '#aebbcd'] },
  gold: { rim: '#a8741a', ring: ['#fff3b0', '#ffd35a'], plate: ['#fff3b0', '#ffd35a'], body: ['#fff1b3', '#f4c64e', '#ffe38a', '#e0a92e'] },
  mint: { rim: '#2f8f6c', ring: ['#e8fff4', '#7fd8b0'], plate: ['#f2fff8', '#c8f2df'], body: ['#dffbee', '#8fdcb8', '#c6f5e0', '#6cc89f'] },
  sky: { rim: '#3a78b8', ring: ['#eef8ff', '#8cc8f5'], plate: ['#f4fbff', '#cde9ff'], body: ['#e2f3ff', '#8ec9f5', '#cbe8ff', '#6aaee8'] },
  lavender: { rim: '#6e4fc0', ring: ['#f3e8ff', '#b48cf5'], plate: ['#fbf3ff', '#dcc4ff'], body: ['#ffe0f4', '#c9a4ff', '#ffd1ec', '#a98cf0'] },
  rose: { rim: '#b0485a', ring: ['#fff0f0', '#f0a0a8'], plate: ['#fff6f2', '#ffd1d6'], body: ['#ffe8e0', '#f3a6a8', '#ffd8cc', '#d98088'] },
  sunset: { rim: '#b84a1e', ring: ['#fff2d8', '#ffb35a'], plate: ['#fff4e0', '#ffc98a'], body: ['#ffe08a', '#ffb04a', '#ff7a5a', '#e0507a'] },
  night: { rim: '#151a40', ring: ['#c8d0ff', '#5a64b8'], plate: ['#f0f2ff', '#c8ceff'], body: ['#3a4290', '#1c2160', '#4a3a8a'] },
  ruby: { rim: '#4a0614', ring: ['#ffc8d2', '#d0304a'], plate: ['#fff0f3', '#f4a8b8'], body: ['#e0405a', '#a0102e', '#d0304a', '#7a0a22'] },
  legend: { rim: INK, ring: ['#fff8e0', '#ffd36b'], plate: ['#fff0b8', '#d8ecff'], body: ['#ff9aa8', '#ffd36b', '#8de8b0', '#8cc8ff', '#c39cff'] },
};

export function cardPalette(themeId: string | null | undefined, level: number): CardPalette {
  const theme = themeOrBasic(themeId);
  const look = THEME_LOOK[theme];
  const tier = tierFor(level);
  const effects = tierEffects(level);
  const sparkle = effects.includes('fx-sparkle');
  const paper = look.paper ?? PAPER;
  const basicTier = theme === 'basic' ? BASIC_TIER[tier] : undefined;
  if (basicTier) {
    return { rim: basicTier.rim, body: basicTier.body, ring: basicTier.ring, sky: look.sky, ground: look.ground, plate: basicTier.plate, ink: INK, sparkle };
  }
  // 산 테마(또는 Lv.1~9 기본 카드)는 테마 색 그대로, 테두리 장식만 레벨 따라 얹혀요.
  const ring: [string, string] | null = effects.includes('ring-gold')
    ? ['#ffd35a', '#fff3b0']
    : effects.includes('ring-silver')
      ? ['#e3e8ef', '#e3e8ef']
      : null;
  const plate: [string, string] = effects.includes('ring-gold')
    ? ['#fff3b0', '#ffd35a']
    : effects.includes('ring-silver')
      ? ['#ffffff', '#dfe5ee']
      : [paper, paper];
  return {
    rim: theme === 'basic' ? '#b8486a' : INK,
    body: [look.frame],
    ring,
    sky: look.sky,
    ground: look.ground,
    plate,
    ink: INK,
    sparkle,
  };
}
