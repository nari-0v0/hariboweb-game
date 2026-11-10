// 사건파일 방 그림(나리님이 그린 방 16장, public/case/room/<방>.webp) 속 물건 자리.
// 그림 한 장에 물건이 다 그려져 있고, 사건은 이 자리들만 써요. 위치는 그림 기준 %(가로 x, 세로 y는 가운데, w·h는 크기).
// tag: door 문 · lock 잠글 수 있는 곳 · clock 시계 · wall 글씨·그림을 붙일 수 있는 곳
// tool: 도구를 써야 하는 곳(dark 깜깜함 · deep 깊음 · high 높음 · tiny 깨알 글씨 · soil 굳은 흙 · keyhole 특이한 열쇠 구멍)
// rid: 이 물건이 답인 수수께끼, face: 시계 판 [가운데 x, 가운데 y, 반지름(가로 %)] 과 판 색

export type RoomKey =
  | 'office' | 'office2' | 'music' | 'music2' | 'bedroom' | 'bedroom2' | 'storage' | 'storage2'
  | 'study' | 'pantry' | 'dressing' | 'lab' | 'gallery' | 'attic' | 'cafe' | 'classroom';
export type Hotspot = {
  id: string;
  label: string;
  at: string; // "○○ 안에" 처럼 물건을 찾은 곳을 말할 때
  x: number;
  y: number;
  w: number;
  h: number;
  tag?: ('door' | 'lock' | 'clock' | 'wall')[];
  tool?: ('dark' | 'deep' | 'high' | 'tiny' | 'soil' | 'keyhole')[];
  rid?: string;
  face?: [number, number, number, string];
};
export type Room = { key: RoomKey; spots: Hotspot[]; people: [number, number][] };

const R_CHAIR = '다리는 있는데 한 걸음도 못 걸어요.';
const R_CLOCK = '바늘이 둘인데 바느질은 못 해요.';
const R_PLANT = '물만 먹고도 쑥쑥 자라요.';
const R_BROOM = '바닥을 쓸며 혼자 춤을 춰요.';
const R_LAMP = '밤이 되면 혼자 해가 떠요.';
const R_WINDOW = '나를 들여다보면 바깥이 보여요.';
const R_RUG = '모두가 밟고 지나가도 화를 안 내요.';
const R_MIRROR = '나를 보면 네가 보여요.';
const R_BOOK = '펼치면 이야기를 하지만 입은 없어요.';
const R_FLOWER = '활짝 웃는 얼굴로 물만 마시며 살아요.';

// 짧게 쓰는 도우미: [id, 이름, 찾은 곳, x, y, w, h, 그 밖]
type Extra = Partial<Pick<Hotspot, 'tag' | 'tool' | 'rid' | 'face'>>;
const S = (id: string, label: string, at: string, x: number, y: number, w: number, h: number, e: Extra = {}): Hotspot => ({ id, label, at, x, y, w, h, ...e });
const DOOR = (x: number, y: number, w: number, h: number) => S('door', '문', '문틈에', x, y, w, h, { tag: ['door'] });
const CLOCK = (x: number, y: number, w: number, h: number, face: [number, number, number, string], high = true) =>
  S('clock', '벽시계', '벽시계 뒤에', x, y, w, h, { tag: ['clock'], tool: high ? ['high'] : undefined, rid: R_CLOCK, face });
const WINDOW = (x: number, y: number, w: number, h: number) => S('window', '창문', '창틀에', x, y, w, h, { tag: ['wall'], rid: R_WINDOW });
const PLANT = (x: number, y: number, w: number, h: number) => S('plant', '화분', '화분 흙 위에', x, y, w, h, { tool: ['soil'], rid: R_PLANT });
const RUG = (x: number, y: number, w: number, h: number) => S('rug', '러그', '러그 밑에', x, y, w, h, { rid: R_RUG });
const FLOOR = (x: number, y: number, w: number, h: number) => S('floor', '삐걱거리는 마룻바닥', '삐걱거리는 마루 틈에', x, y, w, h, { tool: ['dark'] });
const R_UMB = '비 오는 날에만 활짝 펴요.';
const R_PC = '마우스가 있지만 치즈는 안 먹어요.';
const R_METRO = '쉬지 않고 고개를 흔들며 박자만 세요.';
const R_PIANO = '이는 많은데 아무것도 못 씹어요.';
const R_GUITAR = '줄이 여섯 개인데 줄넘기는 못 해요.';
const R_DRUM = '맞을수록 신나서 소리를 질러요.';
const R_LADDER = '올라갈 때도 내려올 때도 같은 칸을 밟아요.';
const R_ROBOT = '배터리만 먹으면 삐빅 하고 일어나요.';
const R_BED = '밤마다 너를 꼭 안아 주지만 팔이 없어요.';
const R_TEDDY = '솜으로 꽉 찬 배를 안으면 마음이 폭신해요.';
const R_CAL = '날마다 한 장씩 늙어 가요.';

const office = (two: boolean): Room => ({
  key: two ? 'office2' : 'office',
  people: two ? [[24, 86], [66, 88], [86, 86]] : [[26, 86], [66, 88], [86, 86]],
  spots: two
    ? [
        DOOR(3.5, 48, 7, 55),
        WINDOW(18.5, 14, 15, 19),
        S('cab1', '서류함 맨 윗칸', '서류함 맨 윗칸 안에', 18.5, 39, 12, 8, { tag: ['lock'], tool: ['high'] }),
        S('cab2', '서류함 가운데 칸', '서류함 가운데 칸 안에', 18.5, 48, 12, 9, { tag: ['lock'] }),
        S('cab3', '서류함 아랫칸', '서류함 아랫칸 안에', 18.5, 58, 12, 9, { tag: ['lock'], tool: ['dark'] }),
        PLANT(31.5, 35, 11, 16),
        S('board', '코르크 게시판', '코르크 게시판에', 50.5, 22, 24, 20, { tag: ['wall'], tool: ['tiny'] }),
        S('pc', '컴퓨터', '컴퓨터 화면에', 48.5, 41, 12, 13, { tag: ['wall'], rid: R_PC }),
        S('mug', '머그컵', '머그컵 밑에', 59, 45, 5, 7, { tool: ['deep'] }),
        S('chair', '의자', '의자 방석 밑에', 40, 56, 12, 22, { rid: R_CHAIR }),
        S('deskR', '책상 서랍', '책상 서랍 안에', 60.5, 57, 12, 15, { tag: ['lock'], tool: ['dark'] }),
        CLOCK(74.5, 20.5, 11, 16, [74.7, 20.3, 4.3, '#fee4c7']),
        S('safe', '금고', '금고 안에', 76, 56, 12, 17, { tag: ['lock'], tool: ['keyhole'] }),
        S('rack', '옷걸이 우산', '옷걸이에 걸린 우산 속에', 89, 45, 10, 45, { rid: R_UMB }),
        RUG(48.5, 78, 48, 13),
      ]
    : [
        DOOR(4.5, 50, 8, 55),
        WINDOW(17.5, 19, 16, 22),
        S('cab1', '서류함 맨 윗칸', '서류함 맨 윗칸 안에', 19, 40, 12, 8, { tag: ['lock'], tool: ['high'] }),
        S('cab2', '서류함 가운데 칸', '서류함 가운데 칸 안에', 19, 50, 12, 9, { tag: ['lock'] }),
        S('cab3', '서류함 아랫칸', '서류함 아랫칸 안에', 19, 59, 12, 9, { tag: ['lock'], tool: ['dark'] }),
        PLANT(31, 52, 10, 27),
        S('board', '코르크 게시판', '코르크 게시판에', 51, 20, 24, 18, { tag: ['wall'], tool: ['tiny'] }),
        S('pc', '컴퓨터', '컴퓨터 화면에', 56, 40, 12, 12, { tag: ['wall'], rid: R_PC }),
        S('mug', '머그컵', '머그컵 밑에', 63.5, 46, 4, 6, { tool: ['deep'] }),
        S('deskL', '책상 왼쪽 서랍', '책상 왼쪽 서랍 안에', 40, 57, 8, 14, { tag: ['lock'] }),
        S('deskR', '책상 오른쪽 서랍', '책상 오른쪽 서랍 안에', 69, 57, 9, 14, { tag: ['lock'], tool: ['dark'] }),
        S('chair', '의자', '의자 방석 밑에', 52.5, 58, 12, 22, { rid: R_CHAIR }),
        CLOCK(76, 19, 12, 17, [76.2, 18.9, 4.6, '#fce0be']),
        S('safe', '금고', '금고 안에', 78, 56, 13, 17, { tag: ['lock'], tool: ['keyhole'] }),
        S('rack', '옷걸이 우산', '옷걸이에 걸린 우산 속에', 93, 44, 10, 46, { rid: R_UMB }),
        RUG(50, 77, 44, 11),
      ],
});

const music = (two: boolean): Room => {
  const p = two
    ? { door: [3.5, 52, 7, 55], window: [19, 11, 21, 17], metro: [36, 26, 7, 12], piano: [27, 44, 31, 20], low: [26, 58, 26, 7], bench: [25, 66, 16, 10], clock: [54.5, 15, 12, 17], face: [54.5, 15.5, 4.4], poster: [76.5, 23, 15, 23], stand: [50.5, 40, 12, 10], guitar: [63.5, 50, 11, 31], drum: [77.5, 55, 11, 13], plant: [91, 49, 14, 29], gcase: [83, 72, 26, 12], floor: [40, 86, 30, 12] }
    : { door: [3.5, 50, 7, 55], window: [22, 14, 25, 28], metro: [37, 29, 7, 12], piano: [29, 45, 32, 16], low: [29, 57, 28, 7], bench: [28, 65, 16, 9], clock: [79, 17, 11, 16], face: [78.8, 16.5, 4], poster: [54, 19, 12, 22], stand: [51, 41, 12, 10], guitar: [66, 49, 11, 28], drum: [76.5, 54, 9, 13], plant: [89, 45, 13, 27], gcase: [84, 72, 24, 10], floor: [50, 86, 30, 12] };
  const a = (k: keyof typeof p) => p[k] as [number, number, number, number];
  return {
    key: two ? 'music2' : 'music',
    people: two ? [[18, 86], [58, 88], [66, 84]] : [[22, 86], [62, 88], [72, 84]],
    spots: [
      DOOR(...a('door')),
      WINDOW(...a('window')),
      S('metro', '메트로놈', '메트로놈 밑에', ...a('metro'), { tool: ['high'], rid: R_METRO }),
      S('piano', '피아노', '피아노 건반 뚜껑 안에', ...a('piano'), { rid: R_PIANO }),
      S('pianoLow', '피아노 아래 덮개', '피아노 아래 덮개 안에', ...a('low'), { tag: ['lock'], tool: ['dark'] }),
      S('bench', '피아노 의자', '피아노 의자 밑에', ...a('bench'), { rid: R_CHAIR }),
      S('poster', '음악 포스터', '음악 포스터에', ...a('poster'), { tag: ['wall'], tool: ['tiny'] }),
      S('stand', '악보대', '악보대 위 악보에', ...a('stand'), { tag: ['wall'], tool: ['tiny'] }),
      S('guitar', '기타', '기타 울림 구멍 속에', ...a('guitar'), { tool: ['deep'], rid: R_GUITAR }),
      CLOCK(...a('clock'), [...(p.face as [number, number, number]), two ? '#fee7c9' : '#fad6b9']),
      S('drum', '북', '북 속에', ...a('drum'), { tag: ['lock'], rid: R_DRUM }),
      PLANT(...a('plant')),
      S('gcase', '기타 케이스', '기타 케이스 안에', ...a('gcase'), { tag: ['lock'], tool: ['keyhole'] }),
      FLOOR(...a('floor')),
    ],
  };
};

const bedroom = (two: boolean): Room => ({
  key: two ? 'bedroom2' : 'bedroom',
  people: [[16, 86], [30, 88], [64, 88]],
  spots: two
    ? [
        DOOR(4.5, 48, 8, 58),
        S('ward', '옷장', '옷장 안에', 22, 31, 18, 28, { tag: ['lock'], tool: ['high'] }),
        S('wardLow', '옷장 아래 서랍', '옷장 아래 서랍 안에', 22, 59, 17, 8, { tag: ['lock'] }),
        WINDOW(46, 26, 26, 30),
        S('teddy', '곰 인형', '곰 인형 리본 밑에', 42, 57, 11, 20, { rid: R_TEDDY }),
        S('lamp', '스탠드', '스탠드 갓 안쪽에', 59, 44, 7, 12, { rid: R_LAMP }),
        S('alarm', '자명종', '자명종 밑에', 66, 47, 5, 8),
        S('night', '협탁 서랍', '협탁 서랍 안에', 62, 58, 13, 12, { tag: ['lock'], tool: ['dark'] }),
        S('cal', '달력', '달력에', 73, 26, 11, 16, { tag: ['wall'], tool: ['tiny'], rid: R_CAL }),
        CLOCK(87.5, 20, 10, 15, [87.5, 19.8, 3.8, '#fde8c9']),
        S('bed', '침대', '베개 밑에', 86, 59, 26, 30, { tool: ['dark'], rid: R_BED }),
        RUG(45, 79, 40, 13),
        S('jewel', '보석함', '보석함 안에', 87, 80, 10, 11, { tag: ['lock'], tool: ['keyhole'] }),
      ]
    : [
        DOOR(4, 48, 9, 60),
        S('ward', '옷장', '옷장 안에', 25, 33, 21, 32, { tag: ['lock'], tool: ['high'] }),
        S('wardLow', '옷장 아래 서랍', '옷장 아래 서랍 안에', 25, 56, 18, 9, { tag: ['lock'] }),
        WINDOW(51, 28, 25, 32),
        S('teddy', '곰 인형', '곰 인형 리본 밑에', 44, 56, 10, 18, { rid: R_TEDDY }),
        S('lamp', '스탠드', '스탠드 갓 안쪽에', 57, 46, 7, 11, { rid: R_LAMP }),
        S('clock', '자명종', '자명종 밑에', 64, 47, 5, 8, { tag: ['clock'], rid: R_CLOCK, face: [63.5, 50.9, 1.35, '#fddeb5'] }),
        S('night', '협탁 서랍', '협탁 서랍 안에', 60, 60, 14, 11, { tag: ['lock'], tool: ['dark'] }),
        S('cal', '달력', '달력에', 82, 20, 14, 19, { tag: ['wall'], tool: ['tiny'], rid: R_CAL }),
        S('bed', '침대', '베개 밑에', 88, 58, 26, 30, { tool: ['dark'], rid: R_BED }),
        RUG(46, 78, 41, 15),
        S('jewel', '보석함', '보석함 안에', 73, 84, 8, 9, { tag: ['lock'], tool: ['keyhole'] }),
      ],
});

const storage = (two: boolean): Room => {
  const p = two
    ? { door: [4, 45, 7, 45], steel: [22, 40, 16, 40], web1: [15, 8, 10, 10], web2: [87, 8, 12, 11], bulb: [51.5, 13, 6, 14], fuse: [64, 26, 11, 14], box1: [37, 40, 8, 7], box2: [37, 47, 10, 7], box3: [37, 56, 11, 10], chest: [52, 54, 15, 18], robot: [67, 52, 10, 19], ladder: [81, 44, 12, 40], broom: [90, 48, 7, 32], toolbox: [13, 75, 13, 13], suit: [26, 73, 14, 15] }
    : { door: [5, 48, 9, 55], steel: [22, 45, 19, 45], web1: [16, 8, 10, 11], web2: [93, 8, 8, 10], bulb: [50, 16, 7, 14], fuse: [70, 30, 11, 14], box1: [39, 40, 8, 7], box2: [39, 48, 11, 8], box3: [39, 57, 13, 11], chest: [55, 57, 15, 17], robot: [71, 58, 10, 18], ladder: [84, 47, 11, 39], broom: [94, 55, 7, 30], toolbox: [14, 76, 14, 13], suit: [31, 75, 15, 15] };
  const a = (k: keyof typeof p) => p[k] as [number, number, number, number];
  const spots = [
    DOOR(...a('door')),
    S('steel', '철문', '철문 틈에', ...a('steel'), { tag: ['lock'], tool: ['keyhole'] }),
    S('web1', '거미줄 구석', '거미줄 사이에', ...a('web1'), { tool: ['high'] }),
    S('web', '거미줄', '거미줄 사이에', ...a('web2'), { tool: ['high'] }),
    S('bulb', '전구', '전구 갓 안쪽에', ...a('bulb'), { tool: ['high'], rid: R_LAMP }),
    S('fuse', '두꺼비집', '두꺼비집 안에', ...a('fuse'), { tag: ['lock', 'wall'], tool: ['tiny'] }),
    S('box1', '맨 위 상자', '맨 위 상자 안에', ...a('box1'), { tool: ['high'] }),
    S('box2', '가운데 상자', '가운데 상자 안에', ...a('box2')),
    S('box3', '맨 아래 상자', '맨 아래 상자 안에', ...a('box3'), { tool: ['dark'] }),
    S('chest', '보물 상자', '보물 상자 안에', ...a('chest'), { tag: ['lock'], tool: ['keyhole'] }),
    S('robot', '고장 난 로봇', '로봇 등 뚜껑 안에', ...a('robot'), { tool: ['dark'], rid: R_ROBOT }),
    S('ladder', '사다리', '사다리 맨 위 칸에', ...a('ladder'), { rid: R_LADDER }),
    S('broom', '빗자루', '빗자루 솔 사이에', ...a('broom'), { rid: R_BROOM }),
    S('toolbox', '공구함', '공구함 안에', ...a('toolbox'), { tag: ['lock'] }),
    S('suit', '여행 가방', '여행 가방 안에', ...a('suit'), { tag: ['lock'], tool: ['deep'] }),
  ];
  if (two) spots.splice(1, 0, S('window', '창문', '창틀에', 6, 10, 9, 13, { tag: ['wall'], tool: ['high'], rid: R_WINDOW }));
  return { key: two ? 'storage2' : 'storage', people: two ? [[48, 86], [64, 88], [80, 86]] : [[50, 86], [66, 88], [84, 86]], spots };
};

export const ROOMS: Record<RoomKey, Room> = {
  office: office(false),
  office2: office(true),
  music: music(false),
  music2: music(true),
  bedroom: bedroom(false),
  bedroom2: bedroom(true),
  storage: storage(false),
  storage2: storage(true),
  study: {
    key: 'study',
    people: [[24, 86], [74, 88], [88, 86]],
    spots: [
      DOOR(3.5, 48, 7, 60),
      S('shelfTop', '책장 맨 윗칸 화분', '책장 맨 윗칸 화분 속에', 17, 12, 14, 12, { tool: ['high', 'soil'] }),
      S('books', '책장', '책장의 책 사이에', 18, 38, 16, 28, { rid: R_BOOK }),
      S('shelfBox', '책장 아래 상자', '책장 아래 상자 안에', 22, 64, 7, 7, { tag: ['lock'] }),
      WINDOW(41, 24, 24, 30),
      CLOCK(62, 17, 9, 24, [62.1, 19.2, 2.3, '#fed9ac']),
      S('frame', '풍경화 액자', '풍경화 액자 뒤에', 81, 21, 20, 15, { tag: ['wall'], tool: ['tiny'] }),
      S('candle', '촛불', '촛대 밑에', 36, 45, 5, 10, { rid: '키가 클수록 빨리 줄어들어요.' }),
      S('book', '펼친 책', '펼친 책장에', 46, 47.5, 12, 5, { tag: ['wall'], tool: ['tiny'] }),
      S('globe', '지구본', '지구본 받침 밑에', 56, 42, 7, 13, { rid: '세상을 다 품었는데 손바닥만 해요.' }),
      S('deskL', '자물쇠 서랍장', '자물쇠 서랍장 안에', 35, 61, 9, 17, { tag: ['lock'] }),
      S('deskR', '책상 서랍', '책상 서랍 안에', 60, 61, 9, 17, { tool: ['dark'] }),
      S('chair', '의자', '의자 방석 밑에', 46.5, 62, 11, 21, { rid: R_CHAIR }),
      S('fish', '어항', '어항 바닥 돌 틈에', 69, 42, 9, 10, { tool: ['deep'], rid: '물속에 사는 친구들의 유리 집이에요.' }),
      S('cab', '유리 진열장', '유리 진열장 안에', 72, 59, 12, 24, { tag: ['lock'], tool: ['keyhole'] }),
      S('arm', '안락의자', '안락의자 쿠션 밑에', 88, 58, 19, 26),
      RUG(48, 81, 37, 13),
    ],
  },
  pantry: {
    key: 'pantry',
    people: [[22, 86], [56, 88], [76, 86]],
    spots: [
      DOOR(4, 52, 9, 60),
      S('freezer', '냉동실', '냉동실 안에', 22, 28, 18, 16, { tag: ['lock'] }),
      S('fridge', '냉장고', '냉장고 안에', 22, 50, 18, 26, { tag: ['lock'], tool: ['deep'] }),
      S('jar1', '딸기잼 병', '딸기잼 병 뚜껑 밑에', 37, 20, 5, 8, { tool: ['high'] }),
      S('jar2', '오렌지잼 병', '오렌지잼 병 뚜껑 밑에', 44, 20, 5, 8, { tool: ['high'] }),
      S('jar3', '포도잼 병', '포도잼 병 뚜껑 밑에', 51, 20, 5, 8, { tool: ['high'] }),
      S('jar4', '키위잼 병', '키위잼 병 뚜껑 밑에', 42, 31, 5, 8),
      S('jar5', '귤잼 병', '귤잼 병 뚜껑 밑에', 49, 31, 5, 8),
      S('kettle', '주전자', '주전자 뚜껑 안에', 40, 48, 11, 10, { rid: '머리에서 김을 뿜으며 노래해요.' }),
      S('oven', '오븐', '오븐 안에', 41, 61, 15, 17, { tag: ['lock'], tool: ['dark'] }),
      S('crate', '나무 상자', '나무 상자 바닥에', 59, 63, 15, 15, { tool: ['dark'] }),
      CLOCK(66, 21, 11, 16, [66.1, 20.4, 4.8, '#fde2ba']),
      S('menu', '메뉴판', '메뉴판에', 83, 25, 16, 24, { tag: ['wall'], tool: ['tiny'] }),
      S('basket', '과일 바구니', '과일 바구니 속에', 77.5, 61, 14, 19, { rid: '알록달록 열매를 품에 안고 있어요.' }),
      S('broom', '빗자루', '빗자루 솔 사이에', 93, 59, 9, 40, { rid: R_BROOM }),
    ],
  },
  dressing: {
    key: 'dressing',
    people: [[40, 86], [68, 88], [80, 86]],
    spots: [
      DOOR(5, 52, 9, 55),
      WINDOW(19, 15, 14, 22),
      S('curtain', '무대 커튼', '커튼 주름 속에', 50, 6, 50, 11, { tool: ['high'] }),
      CLOCK(76.7, 16, 9, 14, [76.7, 16.3, 3.4, '#f4bb80']),
      S('rack', '의상 행거', '무대 의상 주머니 속에', 24, 42, 26, 28, { rid: '옷은 많은데 하나도 안 입어요.' }),
      S('trunk', '의상 트렁크', '의상 트렁크 안에', 26, 65, 17, 14, { tag: ['lock'], tool: ['keyhole'] }),
      S('flowers', '꽃병', '꽃병 속에', 43, 42, 8, 12, { rid: R_FLOWER }),
      S('mirror', '조명 거울', '거울 테두리에', 54, 31, 16, 26, { tag: ['wall'], tool: ['tiny'], rid: R_MIRROR }),
      S('makeup', '화장품', '화장품 통 속에', 60, 46, 9, 6, { tool: ['deep'] }),
      S('vanL', '화장대 왼쪽 서랍', '화장대 왼쪽 서랍 안에', 43, 60, 9, 14, { tag: ['lock'] }),
      S('vanR', '화장대 오른쪽 서랍', '화장대 오른쪽 서랍 안에', 63, 60, 9, 14, { tag: ['lock'], tool: ['dark'] }),
      S('stool', '둥근 의자', '둥근 의자 방석 밑에', 53.5, 63, 9, 13, { rid: R_CHAIR }),
      S('hat', '모자걸이', '걸린 모자 속에', 74, 50, 11, 44, { tool: ['high'], rid: '머리가 없는데 모자를 잔뜩 썼어요.' }),
      S('screen', '칸막이', '칸막이 뒤에', 91, 51, 18, 46, { tool: ['dark'] }),
      FLOOR(50, 86, 30, 12),
    ],
  },
  lab: {
    key: 'lab',
    people: [[30, 86], [52, 88], [70, 86]],
    spots: [
      DOOR(3.5, 57, 7, 55),
      WINDOW(18, 20, 17, 20),
      S('chart', '괘도', '괘도에', 42, 26, 19, 20, { tag: ['wall'], tool: ['tiny'] }),
      CLOCK(64, 21, 11, 16, [64.2, 21, 4.6, '#fdeedd']),
      S('ext', '소화기', '소화기 받침에', 87, 20, 7, 17, { rid: '불만 보면 하얀 숨을 내뿜어요.' }),
      S('flasks', '플라스크', '플라스크 바닥에', 18, 49, 16, 9, { tool: ['deep'] }),
      S('tubes', '시험관 꽂이', '시험관 꽂이 밑에', 33, 48, 10, 9),
      S('micro', '현미경', '현미경 받침 유리에', 43.5, 45, 8, 15, { tool: ['tiny'], rid: '작은 것을 크게 보여 주는 외눈박이예요.' }),
      S('drL', '실험대 서랍', '실험대 서랍 안에', 14, 64, 11, 13, { tag: ['lock'] }),
      S('drR', '실험대 오른쪽 서랍', '실험대 오른쪽 서랍 안에', 43, 64, 11, 13, { tag: ['lock'], tool: ['dark'] }),
      S('stool', '둥근 의자', '둥근 의자 밑에', 30, 68, 9, 15, { rid: R_CHAIR }),
      S('sink', '개수대', '개수대 배수구 속에', 59, 50, 17, 8, { tool: ['deep'] }),
      S('sinkCab', '개수대 아래 문', '개수대 아래 칸 안에', 59, 63, 16, 14, { tag: ['lock'], tool: ['dark'] }),
      S('skel', '해골 모형', '해골 모형 갈비뼈 사이에', 73, 52, 8, 33, { rid: '뼈만 남았는데 늘 웃고 있어요.' }),
      S('locker', '철제 사물함', '철제 사물함 안에', 88, 51, 20, 44, { tag: ['lock'], tool: ['keyhole'] }),
    ],
  },
  attic: {
    key: 'attic',
    people: [[30, 88], [40, 84], [56, 88]],
    spots: [
      DOOR(4, 51, 8, 55),
      WINDOW(25, 22, 22, 30),
      S('lantern', '랜턴', '랜턴 안에', 62, 18, 6, 18, { tool: ['high'], rid: R_LAMP }),
      S('clock', '괘종시계', '괘종시계 뒤에', 69, 34, 6, 15, { tag: ['clock'], rid: R_CLOCK, face: [69.9, 32.7, 2.1, '#de944c'] }),
      S('web', '거미줄', '거미줄 사이에', 89, 34, 15, 17, { tool: ['high'] }),
      S('trunk', '낡은 트렁크', '낡은 트렁크 안에', 17, 61, 17, 16, { tag: ['lock'], tool: ['keyhole'] }),
      S('mirror', '전신 거울', '거울 뒷면에', 32, 52, 10, 30, { tag: ['wall'], rid: R_MIRROR }),
      S('shelfTop', '책장 맨 윗칸 화분', '책장 맨 윗칸 화분 속에', 50, 28, 10, 10, { tool: ['high', 'soil'] }),
      S('shelf', '책장', '책장의 책 사이에', 47, 52, 17, 36, { rid: R_BOOK }),
      S('rock', '흔들의자', '흔들의자 담요 밑에', 64, 57, 15, 30, { rid: '앉으면 혼자 앞뒤로 춤을 춰요.' }),
      S('books', '책 더미', '책 더미 사이에', 75, 63, 9, 15, { tool: ['tiny'] }),
      S('horse', '흔들 목마', '목마 안장 밑에', 89, 67, 16, 18, { rid: '달리는 흉내만 내고 제자리예요.' }),
      S('shelfBox', '책장 속 작은 상자', '책장 속 작은 상자 안에', 43.5, 56, 7, 5, { tag: ['lock'] }),
      FLOOR(50, 87, 26, 10),
      S('beam', '천장 들보', '천장 들보 위에', 70, 5, 50, 8, { tool: ['high'] }),
    ],
  },
  gallery: {
    key: 'gallery',
    people: [[36, 86], [60, 88], [68, 84]],
    spots: [
      DOOR(3, 52, 6, 40),
      S('window', '둥근 창문', '둥근 창틀에', 8, 12, 16, 22, { tag: ['wall'], tool: ['high'], rid: R_WINDOW }),
      S('p1', '꽃 그림', '꽃 그림 액자 뒤에', 31, 21, 15, 20, { tag: ['wall'], tool: ['tiny'] }),
      S('p2', '노을 그림', '노을 그림 액자 뒤에', 53, 19, 24, 28, { tag: ['wall'] }),
      S('p3', '성 그림', '성 그림 액자 뒤에', 76, 22, 15, 22, { tag: ['wall'], tool: ['tiny'] }),
      CLOCK(91.5, 18, 8, 26, [91.6, 19.2, 3, '#efc293']),
      PLANT(14.5, 54, 11, 29),
      S('bust', '흉상', '흉상 뒤통수에', 25.5, 45, 9, 14, { rid: '얼굴은 있는데 몸은 돌로 굳었어요.' }),
      S('pedestal', '흉상 받침대', '받침대 안에', 25.5, 63, 9, 18, { tag: ['lock'] }),
      S('case', '유리 진열장', '유리 진열장 안에', 48.5, 48, 11, 15, { tag: ['lock'], tool: ['keyhole'] }),
      S('rope', '빨간 줄', '빨간 줄 기둥 밑에', 46, 62, 30, 10),
      S('bench', '벤치', '벤치 밑에', 75.5, 61, 19, 10, { tool: ['dark'], rid: R_CHAIR }),
      S('box', '기부함', '기부함 안에', 91, 60, 9, 18, { tag: ['lock'] }),
    ],
  },
  cafe: {
    key: 'cafe',
    people: [[26, 86], [50, 88], [76, 86]],
    spots: [
      DOOR(4, 49, 8, 46),
      WINDOW(22, 21, 19, 22),
      CLOCK(38.8, 18, 9, 14, [38.8, 20.1, 3.9, '#facb8d']),
      S('lamps', '천장 조명', '조명 갓 안쪽에', 59, 10, 18, 10, { tool: ['high'], rid: R_LAMP }),
      S('jar1', '원두 병', '원두 병 속에', 49.5, 24.5, 4.5, 8, { tool: ['high', 'deep'] }),
      S('jar2', '초코볼 병', '초코볼 병 속에', 53.5, 24.5, 4.5, 8, { tool: ['high'] }),
      S('jar3', '쿠키 병', '쿠키 병 속에', 58.5, 24.5, 4.5, 8),
      S('hplant', '매달린 화분', '매달린 화분 속에', 67.5, 28, 6, 17, { tool: ['high', 'soil'] }),
      S('board', '칠판 메뉴판', '칠판 메뉴판에', 84, 22.5, 21, 26, { tag: ['wall'], tool: ['tiny'] }),
      S('vase', '테이블 꽃병', '꽃병 밑에', 22.5, 48, 5, 8, { rid: R_FLOWER }),
      S('chair', '의자', '의자 방석 밑에', 31, 61, 7, 22, { rid: R_CHAIR }),
      PLANT(37, 52, 7, 30),
      S('grinder', '커피 그라인더', '그라인더 서랍 속에', 49.5, 46, 3.5, 11),
      S('coffee', '커피 머신', '커피 머신 컵 받침에', 56.5, 44, 9, 15, { rid: '김을 뿜으며 쓴 것을 만드는데 다들 좋아해요.' }),
      S('register', '계산기', '계산기 돈 서랍 안에', 72, 48, 8, 10, { tag: ['lock'] }),
      S('box', '카운터 밑 상자', '카운터 밑 상자 안에', 62.5, 65.5, 9, 13, { tag: ['lock'], tool: ['keyhole'] }),
      S('cake', '케이크 진열장', '케이크 진열장 안에', 88, 47, 22, 23, { tag: ['lock'], rid: '달콤한 것들이 유리 집에서 구경거리가 돼요.' }),
    ],
  },
  classroom: {
    key: 'classroom',
    people: [[40, 86], [62, 88], [96, 86]],
    spots: [
      DOOR(4, 58, 8, 55),
      S('window', '창문', '창틀에', 14, 34, 12, 41, { tag: ['wall'], rid: R_WINDOW }),
      S('globe', '지구본', '지구본 받침 밑에', 27, 21, 8, 13, { tool: ['high'], rid: '세상을 다 품었는데 손바닥만 해요.' }),
      S('shelf', '책장', '책장의 책 사이에', 28, 45, 13, 36, { rid: R_BOOK }),
      S('board', '칠판', '칠판에', 52, 33, 33, 24, { tag: ['wall'] }),
      CLOCK(75.5, 16, 9, 13, [75.6, 16.4, 4, '#fddfb4']),
      S('map', '세계 지도', '세계 지도에', 77, 36, 14, 17, { tag: ['wall'], tool: ['tiny'] }),
      S('cab', '잠긴 교구장', '교구장 안에', 91, 44, 14, 35, { tag: ['lock'], tool: ['keyhole'] }),
      S('bin', '휴지통', '휴지통 바닥에', 82, 56, 6, 9, { tool: ['deep'], rid: '버린 것만 먹고도 배가 불러요.' }),
      S('desk', '교탁', '교탁 서랍 안에', 52, 59, 26, 17, { tag: ['lock'], tool: ['dark'] }),
      S('bell', '종', '종 밑에', 60, 48.5, 4, 5, { rid: '머리를 두드리면 딩동 하고 모두를 불러요.' }),
      S('tchair', '선생님 의자', '선생님 의자 등받이에', 53, 48, 9, 5, { rid: R_CHAIR }),
      S('d1', '앞자리 책상', '책상 서랍 속에', 21, 76, 19, 22),
      S('d2', '뒷자리 책상', '책상 서랍 속에', 80, 76, 19, 22),
    ],
  },
};
export const ROOM_KEYS = Object.keys(ROOMS) as RoomKey[];

// 방 이름 낱말로 그림을 골라요(이름에 맞는 게 없으면 이름으로 하나를 정해요).
const ROOM_BY_NAME: [RoomKey, RegExp][] = [
  ['dressing', /분장|탈의|무대|소품|의상|공연|촬영/],
  ['lab', /실험|연구|과학|관측|조립|수리|작업|가마|송출|암실/],
  ['gallery', /전시|미술|진열|수장|로비|상영|매표|대회/],
  ['attic', /다락|옥탑|헛간|종탑|시계탑|옥상/],
  ['classroom', /교실|교무|동아리|어린이|체험|준비|체육|방송/],
  ['cafe', /카페|계산|매점|매장|가게|카운터|시식|대여/],
  ['storage', /창고|보관|차고|기계|전기|장비|지하|분실물|분류|포장|세탁|건조/],
  ['music', /노래|음악|악기|연습|스튜디오|오락|게임/],
  ['office', /사무|관리|직원|역무|회의|원장|회장|창구|편집|접수|경비|사장|구청|구조대/],
  ['study', /서재|열람|자료|기록|도서|사서/],
  ['bedroom', /침실|숙소|대기|거실|방$/],
  ['pantry', /탕비|부엌|주방|취사|식당|반죽|냉장|세척/],
];
// 같은 방이 그림 두 장인 경우(앞의 것이 기본)
export const ROOM_TWINS: Partial<Record<RoomKey, RoomKey>> = { office: 'office2', music: 'music2', bedroom: 'bedroom2', storage: 'storage2' };
export function roomByName(name: string): RoomKey | null {
  return ROOM_BY_NAME.find(([, re]) => re.test(name))?.[0] ?? null;
}
export const roomSrc = (key: RoomKey) => `/case/room/${key}.webp?v=2`;
export const hotspot = (room: RoomKey, id: string) => ROOMS[room].spots.find((s) => s.id === id) ?? null;
