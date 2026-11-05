// v1 원고. 정답과 근거는 함께 관리하며, 멤버는 조력자로만 출연합니다.
export type Mark = Record<string, string>;
export type Investigation = { id: string; label: string; text: string; grant?: Mark; need?: string };
export type StoryCase = {
  id: string; title: string; intro: string; dialogue: string[]; clues: Investigation[];
  answers: string[]; correct: number; evidence: string[]; ending: string;
  extra?: { need: string; text: string }; grant?: Mark;
};
export const STORY_CASES: StoryCase[] = [
  {
    id: 'jelly500', title: '사라진 젤리 500개',
    intro: '오후 9시 15분, 창고의 젤리 500개가 사라졌다. 문은 멀쩡하고 바닥에는 하얀 가루가 남았다. 도난일까, 기록의 빈틈일까?',
    dialogue: ['{a}: 나는 음성방에 있었어. 시간을 확인하는 걸 도와줄게.', '{b}: 주방에서는 케이크를 만들고 있었어. 이 가루와 비교해 볼래?', '가상 행사 요정 포포: 카드키는 내가 빌렸어. 아직 공개 못 한 준비가 있어서…'],
    clues: [
      { id: 'powder', label: '창고의 하얀 가루', text: '주방의 설탕과 같은 가루다. 바퀴 자국이 행사 준비실까지 이어진다.' },
      { id: 'receipt', label: '운반 장부', text: '21:05 포포 / 젤리 500개 / 행사 준비실 임시 이동. 반납 예정 22:00. 승인 도장이 있다.' },
      { id: 'boxes', label: '행사 준비실', text: '봉인된 젤리 500개와 케이크 장식이 있다. 창고 재고표만 아직 갱신되지 않았다.' },
      { id: 'promise', label: '행사 준비를 도와준다', text: '포포: 놀라게 해서 미안해. 다음에는 이동 안내도 붙일게! 작은 행사 리본을 받았다.', grant: { ribbon: '1' } },
    ], answers: ['도난당했고 이미 먹어 버렸다', '행사 준비를 위해 승인받아 옮겼다', '처음부터 젤리는 없었다'], correct: 1,
    evidence: ['receipt', 'boxes'], ending: '탐정: 운반 장부와 실물 수량이 일치해. 도둑은 없었어. 포포는 창고 표지를 고치고 모두에게 깜짝 파티를 열었다.',
    grant: { inventory: '1' },
  },
  {
    id: 'bell0213', title: '새벽 2시 13분의 종소리',
    intro: '잠긴 회관에서 이틀 연속 02:13에 종이 세 번 울렸다. 아무도 들어오지 않았는데 누가 종을 울린 걸까?',
    dialogue: ['{a}: 땡, 땡, 땡! 이틀 모두 같은 소리였어.', '{b}: 2시 10분에는 문이 잠겨 있었어.', '가상 수리 로봇 틱: 시계를 수리한 뒤 시험 설정을 확인하지 못했어.'],
    clues: [
      { id: 'sound', label: '종소리 녹음 분석', text: '이틀의 세 종소리가 파형과 간격까지 완전히 같다. 녹음 재생음이다.' },
      { id: 'alarm', label: '회관 시계 설정', text: '매일 02:13, 시험 녹음 3회 재생. 수리 모드의 예약 알람이 켜져 있다.' },
      { id: 'entry', label: '출입 기록', text: '02:00~02:30 출입은 없다. 창문과 환기구의 봉인도 온전하다.' },
      { id: 'key', label: '시계 밑면까지 살핀다', text: '작은 녹슨 열쇠와 「말하는 상자에게 이름을 물어보세요」라는 표찰을 발견했다.', grant: { rustyKey: '1' } },
    ], answers: ['누군가 회관에 침입했다', '수리 뒤 남은 예약 알람이 울렸다', '바람이 실제 종을 쳤다'], correct: 1,
    evidence: ['sound', 'alarm'], ending: '틱: 시험 알람을 껐어. 오늘부터는 조용할 거야. 탐정은 녹음 파형과 예약 시각을 대조해 유령 소동의 원인을 밝혔다.',
  },
  {
    id: 'crown027', title: '사라진 황금 왕관',
    intro: '전시실 왕관의 별 문양이 사라졌다. 진품을 누가 가져간 걸까? 성급히 사람을 의심하기 전에 물건의 번호부터 살펴보자.',
    dialogue: ['{a}: 오후 5시에는 별 문양을 봤어.', '{b}: 관리 장부를 같이 찾아보자.', '가상 공방 요정 토리: 왕관 수리 의뢰가 왔어. 접수번호로 확인할 수 있어.'],
    clues: [
      { id: 'serial', label: '전시 왕관 안쪽 번호', text: '027-R. 처음 이곳부터 조사했다면 역사 기록의 번호와 직접 대조할 수 있다.' },
      { id: 'ledger', label: '전시실 관리 장부', text: '진품 027 / 전시용 복제품 027-R. 17:20 수리 중 대체 전시 승인.' },
      { id: 'workshop', label: '수리 작업실', text: '17:20 접수한 진품 027이 보관되어 있다. 별 문양과 금이 간 부분이 사진과 일치한다.' },
      { id: 'history', label: '왕관 역사 기록', text: '초대 별빛 탐험대가 왕관을 맡겼다. 뒷면의 별은 길잡이를 뜻한다.', need: 'crownFirst', grant: { crownHistory: '1' } },
    ], answers: ['왕관이 몰래 반출되어 행방을 알 수 없다', '진품은 수리 중이고 복제품이 전시됐다', '왕관의 별이 저절로 사라졌다'], correct: 1,
    evidence: ['serial', 'ledger', 'workshop'], ending: '토리: 대체 전시 표지를 깜빡했네. 탐정: 027과 027-R의 이동 기록이 이어져 있어. 왕관은 안전하게 수리 중이야.',
    extra: { need: 'inventory', text: '지난 젤리 사건의 운반 장부처럼, 이번에도 실물과 이동 기록을 함께 확인했다. 조력자들이 대체 전시 안내를 만들었다.' },
  },
  {
    id: 'invitations', title: '서로 다른 두 장의 초대장',
    intro: '밤 8시 파티인데 북쪽 탑과 남쪽 탑에 따로 모였다. 모두 공식 초대장이라고 한다. 어느 기록이 틀렸을까?',
    dialogue: ['{a}: 내 저장 이미지에는 북쪽 탑이라고 쓰여 있어.', '{b}: 나는 7시에 받은 남쪽 탑 초대장이야.', '가상 행사 요정 포포: 비 예보 때문에 6시 반에 장소를 바꿨어.'],
    clues: [
      { id: 'north', label: '북쪽 초대장 발급 시각', text: '18:00에 저장된 공식 이미지. 장소는 북쪽 탑이다.' },
      { id: 'south', label: '남쪽 초대장 발급 시각', text: '19:00에 발급된 공식 초대장. 장소는 남쪽 탑이다.' },
      { id: 'revision', label: '행사 수정 이력', text: '18:30 장소를 남쪽 탑으로 변경. 기존에 저장한 이미지에는 수정이 반영되지 않는다.' },
      { id: 'gift', label: '북쪽 탑을 추가 조사', text: '회수 대기 중인 선물상자의 인수표를 찾았다. 달빛 마을 보관소에서 받을 수 있다.', grant: { oldInvitation: '1' } },
    ], answers: ['북쪽 초대장은 위조다', '둘 다 진짜지만 발급 시각이 다르다', '두 곳에서 동시에 파티를 연다'], correct: 1,
    evidence: ['north', 'south', 'revision'], ending: '탐정: 발급 시각을 보면 모순이 없어. 포포는 변경 안내를 입구에 붙였고 모두 남쪽 탑에 모였다.',
    extra: { need: 'ribbon', text: '지난 파티에서 받은 리본을 본 포포가 반겼다. 「이번에는 네가 도와준 안내판을 꼭 쓸게!」' },
  },
  {
    id: 'mirror', title: '가짜 하리보',
    intro: '가상 마스코트 하리보와 똑같이 생긴 존재가 회관에 나타났다. 멤버들은 신원 확인을 돕는 조력자다. 두 존재의 기록과 거울을 비교하자.',
    dialogue: ['마스코트 A: 어제 다 같이 별무늬 컵을 만들었잖아!', '마스코트 B: 나도… 음, 그건 기억이 안 나.', '{a}: 새 계정만으로 단정하진 말자. 다른 증거도 필요해.'],
    clues: [
      { id: 'identity', label: '마스코트 신원 기록', text: 'A는 오래된 마스코트 기록, B는 오늘 생성된 임시 기록이다. 이것만으로는 정체를 확정할 수 없다.' },
      { id: 'memory', label: '어제의 공방 기록 대조', text: 'A의 컵 설명이 사진과 같다. B는 공방을 알지 못하고 거울 세계에서 깨어났다고 말한다.' },
      { id: 'reflection', label: '거울 앞에서 확인', text: 'A는 정상적으로 비친다. B의 자리에는 얼굴 대신 보라색 연기와 거울 정령의 문양이 보인다.' },
    ], answers: ['A가 거울 정령이다', 'B가 마스코트를 흉내 낸 거울 정령이다', '멤버 조력자가 변장했다'], correct: 1,
    evidence: ['memory', 'reflection'], ending: '정령: 친구를 사귀고 싶었어. 탐정: 남의 얼굴 대신 네 모습으로 인사하면 돼. 정체를 밝힌 뒤 정령과 앞으로의 약속을 정했다.', grant: { mirrorSolved: '1' },
  },
  {
    id: 'explorer', title: '실종된 탐험가의 암호',
    intro: '가상 탐험가 루미가 돌아오지 않았다. 가방에는 문양 △, ○, □가 왼쪽부터 차례로 그려져 있고 「두 번째, 세 번째, 첫 번째」라는 메모가 있다.',
    dialogue: ['{a}: 루미는 길을 표시할 때 원래 순서도 꼭 남겼어.', '{b}: 북쪽 석문에도 똑같은 세 문양이 있어.', '구조 안내판: 잘못 누르면 문은 초기화된다. 사람을 해치는 장치는 없다.'],
    clues: [
      { id: 'note', label: '가방의 원본 메모', text: '기준 순서 △(첫째), ○(둘째), □(셋째). 입력 지시 2→3→1. 따라서 ○→□→△다.' },
      { id: 'tracks', label: '안개숲 발자국', text: '루미의 등산화 자국이 북쪽 석문으로 이어진다. 문 뒤에서 구조 휘파람이 들린다.' },
      { id: 'door', label: '석문 문양 비교', text: '문 위 기준 배열은 △ ○ □. 메모와 같은 기준이며, 「기준의 두째·세째·첫째를 누르라」고 새겨져 있다.' },
      { id: 'letter', label: '원정에서 읽은 봉인 편지 대조', text: '루미: 문 안의 관측소에서 별빛을 조사하다 문이 닫혔어. 여기서 기다릴게. 구조 신호는 세 번!', need: 'sealedLetter', grant: { explorerTruth: '1' } },
      { id: 'map', label: '가짜 지도와 발자국 비교', text: '지도 속 강은 현재 지형이 아니라 옛 연극 무대의 그림이었다. 판매상은 주운 지도를 진짜로 오해했다. 정정 표지를 보냈다.', need: 'fakeMap', grant: { mapTruth: '1' } },
    ], answers: ['△ → ○ → □', '○ → □ → △', '□ → △ → ○'], correct: 1,
    evidence: ['note', 'door', 'tracks'], ending: '○, □, △. 석문이 열리고 루미가 손을 흔들었다. 루미: 혼자서는 안 열렸는데 고마워! 원정대는 관측소의 안전한 귀환 경로를 함께 기록했다.', grant: { starCode: '1', rescued: '1' },
    extra: { need: 'letterKept', text: '안전하게 보관했던 편지를 루미에게 돌려줬다. 루미: 내 글을 끝까지 지켜줬구나. 다음에는 꼭 함께 떠나자.' },
  },
];

export type StoryOption = { label: string; text: string; hp?: number; tools?: number; time?: number; grant?: Mark; need?: string; role?: string; end?: string; next?: string };
export type StoryEvent = { id: string; title: string; intro: string; dialogue: string; options: StoryOption[]; extra?: { need: string; text: string } };
export const REGIONS = [
  { id: 'mist', name: '안개숲', art: '/char/deco/explorer.png', intro: '숲의 노랫소리와 구조 신호를 따라간다. 길에서 맺은 약속은 다음 탐험에도 남는다.', events: ['fork', 'bag', 'chest', 'mushroom', 'merchant', 'signal'] },
  { id: 'ruins', name: '별빛 유적', art: '/char/deco/star-mage.png', intro: '손잡이 없는 석문과 거꾸로 흐르는 시간이 기다린다. 문양의 기준 순서를 잊지 말자.', events: ['door', 'footprints', 'guardian', 'symbols', 'hourglass', 'letter'] },
  { id: 'village', name: '달빛 마을', art: '/char/deco/fairy.png', intro: '지도의 진실, 작은 정령, 마지막 별빛의 문. 모아 온 기록으로 마을 사람들을 돕는다.', events: ['guards', 'map', 'bottle', 'warehouse', 'companion', 'stargate'] },
] as const;
export const STORY_EVENTS: StoryEvent[] = [
  { id: 'fork', title: '달빛의 갈림길', intro: '물소리, 노랫소리, 발자국 없는 길. 세 갈래 길이 안개 속으로 이어진다.', dialogue: '{a}: 노랫소리는 누가 부르는 걸까?', options: [
    { label: '노랫소리를 따라간다', text: '요정: 발자국 없는 길에는 덫이 있어. 이 노래를 기억해! 요정의 표식을 받았다.', time: 1, grant: { fairySong: '1' } },
    { label: '물소리를 따라간다', text: '깨끗한 샘에서 쉬었다. {a}: 물통도 채웠어. 이제 다시 가자.', hp: 1 },
    { label: '발자국 없는 지름길', text: '빠르게 가방 근처에 도착했다. 하지만 낙엽 밑에 가느다란 줄이 보인다.', grant: { shortcut: '1' } },
  ] },
  { id: 'bag', title: '주인을 잃은 가방', intro: '나무 아래 낡은 가방에서 희미한 빛이 새어 나온다. 이름표에는 가상 탐험가 루미라고 적혀 있다.', dialogue: '{b}: 주인을 찾을 단서부터 확인할까?', extra: { need: 'shortcut', text: '지름길의 줄에 걸려 체력 1을 잃었다. 가방 옆 위험 표지를 세웠다.' }, options: [
    { label: '가방의 구조 일지를 조사', text: '「북쪽 관측소, 신호는 세 번」. 주인의 행적을 기록하고 가방은 표지 옆에 두었다.', grant: { explorerTrail: '1' } },
    { label: '가방을 맡아서 가지고 간다', text: '여분 도구를 빌렸다. 가방을 돌려줄 때 사용한 이유도 설명하기로 했다.', tools: 1, grant: { borrowedBag: '1' } },
    { label: '표지만 남기고 그대로 둔다', text: '분실물 위치를 표시했다. 구조 일지는 확인하지 못했다.' },
  ] },
  { id: 'chest', title: '말하는 보물상자', intro: '상자가 폴짝 뛰었다. 「나를 열려면 먼저 나를 웃겨 봐!」', dialogue: '{c}: 상자도 이름이 있을까?', options: [
    { label: '아주 썰렁한 농담을 한다', text: '상자: 에취! 웃음 대신 먼지가 튀었다. {a}: 다음에는 인사부터 하자.', hp: -1 },
    { label: '상자에게 자기소개를 부탁', text: '상자: 내 이름은 보보! 이름을 물어봐 준 건 처음이야. 별빛 문양을 알려줄게.', grant: { chestFriend: '1', glyph: '1' } },
    { label: '허락 없이 뚜껑을 들어 본다', text: '상자가 달아났다. 떨어진 표찰에 「달빛 마을 보관소」라고 쓰여 있다.', grant: { chestChase: '1' } },
    { label: '녹슨 열쇠를 보여준다', text: '보보: 틱이 보낸 손님이구나! 안쪽 별빛 지도 조각을 가져가도 좋아.', need: 'rustyKey', grant: { mapFragment: '1' } },
  ] },
  { id: 'mushroom', title: '잠자는 거대 버섯', intro: '집채만 한 버섯이 길에서 코를 골고 있다. 옆의 작은 동굴에서는 바람이 분다.', dialogue: '{a}: 깨우기 전에 지나갈 길을 살펴보자.', options: [
    { label: '조용히 옆으로 돌아간다', text: '시간은 걸렸지만 버섯을 깨우지 않고 통과했다.', time: 1 },
    { label: '조심스럽게 깨워 길을 묻는다', text: '버섯: 동굴에는 탐험가가 남긴 표식이 있어. 고개를 숙이면 들어갈 수 있단다.', grant: { cave: '1' } },
    { label: '버섯 위로 올라간다', text: '에취! 낙엽 더미로 날아갔다. 아프지만 숨어 있던 동굴 입구를 발견했다.', hp: -1, grant: { cave: '1' } },
  ] },
  { id: 'merchant', title: '수상한 여행 상인', intro: '낡은 모자를 쓴 가상 상인 모모가 랜턴을 흔든다. 「오늘만 특별 교환!」', dialogue: '{b}: 지금 필요한 물건인지부터 보자.', options: [
    { label: '여분 도구로 랜턴을 교환', text: '랜턴 불빛에 동굴 벽의 구조 표식이 드러났다.', tools: -1, grant: { lantern: '1', explorerTrail: '1' } },
    { label: '협상가가 무료 수리를 부탁', text: '{b}: 고장 난 물건을 고쳐드릴게요. 상인도 우리 도구 하나를 고쳐 주었다.', role: 'talker', tools: 1 },
    { label: '물건 대신 탐험가 이야기를 묻는다', text: '모모: 북쪽에서 세 번의 휘파람을 들었어. 지도에 적어 줄게.', time: 1, grant: { explorerTrail: '1' } },
  ] },
  { id: 'signal', title: '안개 속 구조 신호', intro: '안개 너머에서 세 번의 휘파람, 이어서 「여기 누구 없어요?」라는 목소리가 들린다.', dialogue: '{b}: 서두르되 안전하게 다가가자.', options: [
    { label: '목소리를 향해 달려간다', text: '가시덤불을 지나 루미의 조수 별콩을 구조했다. 별콩: 루미는 유적 관측소에 있어!', hp: -1, grant: { rescued: '1' }, end: 'rescue' },
    { label: '발자국과 신호를 확인하고 구조', text: '세 번의 신호와 발자국이 일치했다. 안전한 길로 별콩을 구하고 관측소의 위치를 받았다.', time: 1, grant: { rescued: '1', explorerTrail: '1' }, end: 'rescue' },
    { label: '위치를 표시하고 구조대에 인계', text: '구조대가 뒤이어 출발했다. 직접 구조는 못 했지만 조난 위치 기록을 전달했다.', grant: { rescuePending: '1' }, end: 'return' },
    { label: '랜턴과 동굴 지도로 우회 구조', text: '동굴로 돌아가 별콩을 안전하게 데려왔다. 별콩은 유적 지도 조각을 건넸다.', need: 'lantern', grant: { rescued: '1', mapFragment: '1' }, end: 'hidden' },
  ] },
  { id: 'door', title: '문고리 없는 문', intro: '석문 한가운데 손바닥 모양 홈이 있다. 옆에는 닳아 버린 세 문양이 보인다.', dialogue: '{c}: 문 주변도 살펴볼까?', options: [
    { label: '손바닥을 홈에 올린다', text: '문은 열렸지만 차가운 마력이 손끝을 찔렀다.', hp: -1 },
    { label: '주변 문양을 조사한다', text: '△ ○ □의 기준 배열과 「둘째, 셋째, 첫째」라는 글을 옮겨 적었다.', time: 1, grant: { glyph: '1' } },
    { label: '옆의 작은 장치를 작동한다', text: '도구로 톱니를 고정하자 옆 통로가 열렸다.', tools: -1, grant: { sidePassage: '1' } },
  ] },
  { id: 'footprints', title: '끝없이 반복되는 발자국', intro: '발자국을 따라갈수록 같은 돌 앞으로 돌아온다. 벽의 그림자는 반대로 움직인다.', dialogue: '{a}: 저 돌에 난 흠집, 아까도 봤어!', options: [
    { label: '벽에 표시를 남긴다', text: '반복 구간을 확인했다. 표시 사이의 틈으로 미로를 빠져나왔다.', time: 1 },
    { label: '발자국을 계속 따라간다', text: '환영 벽에 부딪혔다. 실물이 아닌 발자국이었다.', hp: -1 },
    { label: '발자국 반대 방향으로 이동', text: '그림자 뒤 숨겨진 방에서 유적 지도 조각을 발견했다.', grant: { mapFragment: '1' } },
  ] },
  { id: 'guardian', title: '움직이는 수호 석상', intro: '석상이 눈을 뜬다. 「지식을 나누러 왔는가, 유적을 부수러 왔는가? 목적을 말하라.」', dialogue: '{b}: 싸우기 전에 대화부터 해 보자.', options: [
    { label: '조사하고 기록을 나누러 왔다고 답한다', text: '석상: 그 답이면 충분하다. 통행을 허락한다.', grant: { passage: '1' } },
    { label: '석상을 밀어 통과한다', text: '돌조각에 긁혔다. 경보가 켜져 다음 문으로 갈 때 한 번 더 우회해야 한다.', hp: -2, grant: { alarm: '1' } },
    { label: '발견한 문양 단서를 보여준다', text: '석상: 기준 문양을 읽은 탐험가여, 기록실도 열어 주겠다.', need: 'glyph', grant: { archive: '1' } },
  ] },
  { id: 'symbols', title: '세 개의 문양', intro: '문 위의 기준은 왼쪽부터 △ ○ □. 아래에는 「기준 배열의 두 번째, 세 번째, 첫 번째」라고 적혀 있다.', dialogue: '{a}: 기준 배열과 누르는 순서를 구분하자.', extra: { need: 'starCode', text: '사건파일의 석문과 같은 규칙이다. 메모에 적어 둔 ○→□→△가 떠올랐다.' }, options: [
    { label: '○ → □ → △', text: '별빛 결정이 떠올랐다. 기준 배열과 지시 순서가 정확히 맞았다.', grant: { starCrystal: '1' } },
    { label: '△ → ○ → □', text: '순서가 틀려 문이 초기화됐다. 옆 통로로 돌아가며 기록을 다시 확인했다.', time: 1 },
    { label: '문을 강제로 연다', text: '도구 두 개로 통로는 열었지만 보물방의 안전 잠금은 닫혔다.', tools: -2, grant: { treasureLocked: '1' } },
    { label: '문을 두고 우회한다', text: '옆길로 편지 보관실을 향했다.', time: 1 },
  ] },
  { id: 'hourglass', title: '시간을 되돌리는 모래시계', intro: '푸른 모래가 위로 흐른다. 「다음 길을 바꿀 기회를 주겠다. 지나간 보상은 되돌리지 않는다.」', dialogue: '{c}: 다음 목적지만 바뀌는 거구나.', options: [
    { label: '다음 목적지를 안개숲 구조 지점으로 바꾼다', text: '유적의 마지막 방 대신 안개숲 신호 지점으로 통로가 이어졌다. 이전 선택과 발견은 그대로다.', time: 1, next: 'signal' },
    { label: '모래시계를 조사한다', text: '시간의 파편을 기록했다. 마지막 문에서 시간 장치를 알아볼 수 있을 것 같다.', grant: { timeShard: '1' } },
    { label: '모래시계의 봉인을 부순다', text: '파편에 긁혔지만 편지 보관실의 숨은 통로를 발견했다.', hp: -1, grant: { archive: '1' } },
  ] },
  { id: 'letter', title: '봉인된 편지', intro: '「나를 찾는 사람에게. 아직 돌아가지 못했다면 이 편지를 읽어 줘.」 가상 탐험가 루미의 봉인이 찍혀 있다.', dialogue: '{c}: 편지를 읽거나 봉인을 살펴볼 수 있겠어.', options: [
    { label: '편지를 읽는다', text: '루미는 북쪽 관측소에 있다. 세 번의 구조 신호와 석문 암호도 적혀 있다. 사건파일에서 행적을 대조할 수 있다.', grant: { sealedLetter: '1' }, end: 'discovery' },
    { label: '편지를 안전하게 보관한다', text: '봉인 그대로 챙겼다. 루미를 찾으면 직접 돌려주기로 했다.', grant: { letterKept: '1' }, end: 'return' },
    { label: '봉인 문양을 조사한다', text: '봉인 뒤 작은 지도를 찾았다. 별빛 결정이 있는 관측소의 귀환로다.', grant: { mapFragment: '1' }, end: 'discovery' },
  ] },
  { id: 'guards', title: '수상한 경비병', intro: '가상 경비 인형 둘이 길을 막는다. 「외부인은 통행증을 보여 주세요!」', dialogue: '{a}: 원정 기록으로 신원을 설명할 수 있을까?', extra: { need: 'rescuePending', text: '구조대가 별콩을 무사히 데려왔다는 소식이 도착했다. 직접 구조 기록과는 구분해 인계 일지에 남겼다.' }, options: [
    { label: '구조 성공 기록을 보여준다', text: '경비 인형: 마을의 친구를 도와주셨군요. 특별 통행증을 드립니다.', need: 'rescued', grant: { villagePass: '1' } },
    { label: '도구로 고장 난 검문기를 고쳐 준다', text: '고장 난 검문기를 고치자 임시 출입증이 발급됐다.', tools: -1 },
    { label: '좁은 뒷길로 들어간다', text: '담쟁이에 긁혔지만 골목길에 도착했다.', hp: -1 },
  ] },
  { id: 'map', title: '가짜 지도 판매상', intro: '가상 상인 모모: 「이 지도면 모든 보물을 찾을 수 있어!」 지도에는 마을 한가운데 강이 흐른다.', dialogue: '{b}: 실제로는 이곳에 강이 없는데?', options: [
    { label: '지도를 교환받고 오류를 기록', text: '강이 없다는 점을 확인하고 오류 표시를 남겼다. 사건파일의 탐험가 발자국과 대조할 자료가 생겼다.', tools: -1, grant: { fakeMap: '1' } },
    { label: '실제 지형과 비교한다', text: '존재하지 않는 강과 북쪽 관측소 표식을 발견했다. 원본 출처를 확인할 필요가 있다.', grant: { fakeMap: '1' } },
    { label: '상인에게 출처를 묻는다', text: '모모: 옛 극장 창고에서 주웠어. 진짜 지도인 줄 알았는데… 확인 전에는 판매를 멈출게.', grant: { mapSource: '1' } },
  ] },
  { id: 'bottle', title: '유리병 속 작은 목소리', intro: '유리병 속 보라색 빛이 속삭인다. 「병 뚜껑이 꽉 끼었어. 도와줄래?」', dialogue: '{c}: 정체와 사정을 먼저 들어 보자.', extra: { need: 'spirit=befriend', text: '정령: 어? 그때 도와준 탐정이잖아! 네 모습으로 인사하라는 약속, 기억하고 있어!' }, options: [
    { label: '병을 열고 정령의 부탁을 듣는다', text: '작은 정령이 나왔다. 「남의 얼굴을 쓰지 않을게. 마지막 문에서 빛으로 길을 비춰줄게.」', grant: { spiritHelp: '1' } },
    { label: '먼저 정체를 묻는다', text: '정령: 나는 거울 세계의 작은 빛이야. 얼굴을 빌리는 대신 내 빛으로 친구를 사귀는 중이야.', grant: { mirrorLore: '1' } },
    { label: '가게 주인에게 맡기고 이동', text: '주인이 병을 안전하게 열어주기로 했다. 정령 동행 없이 길을 떠났다.' },
  ] },
  { id: 'warehouse', title: '무너지는 창고', intro: '지붕의 나무가 내려앉는다. 안에서 가상 상인 모모가 구조를 요청한다. 주변 주민들도 달려왔다.', dialogue: '{b}: 혼자 무리하지 말고 방법을 고르자.', options: [
    { label: '직접 들어가 구조한다', text: '모모를 구했다. 팔이 조금 긁혔지만 모두 안전하다. 모모가 마지막 문의 위치를 알려줬다.', hp: -1, grant: { merchantFavor: '1' } },
    { label: '주민들과 함께 구조한다', text: '받침대를 세우고 함께 구했다. 모모: 너희가 서로 돕는 모습, 잊지 않을게.', time: 1, grant: { merchantFavor: '1' } },
    { label: '밧줄을 찾아 지붕을 고정한다', text: '구조용 밧줄로 통로를 고정하고 모모를 구했다. 밧줄은 다음 길에도 쓸 수 있다.', time: 1, grant: { rescueRope: '1', merchantFavor: '1' } },
    { label: '북쪽 탑 선물 인수표로 보관소 장비를 빌린다', text: '인수표를 확인한 주민이 장비 상자를 열었다. 구조를 마친 뒤 잊힌 선물도 전달받았다.', need: 'oldInvitation', grant: { forgottenGift: '1', rescueRope: '1' } },
    { label: '도망간 상자 보보에게 도움을 청한다', text: '보보: 다음엔 허락부터 물어봐! 상자가 받침대가 되어 구조를 도왔다. 서로 사과하고 화해했다.', need: 'chestChase', grant: { chestFriend: '1', merchantFavor: '1' } },
  ] },
  { id: 'companion', title: '나를 아는 수상한 동료', intro: '골목의 거울에 낯선 여행자 모습이 떠올랐다. 「우리 전에 같이 탐험했잖아!」', dialogue: '{a}: 처음 보는 얼굴인데, 기록을 물어볼까?', extra: { need: 'spirit=return', text: '거울 세계로 돌아간 정령이 통신 거울로 인사한다. 이번에는 마을에 직접 나오지 않았다.' }, options: [
    { label: '기억만 믿고 따라간다', text: '출구처럼 보인 곳은 거울 벽이었다. 정령: 미안, 길 장난은 위험했네. 원래 길로 안내할게.', hp: -1 },
    { label: '과거 원정 기록을 물어본다', text: '답변이 일지와 다르다. 정령이 여행자 환영을 거두고 자기 빛으로 인사했다.', grant: { illusionKnown: '1' } },
    { label: '거울 정령인지 직접 묻는다', text: '정령: 맞아, 반가워서 만든 환영이야. 이제는 네가 안 헷갈리게 내 빛으로만 인사할게.', grant: { illusionKnown: '1' } },
  ] },
  { id: 'stargate', title: '마지막 별빛의 문', intro: '거대한 문 아래 작은 글씨가 있다. 「별빛 결정과 길잡이의 도움으로 귀환로를 열어라.」 문을 넘기 전 돌아갈 수도 있다.', dialogue: '{b}: 여기까지 모은 단서로 판단하자. {c}: 돌아가도 우리의 기록은 남아.', options: [
    { label: '도구로 문을 열고 마지막 탐험', text: '경첩을 고정하고 관측소의 귀환로를 확보했다. 별빛 아래 원정대가 함께 걸어 돌아왔다.', tools: -1, end: 'discovery' },
    { label: '문 앞에서 안전하게 귀환', text: '지금까지의 발견을 정리했다. 무리하지 않는 것도 원정대의 선택이다.', end: 'return' },
    { label: '별빛 결정과 정령의 도움으로 숨은 문을 연다', text: '정령의 빛과 별빛 결정이 공명했다. 숨겨진 관측소에서 「별빛의 발견자」 기록을 찾았다!', need: 'starCrystal', end: 'hidden', grant: { starDiscoverer: '1' } },
    { label: '문 주변을 마지막으로 조사', text: '문 주변의 장치와 귀환 경로를 비교했다.', time: 1, end: 'return' },
  ] },
];
export const storyCase = (id: string) => STORY_CASES.find(c => c.id === id);
export const storyEvent = (id: string) => STORY_EVENTS.find(e => e.id === id);
export const region = (id: string) => REGIONS.find(r => r.id === id);
export const meets = (marks: Mark, need?: string) => !need || (need.includes('=') ? marks[need.split('=')[0]!] === need.split('=')[1] : marks[need] === '1');
