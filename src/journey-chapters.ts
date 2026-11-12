// 원정대 장(챕터): 장마다 20일, 몬스터 레벨은 (장-1)*20+1 ~ 장*20.
// 1장을 깨면 2장이 열리고, 뒤로 갈수록 몬스터가 세져요. 그림은 public/journey/foe/c<장>-<이름>.webp (1장은 예전 이름).

export type Monster = { key: string; name: string; emoji: string };
export type Chapter = { n: number; name: string; foes: Monster[]; elite: Monster; boss: Monster };

const m = (ch: number, key: string, name: string, emoji: string): Monster => ({ key: ch === 1 ? key : `c${ch}-${key}`, name, emoji });

export const CHAPTERS: Chapter[] = [
  {
    n: 1,
    name: '말랑 숲',
    foes: [
      m(1, 'mushroom', '심술 버섯', '🍄'),
      m(1, 'slime', '말랑 슬라임', '🟢'),
      m(1, 'bat', '장난꾸러기 박쥐', '🦇'),
      m(1, 'hedgehog', '가시 고슴도치', '🦔'),
      m(1, 'wolf', '숲 늑대', '🐺'),
      m(1, 'crab', '돌 게', '🦀'),
      m(1, 'bees', '꿀벌 떼', '🐝'),
      m(1, 'ghost', '안개 유령', '👻'),
    ],
    elite: m(1, 'bear', '숲지기 곰', '🐻'),
    boss: m(1, 'dragon', '젤리 도둑 드래곤', '🐉'),
  },
  {
    n: 2,
    name: '새싹 들판',
    foes: [
      m(2, 'spore-scout', '포자 정찰병', '🍄'),
      m(2, 'dew-slime', '이슬 슬라임', '💧'),
      m(2, 'acorn-mite', '도토리 진드기', '🌰'),
      m(2, 'moss-snail', '이끼 달팽이', '🐌'),
      m(2, 'twig-beetle', '잔가지 딱정벌레', '🪲'),
      m(2, 'pollen-bee', '꽃가루 벌', '🐝'),
      m(2, 'petal-moth', '꽃잎 나방', '🦋'),
      m(2, 'clover-hare', '클로버 토끼', '🐇'),
    ],
    elite: m(2, 'seedling-sprite', '새싹 정령', '🌱'),
    boss: m(2, 'pebble-crab', '왕 조약돌 게', '🦀'),
  },
  {
    n: 3,
    name: '뿌리 숲',
    foes: [
      m(3, 'root-runner', '뿌리 질주꾼', '🌿'),
      m(3, 'bark-slime', '나무껍질 슬라임', '🟤'),
      m(3, 'fern-fox', '고사리 여우', '🦊'),
      m(3, 'mushroom-boar', '버섯 멧돼지', '🐗'),
      m(3, 'shelf-fungus', '선반 버섯', '🍄'),
      m(3, 'pinecone-armadillo', '솔방울 아르마딜로', '🌲'),
      m(3, 'woodpecker', '딱따구리', '🐦'),
      m(3, 'burrow-mole', '굴 파는 두더지', '🕳️'),
    ],
    elite: m(3, 'bramble-spider', '가시덤불 거미', '🕷️'),
    boss: m(3, 'vine-gecko', '덩굴 도마뱀 왕', '🦎'),
  },
  {
    n: 4,
    name: '가시 덤불',
    foes: [
      m(4, 'thorn-roller', '가시 굴렁쇠', '🌵'),
      m(4, 'dusk-bat', '해질녘 박쥐', '🦇'),
      m(4, 'thorn-wolf', '가시 늑대', '🐺'),
      m(4, 'briar-mantis', '찔레 사마귀', '🦗'),
      m(4, 'rose-boar', '장미 멧돼지', '🐗'),
      m(4, 'web-weaver', '거미줄 직공', '🕸️'),
      m(4, 'bracken-ram', '고사리 숫양', '🐏'),
      m(4, 'pitch-slime', '송진 슬라임', '⚫'),
    ],
    elite: m(4, 'thorn-beetle', '가시 딱정벌레', '🪲'),
    boss: m(4, 'spiked-tortoise', '가시 거북 대장', '🐢'),
  },
  {
    n: 5,
    name: '물안개 늪',
    foes: [
      m(5, 'lichen-crab', '이끼 게', '🦀'),
      m(5, 'reed-serpent', '갈대 뱀', '🐍'),
      m(5, 'bog-frog', '늪 개구리', '🐸'),
      m(5, 'river-turtle', '강 거북', '🐢'),
      m(5, 'mud-slime', '진흙 슬라임', '🟫'),
      m(5, 'willow-heron', '버들 왜가리', '🪶'),
      m(5, 'shell-crawler', '껍데기 기어꾼', '🐚'),
      m(5, 'driftwood-otter', '떠돌이 수달', '🦦'),
    ],
    elite: m(5, 'marsh-dragonfly', '늪 왕잠자리', '🪰'),
    boss: m(5, 'water-strider', '늪의 주인 소금쟁이', '🌊'),
  },
  {
    n: 6,
    name: '메아리 동굴',
    foes: [
      m(6, 'hollow-owl', '구멍 부엉이', '🦉'),
      m(6, 'night-wing', '밤날개', '🦇'),
      m(6, 'cavern-wolf', '동굴 늑대', '🐺'),
      m(6, 'geode-beetle', '보석 딱정벌레', '💎'),
      m(6, 'lantern-moth', '등불 나방', '🦋'),
      m(6, 'crag-goat', '바위산 염소', '🐐'),
      m(6, 'ink-salamander', '먹물 도롱뇽', '🦎'),
      m(6, 'stone-gargoyle', '돌 가고일', '🗿'),
    ],
    elite: m(6, 'coal-scorpion', '석탄 전갈', '🦂'),
    boss: m(6, 'echo-worm', '메아리 대왕 지렁이', '🪱'),
  },
  {
    n: 7,
    name: '서리 고개',
    foes: [
      m(7, 'mist-wisp', '안개 도깨비불', '🌫️'),
      m(7, 'frost-slime', '서리 슬라임', '🧊'),
      m(7, 'snow-hare', '눈 토끼', '🐇'),
      m(7, 'fog-hound', '안개 사냥개', '🐕'),
      m(7, 'ice-crab', '얼음 게', '🦀'),
      m(7, 'rime-boar', '서리 멧돼지', '🐗'),
      m(7, 'veil-moth', '장막 나방', '🦋'),
      m(7, 'snow-lynx', '눈 스라소니', '🐈'),
    ],
    elite: m(7, 'lantern-wraith', '등불 망령', '🏮'),
    boss: m(7, 'shard-beetle', '얼음 조각 왕딱정벌레', '❄️'),
  },
  {
    n: 8,
    name: '호박빛 사막',
    foes: [
      m(8, 'amber-stag', '호박 사슴', '🦌'),
      m(8, 'amber-bear', '호박 곰', '🐻'),
      m(8, 'sunset-wolf', '노을 늑대', '🐺'),
      m(8, 'honey-guard', '꿀 파수꾼', '🍯'),
      m(8, 'prism-crab', '무지개 게', '🦀'),
      m(8, 'copper-griffin', '구리 그리핀', '🦅'),
      m(8, 'dune-scorpion', '모래 전갈', '🦂'),
      m(8, 'sunstone-golem', '태양석 골렘', '🌞'),
    ],
    elite: m(8, 'cinder-fox', '불씨 여우', '🦊'),
    boss: m(8, 'crystal-snake', '수정 왕뱀', '🐍'),
  },
  {
    n: 9,
    name: '잿빛 화산',
    foes: [
      m(9, 'obsidian-bear', '흑요석 곰', '🐻'),
      m(9, 'magma-crab', '용암 게', '🦀'),
      m(9, 'dread-bat', '공포 박쥐', '🦇'),
      m(9, 'ash-wolf', '잿빛 늑대', '🐺'),
      m(9, 'cinder-salamander', '불씨 도롱뇽', '🦎'),
      m(9, 'basalt-ram', '현무암 숫양', '🐏'),
      m(9, 'ember-mantis', '불꽃 사마귀', '🦗'),
      m(9, 'smoke-wraith', '연기 망령', '💨'),
    ],
    elite: m(9, 'forge-golem', '대장간 골렘', '⚒️'),
    boss: m(9, 'ash-wyvern', '잿빛 와이번', '🐲'),
  },
];

export const MAX_CHAPTER = CHAPTERS.length;
export const chapterOf = (n: number | undefined): Chapter => CHAPTERS[Math.min(MAX_CHAPTER, Math.max(1, n ?? 1)) - 1]!;
// 몬스터가 장마다 30%씩 세져요(체력·공격력). 동전도 그만큼 더 줘요.
export const chapterPower = (n: number | undefined) => 1 + 0.3 * (Math.min(MAX_CHAPTER, Math.max(1, n ?? 1)) - 1);
export const chapterLevels = (n: number) => `Lv.${(n - 1) * 20 + 1}~${n * 20}`;
export const BOSS_KEYS = new Set(CHAPTERS.map((c) => c.boss.key));
