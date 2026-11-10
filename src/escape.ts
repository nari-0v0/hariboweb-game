// 하리보 사건파일 (방탈출판): 방 그림 속 물건을 눌러 살피고, 찾은 물건으로 잠긴 곳을 열고,
// 비밀번호를 풀어 단서를 모은 뒤 범인을 맞혀요. 사건 내용은 이 파일에 고정돼 있고, 진행 상태만 DB에 저장해요.
// 등장인물은 모두 가상 인물이에요(실제 멤버와 관계없어요).

import { buildCase } from './escape-gen';
import { STORY_SEEDS } from './escape-stories';

export type Lock = { kind: 'item'; item: string } | { kind: 'code'; code: string; ask: string };
export type EscObject = {
  id: string;
  scene: string;
  name: string;
  emoji: string;
  x: number; // 방 그림 안 가로 위치(%)
  y: number; // 세로 위치(%). 30 이하는 벽, 그 아래는 바닥
  big?: boolean;
  look: string; // 처음 눌렀을 때(잠겨 있으면 잠긴 모습 설명)
  again?: string; // 이미 다 살핀 뒤 다시 눌렀을 때
  lock?: Lock;
  openText?: string; // 열었을 때
  take?: string[]; // 살피거나 열면 가방에 들어오는 물건
  clue?: string | string[]; // 살피거나 열면 수첩에 적히는 단서
  memo?: boolean; // 한 번 살피면 수첩 '메모'에 내용이 남아요(퍼즐 쪽지 등)
  reveals?: string[]; // 열면 새로 보이는 물건
  hidden?: boolean; // 다른 물건을 열어야 보여요
  goto?: string; // 문: 다른 방으로 이동
};
export type EscCase = {
  id: string;
  title: string;
  emoji: string;
  place: string;
  intro: string;
  scenes: { id: string; name: string; wall: string; floor: string }[];
  items: Record<string, { name: string; emoji: string }>;
  clues: Record<string, string>;
  objects: EscObject[];
  question: { text: string; options: string[]; correct: number; needs: string[] };
  more?: { text: string; options: string[]; correct: number }[]; // 함께 맞혀야 하는 질문(어떻게·왜)
  combos?: { a: string; b: string; out: string; text: string }[]; // 가방 속 두 물건 합치기
  level?: number; // 난이도(별 개수)
  solution?: EscAction[]; // 만든 사건의 모범 풀이(테스트용)
  hints: { until: string; text: string }[]; // until = 열린 물건 id 또는 찾은 단서 id
  ending: string;
};

export const ESC_XP = 10; // 사건마다 처음 해결할 때 한 번
export const escJelly = (g: EscGrade) => (g === 'S' || g === 'A' ? 1 : 0);

const HANDMADE: EscCase[] = [
  {
    id: 'jellyjar',
    title: '사라진 젤리 단지',
    emoji: '🍬',
    place: '하리보 회관 탕비실',
    intro: '아침에 와 보니 탕비실 냉장고의 젤리 단지가 텅 비어 있어요. 밤새 문은 잠겨 있었다는데… 방을 뒤져 범인을 찾아 주세요.',
    scenes: [
      { id: 'pantry', name: '탕비실', wall: '#ffe9c7', floor: '#e3b98a' },
      { id: 'storage', name: '창고', wall: '#d9d2c4', floor: '#a88b6c' },
    ],
    items: {
      smallkey: { name: '작은 열쇠', emoji: '🔑' },
      storagekey: { name: '창고 열쇠', emoji: '🗝️' },
      flashlight: { name: '손전등', emoji: '🔦' },
    },
    clues: {
      clock: '벽시계가 3시 40분에 멈춰 있었다.',
      jar: '빈 젤리 단지 둘레에 작은 발자국과 하얀 털이 묻어 있었다.',
      log: '출입 장부: 밤 10시 이후로 아무도 회관에 들어오지 않았다.',
      window: '창고 창문 아래쪽이 고양이 한 마리 지나갈 만큼 열려 있었다.',
      cat: '창고 상자 틈에서 젤리 포장지를 이불처럼 깔고 잠든 하얀 고양이를 찾았다.',
    },
    objects: [
      { id: 'clock', scene: 'pantry', name: '벽시계', emoji: '🕰️', x: 22, y: 12, look: '벽시계가 3시 40분에 멈춰 있어요. 건전지가 다 된 것 같아요.', clue: 'clock' },
      { id: 'board', scene: 'pantry', name: '메모판', emoji: '📋', x: 48, y: 12, look: '메모판에 쪽지가 붙어 있어요. 「냉장고 비밀번호 = 시계가 멈춘 시각 (숫자 4자리)」' },
      {
        id: 'fridge', scene: 'pantry', name: '냉장고', emoji: '🧊', x: 14, y: 52, big: true,
        look: '냉장고 문에 숫자 자물쇠가 달려 있어요.',
        lock: { kind: 'code', code: '0340', ask: '숫자 4자리' },
        openText: '철컥! 냉장고가 열렸어요. 젤리 단지는 텅 비었고, 단지 둘레에 작은 발자국과 하얀 털이 묻어 있어요.',
        again: '텅 빈 젤리 단지뿐이에요.',
        clue: 'jar',
      },
      { id: 'plant', scene: 'pantry', name: '화분', emoji: '🪴', x: 40, y: 70, look: '화분을 살짝 들어 보니… 받침 밑에 작은 열쇠가 숨겨져 있어요!', again: '화분 밑에는 이제 아무것도 없어요.', take: ['smallkey'] },
      {
        id: 'drawer', scene: 'pantry', name: '서랍장', emoji: '🗃️', x: 62, y: 64,
        look: '서랍이 잠겨 있어요. 작은 열쇠 구멍이 보여요.',
        lock: { kind: 'item', item: 'smallkey' },
        openText: '작은 열쇠로 서랍을 열었어요. 창고 열쇠, 손전등, 출입 장부가 들어 있어요.',
        again: '서랍은 비어 있어요.',
        take: ['storagekey', 'flashlight'],
        clue: 'log',
      },
      {
        id: 'door1', scene: 'pantry', name: '창고 문', emoji: '🚪', x: 86, y: 50, big: true,
        look: '창고로 가는 문이 잠겨 있어요.',
        lock: { kind: 'item', item: 'storagekey' },
        openText: '창고 문이 열렸어요! 한 번 더 누르면 들어가요.',
        goto: 'storage',
      },
      { id: 'door2', scene: 'storage', name: '탕비실로', emoji: '🚪', x: 8, y: 50, big: true, look: '탕비실로 돌아가요.', goto: 'pantry' },
      { id: 'window', scene: 'storage', name: '작은 창문', emoji: '🪟', x: 70, y: 12, look: '창문 아래쪽이 살짝 열려 있어요. 사람은 못 지나가도 고양이는 지나갈 만해요.', clue: 'window' },
      {
        id: 'boxes', scene: 'storage', name: '상자 더미', emoji: '📦', x: 52, y: 62, big: true,
        look: '상자 더미 뒤가 너무 깜깜해요. 불빛이 있으면 보일 것 같아요.',
        lock: { kind: 'item', item: 'flashlight' },
        openText: '손전등을 비추자 상자 틈에서 무언가 꿈틀! 젤리 포장지를 이불처럼 깔고 잠든 하얀 고양이예요.',
        again: '고양이가 새근새근 자고 있어요.',
        clue: 'cat',
        reveals: ['cat'],
      },
      { id: 'cat', scene: 'storage', name: '하얀 고양이', emoji: '🐈', x: 76, y: 74, hidden: true, look: '고양이 입가에 젤리 가루가 묻어 있고 배가 빵빵해요. 「냐아…」' },
      { id: 'broom', scene: 'storage', name: '빗자루', emoji: '🧹', x: 30, y: 66, look: '그냥 빗자루예요. 바닥에 하얀 털이 조금 쓸려 있어요.' },
    ],
    question: {
      text: '젤리 단지를 비운 범인은 누구일까요?',
      options: ['야근하다 배고팠던 디자이너', '새벽에 순찰 돈 경비원', '창문으로 드나든 하얀 고양이', '아침 일찍 온 배달 기사'],
      correct: 2,
      needs: ['log', 'jar', 'cat'],
    },
    hints: [
      { until: 'plant', text: '탕비실 바닥에 있는 물건 밑을 살펴보세요.' },
      { until: 'drawer', text: '작은 열쇠로 열 수 있는 가구가 있어요.' },
      { until: 'fridge', text: '메모판과 벽시계를 같이 보세요. 3시 40분은 숫자 4자리로 0340이에요.' },
      { until: 'door1', text: '서랍에서 나온 열쇠로 창고 문을 열어 보세요.' },
      { until: 'boxes', text: '창고의 깜깜한 곳에 손전등을 써 보세요.' },
      { until: '', text: '아무도 들어오지 않았는데 작은 발자국과 털이 남았어요. 창고에서 찾은 것을 떠올려 보세요.' },
    ],
    ending: '범인은 창고 창문으로 드나든 하얀 고양이 「말랑이」였어요! 회관은 창문에 방충망을 달고, 말랑이 몫의 고양이 간식을 따로 마련했어요.',
  },
  {
    id: 'musicbox',
    title: '멈추지 않는 오르골',
    emoji: '🎶',
    place: '하리보 회관 음악실',
    intro: '매일 밤 9시만 되면 아무도 없는 음악실에서 오르골이 저절로 울려요. 귀신일까요? 음악실을 조사해 진짜 이유를 밝혀 주세요.',
    scenes: [
      { id: 'music', name: '음악실', wall: '#e6dcff', floor: '#c9a27c' },
      { id: 'office', name: '관리실', wall: '#d4f5ea', floor: '#9fb6a8' },
    ],
    items: {
      driver: { name: '드라이버', emoji: '🪛' },
      officekey: { name: '관리실 열쇠', emoji: '🗝️' },
    },
    clues: {
      receiver: '오르골 바닥 안에 작은 무선 수신기가 붙어 있었다. 누군가 멀리서 켜고 있었다.',
      schedule: '관리실 컴퓨터: 「오르골 원격 재생 예약 — 매일 밤 9시」',
      calendar: '달력 메모: 「합창부 연습 시작 알림은 오르골로! — 합창부 부장」',
      remote: '관리실 서랍 속 리모컨에 「합창부 연습용」 이름표가 붙어 있었다.',
    },
    objects: [
      { id: 'sheet', scene: 'music', name: '악보', emoji: '🎼', x: 20, y: 12, look: '악보 구석에 연필 메모가 있어요. 「피아노 의자 비밀번호: 도 미 솔 솔」 그 아래 「도=1 레=2 미=3 파=4 솔=5」' },
      { id: 'poster', scene: 'music', name: '포스터', emoji: '🖼️', x: 50, y: 12, look: '「합창부 연습 — 매일 밤 9시」 포스터예요. 구석에 낙서가 있어요. 「관리실 열쇠는 똑딱똑딱 속에」' },
      {
        id: 'piano', scene: 'music', name: '피아노 의자', emoji: '🎹', x: 22, y: 62, big: true,
        look: '피아노 의자 뚜껑에 숫자 자물쇠가 달려 있어요.',
        lock: { kind: 'code', code: '1355', ask: '숫자 4자리' },
        openText: '딸깍! 의자 속에서 드라이버를 찾았어요.',
        again: '의자 속은 비어 있어요.',
        take: ['driver'],
      },
      {
        id: 'musicbox', scene: 'music', name: '오르골', emoji: '🎁', x: 50, y: 66,
        look: '오르골이 조용히 놓여 있어요. 바닥 판이 나사로 꽉 조여 있어요.',
        lock: { kind: 'item', item: 'driver' },
        openText: '드라이버로 바닥 판을 열자… 작은 무선 수신기가 붙어 있어요! 누군가 멀리서 켜고 있었던 거예요.',
        again: '바닥 안에 무선 수신기가 있어요.',
        clue: 'receiver',
      },
      { id: 'metronome', scene: 'music', name: '메트로놈', emoji: '⏱️', x: 70, y: 70, look: '메트로놈을 흔들어 보니 안에서 열쇠가 툭 떨어졌어요!', again: '똑딱똑딱… 이제 아무것도 안 나와요.', take: ['officekey'] },
      {
        id: 'door1', scene: 'music', name: '관리실 문', emoji: '🚪', x: 88, y: 50, big: true,
        look: '관리실 문이 잠겨 있어요.',
        lock: { kind: 'item', item: 'officekey' },
        openText: '관리실 문이 열렸어요! 한 번 더 누르면 들어가요.',
        goto: 'office',
      },
      { id: 'door2', scene: 'office', name: '음악실로', emoji: '🚪', x: 8, y: 50, big: true, look: '음악실로 돌아가요.', goto: 'music' },
      { id: 'pc', scene: 'office', name: '컴퓨터', emoji: '🖥️', x: 40, y: 58, look: '켜진 화면에 「오르골 원격 재생 예약 — 매일 밤 9시」가 떠 있어요.', clue: 'schedule' },
      { id: 'calendar', scene: 'office', name: '달력', emoji: '📅', x: 62, y: 12, look: '이번 달 달력에 메모가 있어요. 「합창부 연습 시작 알림은 오르골로! — 합창부 부장」', clue: 'calendar' },
      { id: 'desk', scene: 'office', name: '책상 서랍', emoji: '🗄️', x: 72, y: 64, look: '서랍을 열어 보니 리모컨이 있어요. 「합창부 연습용」 이름표가 붙어 있어요.', clue: 'remote' },
      { id: 'mug', scene: 'office', name: '머그컵', emoji: '☕', x: 26, y: 72, look: '식은 코코아예요. 관리인 아저씨는 9시 전에 퇴근한대요.' },
    ],
    question: {
      text: '밤마다 오르골이 울린 진짜 이유는 무엇일까요?',
      options: ['음악실에 사는 오르골 귀신', '합창부가 연습 알림으로 예약해 둔 원격 재생', '오래돼서 고장 난 오르골', '관리인 아저씨의 장난'],
      correct: 1,
      needs: ['receiver', 'schedule'],
    },
    hints: [
      { until: 'piano', text: '악보 메모대로 음을 숫자로 바꿔 보세요. 도 미 솔 솔 = 1 3 5 5' },
      { until: 'musicbox', text: '피아노 의자에서 나온 도구로 열 수 있는 물건이 있어요.' },
      { until: 'metronome', text: '포스터 낙서의 「똑딱똑딱」은 무엇일까요?' },
      { until: 'door1', text: '찾은 열쇠로 관리실 문을 열어 보세요.' },
      { until: 'schedule', text: '관리실 컴퓨터 화면을 살펴보세요.' },
      { until: '', text: '오르골 속 수신기와 컴퓨터 예약을 함께 생각해 보세요.' },
    ],
    ending: '귀신이 아니었어요! 합창부 부장이 연습 시작을 알리려고 오르골을 매일 밤 9시에 원격으로 울리게 예약해 두었어요. 이제는 연습이 있는 날에만 울리기로 했어요.',
  },
  {
    id: 'oldmap',
    title: '도서관의 사라진 고지도',
    emoji: '🗺️',
    place: '하리보 회관 작은 도서관',
    intro: '도서관 자랑인 고지도가 보관실에서 사라졌어요. 대출 기록도 없대요. 열람실과 보관실을 조사해 고지도가 어디로 갔는지 찾아 주세요.',
    scenes: [
      { id: 'reading', name: '열람실', wall: '#fff3c2', floor: '#b88c5e' },
      { id: 'archive', name: '기록 보관실', wall: '#cfe3f5', floor: '#8a96a8' },
    ],
    items: {
      battery: { name: '건전지', emoji: '🔋' },
      archivekey: { name: '보관실 열쇠', emoji: '🗝️' },
    },
    clues: {
      receipt: '반납 영수증: 「고지도 — 반납 처리됨. 처리: 사서 로봇」',
      empty: '보관실 「고지도」 칸이 비어 있고 「수리 중」 쪽지가 꽂혀 있었다.',
      robot: '사서 로봇: 「고지도가 찢어져서 수리실로 보냈어요. 기록을 깜빡 안 바꿨어요. 삐빅.」',
    },
    objects: [
      { id: 'shelf', scene: 'reading', name: '책장', emoji: '📚', x: 20, y: 56, big: true, look: '책 세 권이 삐죽 튀어나와 있어요. 빨강 책 등에 7, 파랑 책에 4, 노랑 책에 9가 적혀 있어요.' },
      { id: 'globe', scene: 'reading', name: '지구본', emoji: '🌍', x: 44, y: 66, look: '지구본 받침에 글씨가 있어요. 「바다 → 해 → 노을」' },
      {
        id: 'box', scene: 'reading', name: '작은 금고', emoji: '🧰', x: 64, y: 70,
        look: '숫자 3자리 자물쇠가 달린 작은 금고예요.',
        lock: { kind: 'code', code: '497', ask: '숫자 3자리' },
        openText: '딸깍! 금고 안에 보관실 열쇠가 있어요.',
        again: '금고는 비어 있어요.',
        take: ['archivekey'],
      },
      { id: 'lamp', scene: 'reading', name: '스탠드', emoji: '💡', x: 34, y: 12, look: '스탠드 밑에 영수증과 여분 건전지가 있어요. 영수증: 「고지도 — 반납 처리됨. 처리: 사서 로봇」', again: '스탠드 불빛이 따뜻해요.', take: ['battery'], clue: 'receipt' },
      { id: 'clock', scene: 'reading', name: '시계', emoji: '🕰️', x: 60, y: 12, look: '도서관 문 닫는 시간은 저녁 6시래요.' },
      {
        id: 'door1', scene: 'reading', name: '보관실 문', emoji: '🚪', x: 88, y: 50, big: true,
        look: '보관실 문이 잠겨 있어요.',
        lock: { kind: 'item', item: 'archivekey' },
        openText: '보관실 문이 열렸어요! 한 번 더 누르면 들어가요.',
        goto: 'archive',
      },
      { id: 'door2', scene: 'archive', name: '열람실로', emoji: '🚪', x: 8, y: 50, big: true, look: '열람실로 돌아가요.', goto: 'reading' },
      { id: 'cabinet', scene: 'archive', name: '지도 보관함', emoji: '🗄️', x: 38, y: 56, big: true, look: '「고지도」 칸이 비어 있어요. 대신 「수리 중」 쪽지가 꽂혀 있어요.', clue: 'empty' },
      {
        id: 'robot', scene: 'archive', name: '사서 로봇', emoji: '🤖', x: 66, y: 64, big: true,
        look: '사서 로봇이 꺼져 있어요. 등에 빈 건전지 칸이 보여요.',
        lock: { kind: 'item', item: 'battery' },
        openText: '건전지를 넣자 로봇이 깨어났어요. 「삐빅! 고지도가 찢어져서 수리실로 보냈어요. 기록을 깜빡 안 바꿨어요.」',
        again: '「삐빅! 고지도는 수리실에 있어요.」',
        clue: 'robot',
      },
      { id: 'scroll', scene: 'archive', name: '두루마리', emoji: '📜', x: 60, y: 14, look: '오래된 회관 설계도예요. 고지도는 아니에요.' },
    ],
    question: {
      text: '고지도는 지금 어디에 있을까요?',
      options: ['누군가 몰래 훔쳐 갔다', '찢어져서 수리실에서 고치는 중이다', '다른 책장에 잘못 꽂혀 있다', '실수로 버려졌다'],
      correct: 1,
      needs: ['empty', 'robot'],
    },
    hints: [
      { until: 'box', text: '지구본 순서대로 책 색깔을 고르세요. 바다=파랑, 해=노랑, 노을=빨강 → 4 9 7' },
      { until: 'door1', text: '금고에서 나온 열쇠로 보관실 문을 열어 보세요.' },
      { until: 'lamp', text: '열람실 위쪽 불빛 근처를 살펴보세요.' },
      { until: 'robot', text: '꺼진 로봇에 넣을 것이 있어요.' },
      { until: '', text: '보관함 쪽지와 로봇의 말을 함께 생각해 보세요.' },
    ],
    ending: '고지도는 찢어져서 수리실에 가 있었어요! 사서 로봇이 기록을 바꾸는 걸 깜빡했던 거예요. 다음 주면 깨끗하게 고쳐진 고지도가 돌아온대요.',
  },
];

// 손으로 만든 입문 사건 3개(★) + 이야기 씨앗으로 만든 사건 47개(★★★)
export const ESCAPE_CASES: EscCase[] = [...HANDMADE.map((c) => ({ ...c, level: 1 })), ...STORY_SEEDS.map((x) => buildCase(x))];

export const escCase = (id: string) => ESCAPE_CASES.find((c) => c.id === id);

export type EscState = {
  v: 1;
  scene: string;
  inv: string[]; // 가방에 있는 물건
  opened: string[]; // 연 물건
  seen: string[]; // 살핀 물건
  shown: string[]; // 새로 보이게 된 물건
  clues: string[];
  mistakes: number;
  hints: number;
  focus: string | null; // 방금 누른 물건
  msg: string;
  tone: 'info' | 'good' | 'bad';
  done: boolean;
};
export type EscAction =
  | { a: 'tap'; o: string }
  | { a: 'use'; o: string; i: string }
  | { a: 'code'; o: string; v: string }
  | { a: 'answer'; n: number; m?: number[] }
  | { a: 'combine'; i: string; j: string }
  | { a: 'hint' };
export type EscGrade = 'S' | 'A' | 'B' | 'C';

export function startEscape(c: EscCase): EscState {
  return { v: 1, scene: c.scenes[0]!.id, inv: [], opened: [], seen: [], shown: [], clues: [], mistakes: 0, hints: 0, focus: null, msg: c.intro, tone: 'info', done: false };
}

export const visible = (c: EscCase, s: EscState, o: EscObject) => o.scene === s.scene && (!o.hidden || s.shown.includes(o.id));
export const normCode = (v: string) => v.normalize('NFC').replace(/\s/g, '').toUpperCase();
export const isLocked = (s: EscState, o: EscObject) => !!o.lock && !s.opened.includes(o.id);
export const escGrade = (s: EscState): EscGrade => {
  const p = s.mistakes + s.hints;
  return p <= 1 ? 'S' : p <= 3 ? 'A' : p <= 6 ? 'B' : 'C';
};
export const canAnswer = (c: EscCase, s: EscState) => c.question.needs.every((n) => s.clues.includes(n));
export const nextHint = (c: EscCase, s: EscState) =>
  c.hints.find((h) => !h.until || !(s.opened.includes(h.until) || s.clues.includes(h.until) || s.seen.includes(h.until)))?.text ?? c.hints.at(-1)!.text;

const add = (list: string[], v?: string | string[]) => {
  for (const x of v === undefined ? [] : Array.isArray(v) ? v : [v]) if (!list.includes(x)) list.push(x);
};
// 물건을 살피거나 열었을 때 얻는 것(물건·단서·새로 보이는 것)은 한 번만 들어와요.
function gain(s: EscState, o: EscObject) {
  if (!s.seen.includes(o.id)) {
    add(s.inv, o.take);
    add(s.shown, o.reveals);
  }
  add(s.clues, o.clue);
  add(s.seen, o.id);
}

// 상태 전이(순수 함수). 할 수 없는 입력이면 null이고 원래 상태는 그대로예요.
export function actEscape(c: EscCase, old: EscState, act: EscAction): EscState | null {
  if (old.done) return null;
  const s: EscState = structuredClone(old);
  if (act.a === 'hint') {
    s.hints += 1;
    s.focus = null;
    s.msg = `💡 ${nextHint(c, old)}`;
    s.tone = 'info';
    return s;
  }
  if (act.a === 'answer') {
    if (!Number.isInteger(act.n) || act.n < 0 || act.n >= c.question.options.length || !canAnswer(c, s)) return null;
    const more = c.more ?? [];
    const m = act.m ?? [];
    if (m.length !== more.length || m.some((x, k) => !Number.isInteger(x) || x < 0 || x >= more[k]!.options.length)) return null;
    s.focus = null;
    const right = (act.n === c.question.correct ? 1 : 0) + more.filter((q, k) => m[k] === q.correct).length;
    if (right === more.length + 1) {
      s.done = true;
      s.msg = c.ending;
      s.tone = 'good';
    } else {
      s.mistakes += 1;
      s.msg = more.length ? `${more.length + 1}개 중 ${right}개만 맞았어요. 어느 것이 틀렸는지 수첩을 다시 읽어 보세요.` : '음… 모은 단서와 맞지 않아요. 수첩을 다시 읽어 보세요.';
      s.tone = 'bad';
    }
    return s;
  }
  if (act.a === 'combine') {
    if (act.i === act.j || !s.inv.includes(act.i) || !s.inv.includes(act.j)) return null;
    const k = (c.combos ?? []).find((x) => (x.a === act.i && x.b === act.j) || (x.a === act.j && x.b === act.i));
    s.focus = null;
    if (!k) {
      s.mistakes += 1;
      s.msg = `${c.items[act.i]?.name}와(과) ${c.items[act.j]?.name}은(는) 합쳐지지 않아요.`;
      s.tone = 'bad';
      return s;
    }
    s.inv = s.inv.filter((x) => x !== act.i && x !== act.j);
    add(s.inv, k.out);
    s.msg = k.text;
    s.tone = 'good';
    return s;
  }
  const o = c.objects.find((x) => x.id === act.o);
  if (!o || !visible(c, s, o)) return null;
  s.focus = o.id;
  if (act.a === 'tap') {
    if (isLocked(s, o)) {
      s.msg = o.look;
      s.tone = 'info';
      return s;
    }
    if (o.goto && (!o.lock || s.seen.includes(o.id))) {
      s.scene = o.goto;
      s.focus = null;
      s.msg = `${c.scenes.find((x) => x.id === o.goto)!.name}(으)로 왔어요.`;
      s.tone = 'info';
      add(s.seen, o.id);
      return s;
    }
    const first = !s.seen.includes(o.id);
    gain(s, o);
    s.msg = first || !o.again ? (o.lock ? o.openText! : o.look) : o.again;
    s.tone = first && (o.take || o.clue) ? 'good' : 'info';
    return s;
  }
  if (!isLocked(s, o)) return null;
  if (act.a === 'use') {
    if (o.lock!.kind !== 'item' || !s.inv.includes(act.i)) return null;
    if (o.lock!.item !== act.i) {
      s.mistakes += 1;
      s.msg = `${c.items[act.i]?.name ?? '그 물건'}(으)로는 열리지 않아요.`;
      s.tone = 'bad';
      return s;
    }
    s.inv = s.inv.filter((x) => x !== act.i);
  } else {
    if (o.lock!.kind !== 'code' || typeof act.v !== 'string') return null;
    const v = normCode(act.v);
    const digits = /^[0-9]+$/.test(o.lock!.code);
    if (digits ? !/^[0-9]{1,8}$/.test(v) : !v || v.length > 12) return null;
    if (v !== normCode(o.lock!.code)) {
      s.mistakes += 1;
      s.msg = digits ? '삐빅! 비밀번호가 틀렸어요.' : '삐빅! 암호가 틀렸어요.';
      s.tone = 'bad';
      return s;
    }
  }
  add(s.opened, o.id);
  gain(s, o);
  s.msg = o.openText ?? o.look;
  s.tone = 'good';
  return s;
}

export function decodeEscape(c: EscCase, json: string): EscState | null {
  try {
    const s = JSON.parse(json) as EscState;
    const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
    if (s.v !== 1 || !c.scenes.some((x) => x.id === s.scene) || ![s.inv, s.opened, s.seen, s.shown, s.clues].every(strs)) return null;
    if (![s.mistakes, s.hints].every((n) => Number.isSafeInteger(n) && n >= 0) || typeof s.msg !== 'string' || typeof s.done !== 'boolean') return null;
    return s;
  } catch {
    return null;
  }
}
