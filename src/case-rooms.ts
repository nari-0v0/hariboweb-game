// 사건파일 방 그림(나리님이 그린 방 6장, public/case/room/<방>.webp) 속 물건 자리.
// 그림 한 장에 물건이 다 그려져 있고, 사건은 이 자리들만 써요. 위치는 그림 기준 %(가로 x, 세로 y는 가운데, w·h는 크기).
// tag: door 문 · lock 잠글 수 있는 곳 · clock 시계 · wall 글씨·그림을 붙일 수 있는 곳
// tool: 도구를 써야 하는 곳(dark 깜깜함 · deep 깊음 · high 높음 · tiny 깨알 글씨 · soil 굳은 흙 · keyhole 특이한 열쇠 구멍)
// rid: 이 물건이 답인 수수께끼, face: 시계 판 [가운데 x, 가운데 y, 반지름(가로 %)] 과 판 색

export type RoomKey = 'office' | 'music' | 'bedroom' | 'storage' | 'study' | 'pantry' | 'dressing' | 'lab' | 'gallery' | 'attic' | 'cafe' | 'classroom';
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

export const ROOMS: Record<RoomKey, Room> = {
  office: {
    key: 'office',
    people: [[24, 82], [78, 80], [88, 84]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 7, y: 50, w: 13, h: 60, tag: ['door'] },
      { id: 'cab1', label: '서류함 맨 윗칸', at: '서류함 맨 윗칸 안에', x: 21, y: 37, w: 12, h: 9, tag: ['lock'], tool: ['high'] },
      { id: 'cab2', label: '서류함 가운데 칸', at: '서류함 가운데 칸 안에', x: 21, y: 47, w: 12, h: 9, tag: ['lock'] },
      { id: 'cab3', label: '서류함 아랫칸', at: '서류함 아랫칸 안에', x: 21, y: 57, w: 12, h: 9, tag: ['lock'], tool: ['dark'] },
      { id: 'plant', label: '화분', at: '화분 흙 위에', x: 33, y: 53, w: 10, h: 24, rid: R_PLANT, tool: ['soil'] },
      { id: 'board', label: '코르크 게시판', at: '코르크 게시판에', x: 50, y: 21, w: 21, h: 21, tag: ['wall'], tool: ['tiny'] },
      { id: 'pc', label: '컴퓨터', at: '컴퓨터 화면에', x: 50, y: 42, w: 13, h: 15, tag: ['wall'], rid: '마우스가 있지만 치즈는 안 먹어요.' },
      { id: 'mug', label: '머그컵', at: '머그컵 밑에', x: 61, y: 47, w: 7, h: 8, tool: ['deep'] },
      { id: 'deskL', label: '책상 왼쪽 서랍', at: '책상 왼쪽 서랍 안에', x: 42, y: 60, w: 8, h: 11, tag: ['lock'] },
      { id: 'deskR', label: '책상 오른쪽 서랍', at: '책상 오른쪽 서랍 안에', x: 64, y: 60, w: 8, h: 11, tag: ['lock'], tool: ['dark'] },
      { id: 'chair', label: '의자', at: '의자 방석 밑에', x: 53, y: 63, w: 10, h: 20, rid: R_CHAIR },
      { id: 'clock', label: '벽시계', at: '벽시계 뒤에', x: 73, y: 22, w: 12, h: 18, tag: ['clock'], tool: ['high'], rid: R_CLOCK, face: [73, 22.3, 4.1, '#fee3c1'] },
      { id: 'safe', label: '금고', at: '금고 안에', x: 77, y: 56, w: 12, h: 18, tag: ['lock'], tool: ['keyhole'] },
      { id: 'rack', label: '옷걸이 우산', at: '옷걸이에 걸린 우산 속에', x: 89, y: 46, w: 10, h: 48, rid: '비 오는 날에만 활짝 펴요.' },
      { id: 'rug', label: '러그', at: '러그 밑에', x: 50, y: 84, w: 40, h: 17, rid: R_RUG },
    ],
  },
  music: {
    key: 'music',
    people: [[22, 84], [80, 82], [90, 86]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 7, y: 50, w: 13, h: 60, tag: ['door'] },
      { id: 'metro', label: '메트로놈', at: '메트로놈 밑에', x: 25, y: 29, w: 8, h: 13, tool: ['high'], rid: '쉬지 않고 고개를 흔들며 박자만 세요.' },
      { id: 'piano', label: '피아노', at: '피아노 건반 뚜껑 안에', x: 27, y: 48, w: 24, h: 16, rid: '이는 많은데 아무것도 못 씹어요.' },
      { id: 'pianoLow', label: '피아노 아래 덮개', at: '피아노 아래 덮개 안에', x: 27, y: 61, w: 22, h: 10, tag: ['lock'], tool: ['dark'] },
      { id: 'stand', label: '악보대', at: '악보대 위 악보에', x: 49, y: 43, w: 13, h: 14, tag: ['wall'], tool: ['tiny'] },
      { id: 'guitar', label: '기타', at: '기타 울림 구멍 속에', x: 64, y: 50, w: 10, h: 28, tool: ['deep'], rid: '줄이 여섯 개인데 줄넘기는 못 해요.' },
      { id: 'clock', label: '벽시계', at: '벽시계 뒤에', x: 72.5, y: 22, w: 11, h: 17, tag: ['clock'], rid: R_CLOCK, face: [72.5, 22.2, 3, '#fddcbc'] },
      { id: 'poster', label: '음악 포스터', at: '음악 포스터에', x: 85, y: 27, w: 11, h: 21, tag: ['wall'], tool: ['tiny'] },
      { id: 'drum', label: '북', at: '북 속에', x: 78, y: 61, w: 12, h: 15, tag: ['lock'], rid: '맞을수록 신나서 소리를 질러요.' },
      { id: 'plant', label: '화분', at: '화분 흙 위에', x: 90, y: 53, w: 11, h: 22, rid: R_PLANT, tool: ['soil'] },
      { id: 'gcase', label: '기타 케이스', at: '기타 케이스 안에', x: 50, y: 75, w: 24, h: 12, tag: ['lock'], tool: ['keyhole'] },
      { id: 'floor', label: '삐걱거리는 마룻바닥', at: '삐걱거리는 마루 틈에', x: 20, y: 86, w: 18, h: 11, tool: ['dark'] },
    ],
  },
  bedroom: {
    key: 'bedroom',
    people: [[30, 84], [62, 86], [92, 84]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 7, y: 50, w: 13, h: 60, tag: ['door'] },
      { id: 'ward', label: '옷장', at: '옷장 안에', x: 24, y: 36, w: 17, h: 26, tag: ['lock'], tool: ['high'] },
      { id: 'wardLow', label: '옷장 아래 서랍', at: '옷장 아래 서랍 안에', x: 24, y: 57, w: 16, h: 7, tag: ['lock'] },
      { id: 'window', label: '창문', at: '창틀에', x: 49, y: 24, w: 16, h: 25, tag: ['wall'], rid: R_WINDOW },
      { id: 'teddy', label: '곰 인형', at: '곰 인형 리본 밑에', x: 41, y: 56, w: 10, h: 18, rid: '솜으로 배가 꽉 찼는데 배고픈 적이 없어요.' },
      { id: 'lamp', label: '스탠드', at: '스탠드 갓 안쪽에', x: 54, y: 44, w: 8, h: 13, rid: R_LAMP },
      { id: 'alarm', label: '자명종', at: '자명종 밑에', x: 62, y: 46, w: 6, h: 9, tag: ['clock'], rid: '아침마다 소리를 질러도 혼나지 않아요.', face: [62.1, 47.7, 1.5, '#fde3c4'] },
      { id: 'night', label: '협탁 서랍', at: '협탁 서랍 안에', x: 58, y: 61, w: 13, h: 12, tag: ['lock'], tool: ['dark'] },
      { id: 'cal', label: '달력', at: '달력에', x: 77, y: 22, w: 11, h: 17, tag: ['wall'], tool: ['tiny'], rid: '날마다 한 장씩 얇아져요.' },
      { id: 'bed', label: '침대', at: '베개 밑에', x: 82, y: 57, w: 27, h: 28, tool: ['dark'], rid: '밤마다 머리를 받쳐 주고 꿈 이야기를 제일 먼저 들어요.' },
      { id: 'rug', label: '러그', at: '러그 밑에', x: 41, y: 81, w: 36, h: 16, rid: R_RUG },
      { id: 'jewel', label: '보석함', at: '보석함 안에', x: 70, y: 81, w: 10, h: 12, tag: ['lock'], tool: ['keyhole'] },
    ],
  },
  storage: {
    key: 'storage',
    people: [[12, 84], [52, 86], [90, 84]],
    spots: [
      { id: 'door', label: '철문', at: '철문 틈에', x: 7, y: 48, w: 14, h: 54, tag: ['door'] },
      { id: 'web', label: '거미줄 구석', at: '거미줄 사이에', x: 17, y: 10, w: 10, h: 10, tool: ['high'] },
      { id: 'box1', label: '맨 위 상자', at: '맨 위 상자 안에', x: 23, y: 40, w: 9, h: 8, tool: ['high'] },
      { id: 'box2', label: '가운데 상자', at: '가운데 상자 안에', x: 24, y: 48, w: 12, h: 8 },
      { id: 'box3', label: '맨 아래 상자', at: '맨 아래 상자 안에', x: 24, y: 57, w: 15, h: 10, tool: ['dark'] },
      { id: 'bulb', label: '전구', at: '전구 갓 안쪽에', x: 50, y: 17, w: 7, h: 14, tag: ['wall'], rid: R_LAMP },
      { id: 'fuse', label: '두꺼비집', at: '두꺼비집 안에', x: 73, y: 24, w: 10, h: 13, tag: ['lock', 'wall'], tool: ['tiny'] },
      { id: 'chest', label: '보물 상자', at: '보물 상자 안에', x: 46, y: 54, w: 15, h: 18, tag: ['lock'], tool: ['keyhole'] },
      { id: 'robot', label: '고장 난 로봇', at: '로봇 등 뚜껑 안에', x: 59, y: 53, w: 10, h: 18, tool: ['dark'], rid: '말은 하는데 숨은 안 쉬어요.' },
      { id: 'ladder', label: '사다리', at: '사다리 맨 위 칸에', x: 77, y: 48, w: 10, h: 30, rid: '올라갈 때도 내려올 때도 나를 밟아요.' },
      { id: 'broom', label: '빗자루', at: '빗자루 솔 사이에', x: 88, y: 50, w: 9, h: 33, rid: R_BROOM },
      { id: 'toolbox', label: '공구함', at: '공구함 안에', x: 33, y: 79, w: 18, h: 15, tag: ['lock'] },
      { id: 'suit', label: '여행 가방', at: '여행 가방 안에', x: 68, y: 78, w: 18, h: 18, tag: ['lock'], tool: ['deep'] },
    ],
  },
  study: {
    key: 'study',
    people: [[22, 84], [80, 84], [92, 80]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 7, y: 50, w: 13, h: 60, tag: ['door'] },
      { id: 'shelfTop', label: '책장 맨 윗칸 화분', at: '책장 맨 윗칸 화분 속에', x: 24, y: 29, w: 14, h: 10, tool: ['high', 'soil'] },
      { id: 'books', label: '책장', at: '책장의 책 사이에', x: 24, y: 43, w: 14, h: 15, rid: '펼치면 이야기를 하지만 입은 없어요.' },
      { id: 'shelfBox', label: '책장 아래 상자', at: '책장 아래 상자 안에', x: 24, y: 59, w: 9, h: 7, tag: ['lock'], tool: ['dark'] },
      { id: 'window', label: '창문', at: '창틀에', x: 49, y: 24, w: 16, h: 25, tag: ['wall'], rid: R_WINDOW },
      { id: 'candle', label: '촛불', at: '촛대 밑에', x: 39, y: 46, w: 5, h: 11, rid: '키가 클 때 가장 어리고, 늙을수록 작아져요.' },
      { id: 'book', label: '펼친 책', at: '펼친 책장에', x: 48, y: 49, w: 9, h: 6, tag: ['wall'], tool: ['tiny'] },
      { id: 'globe', label: '지구본', at: '지구본 받침 밑에', x: 55, y: 44, w: 7, h: 13, rid: '세상을 다 품었는데 손바닥만 해요.' },
      { id: 'deskDr', label: '책상 서랍', at: '책상 서랍 안에', x: 39, y: 57, w: 8, h: 6, tag: ['lock'] },
      { id: 'chair', label: '의자', at: '의자 방석 밑에', x: 48, y: 64, w: 9, h: 18, rid: R_CHAIR },
      { id: 'clock', label: '괘종시계', at: '괘종시계 뒤에', x: 70, y: 21, w: 9, h: 22, tag: ['clock'], tool: ['high'], rid: R_CLOCK, face: [70, 22.95, 3, '#fee2c0'] },
      { id: 'frame', label: '풍경화 액자', at: '풍경화 액자 뒤에', x: 85, y: 24, w: 14, h: 17, tag: ['wall'], tool: ['tiny'] },
      { id: 'fish', label: '어항', at: '어항 바닥 돌 틈에', x: 69, y: 45, w: 9, h: 11, tool: ['deep'], rid: '물속 친구가 사는 투명한 집이에요.' },
      { id: 'cab', label: '자물쇠 서랍장', at: '자물쇠 서랍장 안에', x: 69, y: 58, w: 11, h: 14, tag: ['lock'], tool: ['keyhole'] },
      { id: 'arm', label: '안락의자', at: '안락의자 쿠션 밑에', x: 86, y: 57, w: 17, h: 26 },
      { id: 'rug', label: '러그', at: '러그 밑에', x: 48, y: 83, w: 38, h: 18, rid: R_RUG },
    ],
  },
  pantry: {
    key: 'pantry',
    people: [[30, 84], [60, 86], [86, 82]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 7, y: 50, w: 13, h: 60, tag: ['door'] },
      { id: 'freezer', label: '냉동실', at: '냉동실 안에', x: 24, y: 31, w: 15, h: 18, tag: ['lock'] },
      { id: 'fridge', label: '냉장고', at: '냉장고 안에', x: 24, y: 53, w: 15, h: 22, tag: ['lock'], tool: ['deep'], rid: '속은 늘 차가운데 다들 나를 반가워해요.' },
      { id: 'jar1', label: '딸기잼 병', at: '딸기잼 병 뚜껑 밑에', x: 37.5, y: 13, w: 6, h: 9, tool: ['high'] },
      { id: 'jar2', label: '오렌지잼 병', at: '오렌지잼 병 뚜껑 밑에', x: 44.5, y: 13, w: 6, h: 9, tool: ['high'] },
      { id: 'jar3', label: '키위잼 병', at: '키위잼 병 뚜껑 밑에', x: 51.5, y: 13, w: 6, h: 9, tool: ['high'] },
      { id: 'jar4', label: '귤잼 병', at: '귤잼 병 뚜껑 밑에', x: 41, y: 26, w: 6, h: 8 },
      { id: 'jar5', label: '포도잼 병', at: '포도잼 병 뚜껑 밑에', x: 48, y: 26, w: 6, h: 8 },
      { id: 'kettle', label: '주전자', at: '주전자 뚜껑 안에', x: 41, y: 41, w: 10, h: 11, rid: '화가 나면 머리에서 김이 나요.' },
      { id: 'oven', label: '오븐', at: '오븐 안에', x: 42, y: 59, w: 14, h: 12, tag: ['lock'], tool: ['dark'] },
      { id: 'crate', label: '나무 상자', at: '나무 상자 바닥에', x: 59, y: 58, w: 14, h: 17, tool: ['dark'] },
      { id: 'basket', label: '과일 바구니', at: '과일 바구니 속에', x: 75, y: 56, w: 13, h: 20, rid: '사과·바나나·포도가 한 지붕 아래 살아요.' },
      { id: 'clock', label: '벽시계', at: '벽시계 뒤에', x: 65.5, y: 21, w: 11, h: 18, tag: ['clock'], tool: ['high'], rid: R_CLOCK, face: [65.5, 21.8, 3.5, '#fee7c5'] },
      { id: 'menu', label: '메뉴판', at: '메뉴판에', x: 82, y: 23, w: 14, h: 18, tag: ['wall'], tool: ['tiny'] },
      { id: 'broom', label: '빗자루', at: '빗자루 솔 사이에', x: 89, y: 52, w: 9, h: 33, rid: R_BROOM },
    ],
  },
  dressing: {
    key: 'dressing',
    people: [[30, 82], [62, 84], [86, 82]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 4, y: 45, w: 8, h: 50, tag: ['door'] },
      { id: 'hat', label: '모자걸이', at: '걸린 모자 속에', x: 17, y: 44, w: 14, h: 45, tool: ['high'], rid: '옷은 안 입었는데 모자는 여러 개 썼어요.' },
      { id: 'mirror', label: '조명 거울', at: '거울 테두리에', x: 34.5, y: 34, w: 17, h: 24, tag: ['wall'], tool: ['tiny'], rid: R_MIRROR },
      { id: 'makeup', label: '화장품', at: '화장품 통 속에', x: 28, y: 45, w: 10, h: 7, tool: ['deep'] },
      { id: 'flowers', label: '꽃병', at: '꽃병 속에', x: 43, y: 44, w: 7, h: 12, rid: R_FLOWER },
      { id: 'vanL', label: '화장대 왼쪽 서랍', at: '화장대 왼쪽 서랍 안에', x: 26, y: 56, w: 7, h: 12, tag: ['lock'] },
      { id: 'vanR', label: '화장대 오른쪽 서랍', at: '화장대 오른쪽 서랍 안에', x: 43, y: 56, w: 7, h: 12, tag: ['lock'], tool: ['dark'] },
      { id: 'stool', label: '둥근 의자', at: '둥근 의자 방석 밑에', x: 34.5, y: 59, w: 9, h: 10, rid: R_CHAIR },
      { id: 'clock', label: '벽시계', at: '벽시계 뒤에', x: 65.5, y: 17, w: 10, h: 15, tag: ['clock'], tool: ['high'], rid: R_CLOCK, face: [65.5, 17.5, 3.6, '#fdd3b4'] },
      { id: 'rack', label: '의상 행거', at: '무대 의상 주머니 속에', x: 60, y: 45, w: 22, h: 32, rid: '옷은 잔뜩 걸쳤는데 한 벌도 안 입어요.' },
      { id: 'trunk', label: '의상 트렁크', at: '의상 트렁크 안에', x: 77, y: 56, w: 11, h: 15, tag: ['lock'], tool: ['keyhole'] },
      { id: 'screen', label: '칸막이', at: '칸막이 뒤에', x: 90, y: 46, w: 18, h: 40, tool: ['dark'] },
      { id: 'floor', label: '마룻바닥', at: '마루 틈에', x: 50, y: 85, w: 30, h: 12, tool: ['dark'] },
    ],
  },
  lab: {
    key: 'lab',
    people: [[26, 84], [60, 86], [86, 84]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 4, y: 50, w: 8, h: 55, tag: ['door'] },
      { id: 'window', label: '창문', at: '창틀에', x: 17, y: 22, w: 15, h: 22, tag: ['wall'], rid: R_WINDOW },
      { id: 'chart', label: '괘도', at: '괘도에', x: 43, y: 24, w: 21, h: 20, tag: ['wall'], tool: ['tiny'] },
      { id: 'clock', label: '벽시계', at: '벽시계 뒤에', x: 63, y: 20, w: 10, h: 15, tag: ['clock'], tool: ['high'], rid: R_CLOCK, face: [63, 19.8, 4, '#fddabd'] },
      { id: 'ext', label: '소화기', at: '소화기 받침에', x: 74, y: 23, w: 6, h: 17, rid: '불을 보면 하얀 숨을 내뿜어요.' },
      { id: 'flasks', label: '플라스크', at: '플라스크 바닥에', x: 20, y: 46, w: 17, h: 11, tool: ['deep'] },
      { id: 'tubes', label: '시험관 꽂이', at: '시험관 꽂이 밑에', x: 33.5, y: 47, w: 10, h: 9 },
      { id: 'micro', label: '현미경', at: '현미경 받침 유리에', x: 44, y: 45, w: 9, h: 15, tool: ['tiny'], rid: '작은 것을 크게 보여 주는 커다란 눈이에요.' },
      { id: 'drawers', label: '실험대 서랍', at: '실험대 서랍 안에', x: 18, y: 61, w: 11, h: 17, tag: ['lock'] },
      { id: 'stool', label: '둥근 의자', at: '둥근 의자 밑에', x: 36, y: 64, w: 9, h: 15, rid: R_CHAIR },
      { id: 'sink', label: '개수대', at: '개수대 배수구 속에', x: 58.5, y: 51, w: 15, h: 10, tool: ['deep'] },
      { id: 'sinkCab', label: '개수대 아래 문', at: '개수대 아래 칸 안에', x: 58.5, y: 63, w: 14, h: 12, tag: ['lock'], tool: ['dark'] },
      { id: 'skel', label: '해골 모형', at: '해골 모형 갈비뼈 사이에', x: 72, y: 51, w: 9, h: 33, rid: '뼈만 남았지만 늘 웃고 있어요.' },
      { id: 'locker', label: '철제 사물함', at: '철제 사물함 안에', x: 87, y: 49, w: 17, h: 42, tag: ['lock'], tool: ['keyhole'] },
    ],
  },
  gallery: {
    key: 'gallery',
    people: [[30, 84], [56, 86], [84, 84]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 5.5, y: 50, w: 10, h: 42, tag: ['door'] },
      { id: 'window', label: '창문', at: '창틀에', x: 7, y: 12, w: 12, h: 22, tag: ['wall'], tool: ['high'], rid: R_WINDOW },
      { id: 'bust', label: '흉상', at: '흉상 뒤통수에', x: 19.5, y: 44, w: 10, h: 20, rid: '머리와 어깨만 있는데 늘 차분해요.' },
      { id: 'pedestal', label: '흉상 받침대', at: '받침대 안에', x: 20, y: 62, w: 10, h: 16, tag: ['lock'] },
      { id: 'p1', label: '노을 그림', at: '노을 그림 액자 뒤에', x: 32.5, y: 27, w: 15, h: 22, tag: ['wall'], tool: ['tiny'] },
      { id: 'p2', label: '꽃 그림', at: '꽃 그림 액자 뒤에', x: 50.5, y: 25, w: 16, h: 27, tag: ['wall'], tool: ['tiny'] },
      { id: 'p3', label: '성 그림', at: '성 그림 액자 뒤에', x: 68, y: 27, w: 14, h: 22, tag: ['wall'] },
      { id: 'clock', label: '괘종시계', at: '괘종시계 뒤에', x: 86.5, y: 24, w: 9, h: 23, tag: ['clock'], tool: ['high'], rid: R_CLOCK, face: [86.9, 20.7, 3, '#fdcaa3'] },
      { id: 'case', label: '유리 진열장', at: '유리 진열장 안에', x: 41, y: 50, w: 13, h: 17, tag: ['lock'], tool: ['keyhole'] },
      { id: 'rope', label: '빨간 줄', at: '빨간 줄 기둥 밑에', x: 41, y: 64, w: 26, h: 10, rid: '사람들 앞을 막아도 아무도 화내지 않아요.' },
      { id: 'bench', label: '벤치', at: '벤치 밑에', x: 65, y: 64, w: 18, h: 11, tool: ['dark'], rid: '네 다리로 서서 지친 다리를 쉬게 해 줘요.' },
      { id: 'box', label: '기부함', at: '기부함 안에', x: 80.5, y: 62, w: 9, h: 18, tag: ['lock'] },
      { id: 'plant', label: '화분', at: '화분 흙 위에', x: 91, y: 55, w: 12, h: 33, tool: ['soil'], rid: R_PLANT },
    ],
  },
  attic: {
    key: 'attic',
    people: [[30, 84], [56, 86], [84, 84]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 6.5, y: 48, w: 11, h: 58, tag: ['door'] },
      { id: 'beam', label: '천장 들보', at: '천장 들보 위에', x: 50, y: 5, w: 60, h: 8, tool: ['high'] },
      { id: 'lantern', label: '랜턴', at: '랜턴 안에', x: 28.5, y: 20, w: 6, h: 17, tool: ['high'], rid: R_LAMP },
      { id: 'window', label: '둥근 창문', at: '둥근 창틀에', x: 47.5, y: 25, w: 25, h: 33, tag: ['wall'], rid: R_WINDOW },
      { id: 'clock', label: '벽시계', at: '벽시계 뒤에', x: 67, y: 24, w: 7, h: 17, tag: ['clock'], rid: R_CLOCK, face: [67.1, 20.7, 2.4, '#f9d9b0'] },
      { id: 'web', label: '거미줄', at: '거미줄 사이에', x: 86, y: 20, w: 16, h: 25, tool: ['high'] },
      { id: 'rock', label: '흔들의자', at: '흔들의자 담요 밑에', x: 25, y: 56, w: 19, h: 30, rid: '앉으면 저 혼자 앞뒤로 흔들흔들해요.' },
      { id: 'trunk', label: '낡은 트렁크', at: '낡은 트렁크 안에', x: 45.5, y: 61, w: 19, h: 18, tag: ['lock'], tool: ['keyhole'] },
      { id: 'books', label: '책 더미', at: '책 더미 사이에', x: 61, y: 62, w: 9, h: 16, tool: ['tiny'], rid: R_BOOK },
      { id: 'mirror', label: '전신 거울', at: '거울 뒷면에', x: 74, y: 50, w: 13, h: 37, tag: ['wall'], rid: R_MIRROR },
      { id: 'horse', label: '흔들 목마', at: '목마 안장 밑에', x: 89, y: 62, w: 16, h: 22, rid: '등에 태워 주지만 한 걸음도 안 가요.' },
      { id: 'floor', label: '마루 뚜껑', at: '마루 뚜껑 밑에', x: 50, y: 86, w: 30, h: 12, tag: ['lock'], tool: ['dark'] },
    ],
  },
  cafe: {
    key: 'cafe',
    people: [[30, 84], [56, 86], [82, 84]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 4.5, y: 50, w: 8, h: 46, tag: ['door'] },
      { id: 'window', label: '창문', at: '창틀에', x: 19, y: 14, w: 17, h: 20, tag: ['wall'], rid: R_WINDOW },
      { id: 'jar1', label: '원두 병', at: '원두 병 속에', x: 32, y: 18, w: 4.5, h: 9, tool: ['high', 'deep'] },
      { id: 'jar2', label: '초코볼 병', at: '초코볼 병 속에', x: 36.5, y: 18, w: 4.5, h: 9, tool: ['high'] },
      { id: 'jar3', label: '코코아 가루 병', at: '코코아 가루 병 속에', x: 41, y: 18, w: 4.5, h: 9 },
      { id: 'jar4', label: '쿠키 병', at: '쿠키 병 속에', x: 45.5, y: 18, w: 4.5, h: 9 },
      { id: 'board', label: '칠판 메뉴판', at: '칠판 메뉴판에', x: 63, y: 16, w: 26, h: 23, tag: ['wall'], tool: ['tiny'] },
      { id: 'clock', label: '벽시계', at: '벽시계 뒤에', x: 84.5, y: 19, w: 10, h: 15, tag: ['clock'], tool: ['high'], rid: R_CLOCK, face: [84.8, 19.2, 4, '#fed7b6'] },
      { id: 'coffee', label: '커피 머신', at: '커피 머신 컵 받침에', x: 19, y: 42, w: 12, h: 15, rid: '김을 뿜으며 쓴 것을 만드는데 다들 좋아해요.' },
      { id: 'register', label: '계산기', at: '계산기 돈 서랍 안에', x: 34, y: 44, w: 9, h: 12, tag: ['lock'] },
      { id: 'counterL', label: '카운터 수납장', at: '카운터 수납장 안에', x: 17, y: 59, w: 16, h: 14, tool: ['dark'] },
      { id: 'box', label: '카운터 밑 상자', at: '카운터 밑 상자 안에', x: 33.5, y: 60, w: 9, h: 11, tag: ['lock'], tool: ['keyhole'] },
      { id: 'cake', label: '케이크 진열장', at: '케이크 진열장 안에', x: 52, y: 47, w: 22, h: 23, tag: ['lock'], rid: '달콤한 것들이 유리 집에서 구경거리가 돼요.' },
      { id: 'table', label: '테이블 꽃병', at: '꽃병 밑에', x: 77.5, y: 43, w: 9, h: 12, rid: R_FLOWER },
      { id: 'chair', label: '의자', at: '의자 방석 밑에', x: 69, y: 57, w: 8, h: 18, rid: R_CHAIR },
      { id: 'plant', label: '화분', at: '화분 흙 위에', x: 94, y: 48, w: 9, h: 32, tool: ['soil'], rid: R_PLANT },
    ],
  },
  classroom: {
    key: 'classroom',
    people: [[52, 86], [12, 84], [92, 86]],
    spots: [
      { id: 'door', label: '문', at: '문틈에', x: 6, y: 51, w: 9, h: 46, tag: ['door'] },
      { id: 'window', label: '창문', at: '창틀에', x: 8, y: 11, w: 9, h: 19, tag: ['wall'], tool: ['high'] },
      { id: 'map', label: '세계 지도', at: '세계 지도에', x: 26.5, y: 25, w: 15, h: 16, tag: ['wall'], tool: ['tiny'] },
      { id: 'globe', label: '지구본', at: '지구본 받침 밑에', x: 25, y: 39, w: 7, h: 12, rid: '세상을 다 품었는데 손바닥만 해요.' },
      { id: 'shelf', label: '책장', at: '책장의 책 사이에', x: 25, y: 55, w: 15, h: 18, rid: R_BOOK },
      { id: 'board', label: '칠판', at: '칠판에', x: 55, y: 34, w: 37, h: 26, tag: ['wall'] },
      { id: 'clock', label: '벽시계', at: '벽시계 뒤에', x: 83.3, y: 18, w: 10, h: 15, tag: ['clock'], tool: ['high'], rid: R_CLOCK, face: [83.3, 19.3, 4, '#fdddbc'] },
      { id: 'desk', label: '교탁', at: '교탁 서랍 안에', x: 52.5, y: 64, w: 26, h: 16, tag: ['lock'], tool: ['dark'] },
      { id: 'bell', label: '종', at: '종 밑에', x: 61, y: 54, w: 5, h: 6, rid: '머리를 두드리면 딩동 하고 모두를 불러요.' },
      { id: 'tchair', label: '선생님 의자', at: '선생님 의자 등받이에', x: 52.5, y: 51, w: 9, h: 7, rid: R_CHAIR },
      { id: 'cab', label: '잠긴 교구장', at: '교구장 안에', x: 83, y: 50, w: 14, h: 31, tag: ['lock'], tool: ['keyhole'] },
      { id: 'bin', label: '휴지통', at: '휴지통 바닥에', x: 94, y: 61, w: 7, h: 11, tool: ['deep'], rid: '버린 것만 먹고도 배가 불러요.' },
      { id: 'd1', label: '앞자리 책상', at: '책상 서랍 속에', x: 26, y: 76, w: 21, h: 20 },
      { id: 'd2', label: '뒷자리 책상', at: '책상 서랍 속에', x: 79, y: 76, w: 21, h: 20 },
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
  ['music', /음악|악기|연습|스튜디오|오락|게임/],
  ['office', /사무|관리|직원|역무|회의|원장|회장|창구|편집|접수|경비|사장|구청|구조대/],
  ['study', /서재|열람|자료|기록|도서|사서/],
  ['bedroom', /침실|숙소|대기|거실|방$/],
  ['pantry', /탕비|부엌|주방|취사|식당|반죽|냉장|세척/],
];
export function roomByName(name: string): RoomKey | null {
  return ROOM_BY_NAME.find(([, re]) => re.test(name))?.[0] ?? null;
}
export const roomSrc = (key: RoomKey) => `/case/room/${key}.webp`;
export const hotspot = (room: RoomKey, id: string) => ROOMS[room].spots.find((s) => s.id === id) ?? null;
