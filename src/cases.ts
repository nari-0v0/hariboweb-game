// 하리보 사건파일: 장소를 조사해서 단서를 모으고 범인·방법·동기를 맞히는 추리 게임.
// 유료 AI 없이, 미리 써 둔 문장 조각을 코드가 섞어서 매번 다른 사건을 만들어요.
// 상태는 씨앗(seed)과 조사한 장소 번호로 언제든 다시 계산해요(원정대와 같은 방식).
import { rng } from './expedition';

export const SUSPECTS = 4;
export const DAILY_REWARD_CASES = 3;
export const CASE_XP = 10;
export const GOOD_LOOKS = 4; // 이 수 이하로 조사하고 다 맞히면 S

type Value = { id: string; name: string; clue: string };
type Trait = { label: string; values: Value[] };
type Choice = { id: string; name: string; clue: string };

export type CaseDef = {
  id: string;
  name: string;
  icon: string;
  blurb: string; // 목록에 보이는 한 줄
  intro: string; // 사건 설명
  traits: [Trait, Trait];
  places: string[]; // 조사할 곳 6군데(단서는 어느 곳에서나 나올 수 있어서, 단서 문장에는 장소 이름을 쓰지 않아요)
  methods: Choice[];
  motives: Choice[];
  herring: string[]; // 사건과 관계없는 단서
  alibi: string; // {name}
};

export const CASES: CaseDef[] = [
  {
    id: 'jelly',
    name: '사라진 젤리 단지',
    icon: '🍬',
    blurb: '라운지의 젤리 단지가 하룻밤 사이에 텅 비었어요.',
    intro: '아침에 라운지에 와 보니 다 같이 먹으려던 젤리 단지가 텅 비어 있었어요. 어젯밤 라운지에 남아 있던 사람은 네 명이에요.',
    traits: [
      {
        label: '옷',
        values: [
          { id: 'red', name: '빨간 옷', clue: '빨간 실밥 한 가닥이 걸려 있었어요.' },
          { id: 'blue', name: '파란 옷', clue: '파란 실밥 한 가닥이 걸려 있었어요.' },
          { id: 'green', name: '초록 옷', clue: '초록 실밥 한 가닥이 걸려 있었어요.' },
          { id: 'yellow', name: '노란 옷', clue: '노란 실밥 한 가닥이 걸려 있었어요.' },
        ],
      },
      {
        label: '손에 든 것',
        values: [
          { id: 'umbrella', name: '우산', clue: '동그란 물 자국이 이어져 있었어요. 우산 끝에서 떨어진 물 같아요.' },
          { id: 'guitar', name: '기타', clue: '벽에 기타 줄에 긁힌 자국이 있었어요.' },
          { id: 'console', name: '게임기', clue: '게임기 충전 케이블이 떨어져 있었어요.' },
          { id: 'book', name: '책', clue: '책갈피 한 장이 떨어져 있었어요.' },
        ],
      },
    ],
    places: ['라운지 소파', '찬장', '창가', '쓰레기통', '복도', '게시판'],
    methods: [
      { id: 'key', name: '찬장 열쇠로 열었다', clue: '찬장 열쇠에 젤리 가루가 묻어 있었어요. 누가 열쇠로 찬장을 연 것 같아요.' },
      { id: 'window', name: '창문으로 몰래 들어왔다', clue: '창문 쪽으로 흙 묻은 신발 자국이 이어져 있었어요. 문이 아니라 창문으로 드나든 것 같아요.' },
      { id: 'swap', name: '빈 단지와 바꿔치기했다', clue: '젤리가 가득 든 똑같은 단지가 숨겨져 있었어요. 누가 빈 단지와 바꿔 놓은 거예요.' },
    ],
    motives: [
      { id: 'hungry', name: '배가 너무 고파서', clue: '"배고파서 죽겠다…"라고 적힌 쪽지가 나왔어요.' },
      { id: 'party', name: '깜짝 파티를 준비하려고', clue: '"내일 깜짝 파티! 젤리는 내가 챙김"이라는 메모가 숨겨져 있었어요.' },
      { id: 'bet', name: '내기에서 져서', clue: '"지는 사람이 젤리 다 가져오기"라고 적힌 내기 종이가 나왔어요.' },
    ],
    herring: ['오래된 동전 하나가 나왔어요. 이번 사건과는 상관없어 보여요.', '누가 화분에 물을 준 흔적이 있어요. 사건과는 관계없어 보여요.'],
    alibi: '{name} 그 시간 내내 음성방에서 노래를 불렀다는 증언이 있어요. 라운지에는 없었어요.',
  },
  {
    id: 'trophy',
    name: '트로피 실종 사건',
    icon: '🏆',
    blurb: '진열장의 우승 트로피가 감쪽같이 사라졌어요.',
    intro: '클랜 진열장에 있던 반짝이는 우승 트로피가 사라졌어요. 진열장 근처에 다녀간 사람은 네 명이에요.',
    traits: [
      {
        label: '신발',
        values: [
          { id: 'sneakers', name: '운동화', clue: '운동화 밑창 무늬가 찍혀 있었어요.' },
          { id: 'boots', name: '장화', clue: '커다란 장화 자국이 찍혀 있었어요.' },
          { id: 'slippers', name: '슬리퍼', clue: '납작한 슬리퍼 자국이 찍혀 있었어요.' },
          { id: 'shoes', name: '구두', clue: '뾰족한 구두 굽 자국이 찍혀 있었어요.' },
        ],
      },
      {
        label: '간식',
        values: [
          { id: 'choco', name: '초콜릿', clue: '초콜릿 묻은 지문이 남아 있었어요.' },
          { id: 'chips', name: '감자칩', clue: '감자칩 부스러기가 떨어져 있었어요.' },
          { id: 'tangerine', name: '귤', clue: '귤 껍질이 놓여 있었어요.' },
          { id: 'candy', name: '사탕', clue: '사탕 껍질이 떨어져 있었어요.' },
        ],
      },
    ],
    places: ['진열장', '청소 도구함', '창고', '대기실', '계단', '우편함'],
    methods: [
      { id: 'mop', name: '청소하는 척 들고 나갔다', clue: '청소용 양동이 안쪽에서 반짝이는 금빛 가루가 나왔어요. 양동이에 숨겨서 나간 것 같아요.' },
      { id: 'fake', name: '가짜 트로피로 바꿔치기했다', clue: '은박지로 만든 가짜 트로피가 나왔어요. 처음엔 이걸 진열장에 대신 놓아뒀던 거예요.' },
      { id: 'glass', name: '진열장 유리를 들어 올렸다', clue: '진열장 유리를 들어 올릴 때 쓴 것 같은 고무장갑이 나왔어요.' },
    ],
    motives: [
      { id: 'shiny', name: '반짝이는 게 좋아서', clue: '반짝이는 물건만 잔뜩 모아 둔 상자가 있었어요.' },
      { id: 'name', name: '자기 이름을 새기려고', clue: '"트로피에 내 이름 새기는 법"이라고 적힌 쪽지가 나왔어요.' },
      { id: 'prize', name: '다음 내전 상품으로 쓰려고', clue: '"다음 내전 상품: 트로피(준비 완료)"라는 공지 초안이 나왔어요.' },
    ],
    herring: ['누가 잃어버린 머리핀이 있어요. 사건과는 상관없어 보여요.', '광고 전단지만 잔뜩 있어요. 사건과는 상관없어 보여요.'],
    alibi: '{name} 그 시간에 대기실에서 다른 사람과 같이 게임을 했다는 증언이 있어요. 진열장 근처엔 안 갔어요.',
  },
  {
    id: 'karaoke',
    name: '한밤의 노래방',
    icon: '🎤',
    blurb: '새벽 세 시, 아무도 없는 노래방에서 노래가 흘러나왔어요.',
    intro: '새벽 세 시, 문 닫은 노래방에서 노래가 크게 흘러나와서 모두 잠에서 깼어요. 노래방 열쇠를 가진 사람은 네 명이에요.',
    traits: [
      {
        label: '머리',
        values: [
          { id: 'long', name: '긴 머리', clue: '긴 머리카락 한 올이 붙어 있었어요.' },
          { id: 'short', name: '짧은 머리', clue: '짧고 뻣뻣한 머리카락이 붙어 있었어요.' },
          { id: 'curly', name: '곱슬머리', clue: '꼬불꼬불한 머리카락이 붙어 있었어요.' },
          { id: 'tied', name: '묶은 머리', clue: '머리끈 하나가 떨어져 있었어요.' },
        ],
      },
      {
        label: '좋아하는 노래',
        values: [
          { id: 'ballad', name: '발라드', clue: '구겨진 노래 예약 쪽지가 나왔어요. 전부 느린 발라드예요.' },
          { id: 'dance', name: '댄스', clue: '구겨진 노래 예약 쪽지가 나왔어요. 전부 신나는 댄스곡이에요.' },
          { id: 'trot', name: '트로트', clue: '구겨진 노래 예약 쪽지가 나왔어요. 전부 트로트예요.' },
          { id: 'rock', name: '록', clue: '구겨진 노래 예약 쪽지가 나왔어요. 전부 시끄러운 록이에요.' },
        ],
      },
    ],
    places: ['노래방 기계', '소파', '문 앞', '음료 냉장고', '창문', '분실물 상자'],
    methods: [
      { id: 'remote', name: '리모컨으로 밖에서 켰다', clue: '새 건전지 포장지가 나왔어요. 리모컨 건전지를 갈아서 멀리서도 켜지게 해 둔 거예요.' },
      { id: 'timer', name: '예약 기능을 맞춰 뒀다', clue: '"새벽 3:00 자동 시작 맞추는 법"이라고 적힌 설명서가 펼쳐져 있었어요.' },
      { id: 'sneak', name: '몰래 들어와서 불렀다', clue: '아직 차가운 빈 음료 캔이 하나 있었어요. 누가 새벽에 직접 와서 부른 거예요.' },
    ],
    motives: [
      { id: 'practice', name: '노래 연습을 하려고', clue: '"노래 대회까지 D-1, 몰래 연습!"이라는 메모가 나왔어요.' },
      { id: 'wake', name: '누군가를 깨우려고', clue: '"아침 일찍 깨워 주기로 약속함"이라는 쪽지가 나왔어요.' },
      { id: 'sleepless', name: '잠이 안 와서', clue: '"잠이 하나도 안 와…"라고 적힌 낙서가 있었어요.' },
    ],
    herring: ['고양이 발자국이 보여요. 사건과는 상관없어 보여요.', '주인 없는 우산이 세 개나 있어요. 사건과는 상관없어 보여요.'],
    alibi: '{name} 그 시간에 다른 방에서 깊이 자고 있었다는 증언이 있어요. 코 고는 소리를 다들 들었대요.',
  },
];

export const caseById = (id: string) => CASES.find((c) => c.id === id);

export type Suspect = { id: string | null; name: string; art: string };

// 단서 한 장
export type Clue = { kind: 'trait1' | 'trait2' | 'alibi' | 'method' | 'motive' | 'herring'; text: string; who?: number };

export type Puzzle = {
  culprit: number; // suspects 안의 번호
  method: number;
  motive: number;
  traits: [number, number][]; // 용의자마다 [특징1 값 번호, 특징2 값 번호]
  clues: Clue[]; // places와 같은 순서(장소마다 단서 한 장)
};

function shuffle<T>(r: () => number, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// 받침이 있으면 "은", 없으면 "는"
export function topic(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}은(는)`;
  return `${word}${code % 28 ? '은' : '는'}`;
}

// 사건 만들기: 특징 단서 두 개를 겹쳐야 범인이 한 명으로 좁혀지게 짜요.
// 범인 C, 나머지 X·Y·Z: 특징1은 C=X, 특징2는 C=Y. 알리바이로 X나 Y 중 한 명이 빠져요.
export function makePuzzle(def: CaseDef, seed: string, suspects: Suspect[]): Puzzle {
  const r = rng(`${seed}:case`);
  const order = shuffle(r, [0, 1, 2, 3]); // [C, X, Y, Z]
  const [c, x, y, z] = order as [number, number, number, number];
  const t1 = shuffle(r, def.traits[0].values.map((_, i) => i));
  const t2 = shuffle(r, def.traits[1].values.map((_, i) => i));
  const traits: [number, number][] = [];
  traits[c] = [t1[0]!, t2[0]!];
  traits[x] = [t1[0]!, t2[1]!];
  traits[y] = [t1[1]!, t2[0]!];
  traits[z] = [t1[2]!, t2[2]!];
  const method = Math.floor(r() * def.methods.length);
  const motive = Math.floor(r() * def.motives.length);
  const cleared = r() < 0.5 ? x : y;
  const clues = shuffle<Clue>(r, [
    { kind: 'trait1', text: def.traits[0].values[t1[0]!]!.clue },
    { kind: 'trait2', text: def.traits[1].values[t2[0]!]!.clue },
    { kind: 'alibi', text: def.alibi.replaceAll('{name}', topic(suspects[cleared]?.name ?? '누군가')), who: cleared },
    { kind: 'method', text: def.methods[method]!.clue },
    { kind: 'motive', text: def.motives[motive]!.clue },
    { kind: 'herring', text: def.herring[Math.floor(r() * def.herring.length)]! },
  ]);
  return { culprit: c, method, motive, traits, clues };
}

// 조사한 단서만으로 범인일 수 있는 사람(화면의 "남은 용의자" 표시에 써요)
export function possible(p: Puzzle, looked: number[]): number[] {
  let left = p.traits.map((_, i) => i);
  for (const i of looked) {
    const clue = p.clues[i];
    if (!clue) continue;
    if (clue.kind === 'trait1') left = left.filter((s) => p.traits[s]![0] === p.traits[p.culprit]![0]);
    if (clue.kind === 'trait2') left = left.filter((s) => p.traits[s]![1] === p.traits[p.culprit]![1]);
    if (clue.kind === 'alibi') left = left.filter((s) => s !== clue.who);
  }
  return left;
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'F';
export const GRADE_INFO: Record<Grade, { name: string; text: string }> = {
  S: { name: '명탐정', text: '범인·방법·동기를 모두 맞히고, 조사도 빨랐어요!' },
  A: { name: '수석 탐정', text: '범인·방법·동기를 모두 맞혔어요.' },
  B: { name: '탐정', text: '범인과 방법·동기 중 하나를 맞혔어요.' },
  C: { name: '견습 탐정', text: '범인은 맞혔지만 방법과 동기는 틀렸어요.' },
  F: { name: '미해결', text: '범인을 놓쳤어요. 다음 사건에서 다시 도전해요.' },
};

export type Answer = { culprit: number; method: number; motive: number };

export function grade(p: Puzzle, a: Answer, looks: number): Grade {
  if (a.culprit !== p.culprit) return 'F';
  const extra = Number(a.method === p.method) + Number(a.motive === p.motive);
  if (extra === 2) return looks <= GOOD_LOOKS ? 'S' : 'A';
  return extra === 1 ? 'B' : 'C';
}

// 보상: 하루 첫 3건은 내 카드 경험치, S·A면 도감 젤리 1개
export const caseJelly = (g: Grade) => (g === 'S' || g === 'A' ? 1 : 0);
