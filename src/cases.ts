// 하리보 사건파일: 장소를 조사하고 용의자를 심문해서 범인·방법·동기를 맞히는 추리 게임.
// 유료 AI 없이, 미리 써 둔 문장 조각을 코드가 섞어서 매번 다른 사건을 만들어요.
// 상태는 씨앗(seed)과 한 행동 번호로 언제든 다시 계산해요(원정대와 같은 방식).
import { rng } from './expedition';

export const SUSPECTS = 5;
export const DAILY_REWARD_CASES = 3;
export const CASE_XP = 10;
export const ACTIONS = 10; // 조사 + 심문을 합쳐 이만큼만 할 수 있어요
export const GOOD_ACTIONS = 8; // 이 수 이하로 행동하고 다 맞히면 S
export const ASK = 100; // 행동 번호: 0~7 = 장소 조사, 100+i = i번째 용의자 심문

type Value = { id: string; name: string; clue: string };
type Trait = { label: string; values: Value[] };
type Choice = { id: string; name: string; clue: string };

export type CaseDef = {
  id: string;
  name: string;
  icon: string;
  blurb: string; // 목록에 보이는 한 줄
  intro: string; // 사건 설명
  traits: [Trait, Trait, Trait];
  places: string[]; // 조사할 곳 8군데(단서는 어느 곳에서나 나올 수 있어서, 단서 문장에는 장소 이름을 쓰지 않아요)
  rooms: string[]; // 용의자들이 "그 시간에 있었다"고 말하는 곳 4군데
  methods: Choice[];
  motives: Choice[];
  herring: string[]; // 사건과 관계없는 단서 2개
};

export const CASES: CaseDef[] = [
  {
    id: 'jelly',
    name: '사라진 젤리 단지',
    icon: '🍬',
    blurb: '라운지의 젤리 단지가 하룻밤 사이에 텅 비었어요.',
    intro: '아침에 라운지에 와 보니 다 같이 먹으려던 젤리 단지가 텅 비어 있었어요. 어젯밤 건물에 남아 있던 사람은 다섯 명이에요.',
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
      {
        label: '모자',
        values: [
          { id: 'beanie', name: '털모자', clue: '털모자에서 빠진 보풀이 붙어 있었어요.' },
          { id: 'cap', name: '야구모자', clue: '야구모자 뒤 끈에 달린 플라스틱 조각이 떨어져 있었어요.' },
          { id: 'beret', name: '베레모', clue: '베레모 꼭대기에 달린 작은 꼭지가 떨어져 있었어요.' },
          { id: 'straw', name: '밀짚모자', clue: '밀짚 부스러기가 흩어져 있었어요.' },
        ],
      },
    ],
    places: ['라운지 소파', '찬장', '창가', '쓰레기통', '복도', '게시판', '냉장고', '신발장'],
    rooms: ['음성방', '게임방', '부엌', '옥상'],
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
  },
  {
    id: 'trophy',
    name: '트로피 실종 사건',
    icon: '🏆',
    blurb: '진열장의 우승 트로피가 감쪽같이 사라졌어요.',
    intro: '클랜 진열장에 있던 반짝이는 우승 트로피가 사라졌어요. 그날 클럽 건물에 다녀간 사람은 다섯 명이에요.',
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
      {
        label: '가방',
        values: [
          { id: 'backpack', name: '백팩', clue: '백팩 어깨끈 버클 하나가 떨어져 있었어요.' },
          { id: 'cross', name: '크로스백', clue: '크로스백 끈에 달린 고리 하나가 떨어져 있었어요.' },
          { id: 'tote', name: '천 가방', clue: '천 가방에서 떨어진 천 조각이 붙어 있었어요.' },
          { id: 'hand', name: '손가방', clue: '손가방 손잡이에서 떨어진 작은 장식이 있었어요.' },
        ],
      },
    ],
    places: ['진열장', '청소 도구함', '창고', '대기실', '계단', '우편함', '분수대', '사물함'],
    rooms: ['연습실', '매점', '휴게실', '옥상'],
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
  },
  {
    id: 'karaoke',
    name: '한밤의 노래방',
    icon: '🎤',
    blurb: '새벽 세 시, 아무도 없는 노래방에서 노래가 흘러나왔어요.',
    intro: '새벽 세 시, 문 닫은 노래방에서 노래가 크게 흘러나와서 모두 잠에서 깼어요. 노래방 열쇠를 가진 사람은 다섯 명이에요.',
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
      {
        label: '잠옷',
        values: [
          { id: 'star', name: '별무늬 잠옷', clue: '별무늬 천 조각이 걸려 있었어요.' },
          { id: 'stripe', name: '줄무늬 잠옷', clue: '줄무늬 천 조각이 걸려 있었어요.' },
          { id: 'bear', name: '곰돌이 잠옷', clue: '곰돌이 귀 모양 천 조각이 걸려 있었어요.' },
          { id: 'dot', name: '물방울 잠옷', clue: '물방울무늬 천 조각이 걸려 있었어요.' },
        ],
      },
    ],
    places: ['노래방 기계', '소파', '문 앞', '음료 냉장고', '창문', '분실물 상자', '복도', '현관'],
    rooms: ['침실', '거실', '부엌', '베란다'],
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
  },
];

export const caseById = (id: string) => CASES.find((c) => c.id === id);

export type Suspect = { id: string | null; name: string; art: string };

// 심문하면 진술 끝에 붙는 한마디(사건과 상관없는 말이에요)
const LINES = [
  '저는 정말 아무것도 몰라요.',
  '누가 그랬는지 저도 궁금해요.',
  '증거 있어요? 없으면 저 말고 다른 사람 찾아보세요.',
  '전 그냥 조용히 있었을 뿐이에요.',
  '탐정님, 저 믿으시죠?',
  '그날따라 이상하게 졸렸어요.',
  '빨리 범인 잡아 주세요. 무서워요.',
  '물어볼 거 있으면 얼마든지 물어보세요.',
  '아니 왜 저부터 물어보세요?',
  '그 시간엔 휴대폰만 보고 있었어요.',
];

// 단서 한 장. trait·not = 특징 단서(범인은 이 값이다 / 이 값이 아니다), count = 그 방엔 한 명만 있었다
export type Clue = { kind: 'trait' | 'not' | 'count' | 'method' | 'motive' | 'herring'; text: string; trait?: number; value?: number; room?: number };

export type Puzzle = {
  culprit: number; // suspects 안의 번호
  method: number;
  motive: number;
  traits: number[][]; // 용의자마다 [특징1, 특징2, 특징3] 값 번호
  claims: number[]; // 용의자마다 "그 시간에 있었다"고 말한 방(rooms 번호). 범인만 거짓말해요.
  lines: number[]; // 용의자마다 진술 끝 한마디(LINES 번호)
  room: number; // 출입 기록 단서의 방(진짜로는 한 명만 있었어요)
  witness: number; // 그 방에 진짜로 있던 사람(범인이 이 사람과 같은 방에 있었다고 거짓말해요)
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

const hasFinal = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code < 0 || code > 11171 ? null : code % 28 !== 0;
};

// 받침이 있으면 "은", 없으면 "는"
export function topic(word: string): string {
  const f = hasFinal(word);
  return f === null ? `${word}은(는)` : `${word}${f ? '은' : '는'}`;
}

// 받침이 있으면 "이", 없으면 "가"
export function subject(word: string): string {
  const f = hasFinal(word);
  return f === null ? `${word}이(가)` : `${word}${f ? '이' : '가'}`;
}

export const statement = (def: CaseDef, p: Puzzle, i: number) => `그 시간엔 ${def.rooms[p.claims[i]!]}에 있었어요. ${LINES[p.lines[i]!]}`;

type Test = { trait: number; value: number; not: boolean };
const passes = (traits: number[], t: Test) => (traits[t.trait] === t.value) !== t.not;

// 특징 단서 하나 = 시험 하나. 범인은 모든 시험을 통과해요.
function left(traits: number[][], tests: Test[]): number[] {
  return traits.map((_, i) => i).filter((i) => tests.every((t) => passes(traits[i]!, t)));
}

// 사건 만들기
// - 용의자 다섯 명은 특징 세 가지(값 네 개 중 하나)를 무작위로 가져요. 모두 조합이 달라요.
// - 특징 단서 세 장(범인은 ○○이다 / ○○이 아니다): 한두 장만으로는 세 명 이상 남고, 세 장을 다 겹치면 두 명(범인과 한 명)이 남아요.
// - 범인은 진짜 그 방에 있던 사람(목격자)과 같은 방에 있었다고 거짓말해요. 출입 기록 단서는 "그 방엔 한 명만 있었다"고 알려 줘요.
//   그래서 그 방에 있었다는 두 사람 중 하나는 거짓말쟁이(=범인)이고, 특징 단서로 남은 두 명과 겹치는 사람이 범인이에요.
export function makePuzzle(def: CaseDef, seed: string, _suspects: Suspect[]): Puzzle {
  const r = rng(`${seed}:case`);
  const n = SUSPECTS;
  const culprit = Math.floor(r() * n);
  let traits: number[][] = [];
  let tests: Test[] = [];
  for (let attempt = 0; attempt < 400 && !tests.length; attempt++) {
    const seen = new Set<string>();
    traits = [];
    while (traits.length < n) {
      const t = def.traits.map((tr) => Math.floor(r() * tr.values.length));
      if (seen.has(t.join())) continue;
      seen.add(t.join());
      traits.push(t);
    }
    // 특징마다 고를 수 있는 시험: 범인 값(맞다) 또는 다른 사람이 가진 다른 값(아니다). 한 장으로 너무 많이 줄지 않게(세 명 이상 남게).
    const options = def.traits.map((_, k) => {
      const out: Test[] = [{ trait: k, value: traits[culprit]![k]!, not: false }];
      for (const v of new Set(traits.map((t) => t[k]!))) if (v !== traits[culprit]![k]) out.push({ trait: k, value: v, not: true });
      return out.filter((t) => {
        const l = left(traits, [t]).length;
        return l >= 3 && l < n;
      });
    });
    const good: Test[][] = [];
    for (const a of options[0]!)
      for (const b of options[1]!)
        for (const c of options[2]!) {
          if (left(traits, [a, b, c]).length !== 2) continue;
          if ([[a, b], [a, c], [b, c]].some((pair) => left(traits, pair).length < 3)) continue;
          good.push([a, b, c]);
        }
    if (good.length) tests = good[Math.floor(r() * good.length)]!;
  }
  if (!tests.length) throw new Error('puzzle'); // 테스트로 이런 일이 없는지 확인해요
  const other = left(traits, tests).find((i) => i !== culprit)!;
  const rest = shuffle(
    r,
    traits.map((_, i) => i).filter((i) => i !== culprit && i !== other),
  );
  const witness = rest[0]!;
  const rooms = shuffle(r, def.rooms.map((_, i) => i));
  const room = rooms[0]!;
  const claims: number[] = [];
  claims[culprit] = room;
  claims[witness] = room;
  // 나머지 세 명 중 두 명은 같은 다른 방에 있었어요(같은 방을 말한 두 사람이 한 쌍만 있으면 너무 쉬우니까요)
  const others = shuffle(r, [other, rest[1]!, rest[2]!]);
  claims[others[0]!] = rooms[1]!;
  claims[others[1]!] = rooms[1]!;
  claims[others[2]!] = rooms[1 + Math.floor(r() * 3)]!;
  const lines = shuffle(r, LINES.map((_, i) => i)).slice(0, n);
  const method = Math.floor(r() * def.methods.length);
  const motive = Math.floor(r() * def.motives.length);
  const traitClue = (t: Test): Clue => {
    const tr = def.traits[t.trait]!;
    const v = tr.values[t.value]!;
    return t.not
      ? { kind: 'not', trait: t.trait, value: t.value, text: `목격자 말로는 범인의 ${topic(tr.label)} ${subject(v.name)} 아니었대요.` }
      : { kind: 'trait', trait: t.trait, value: t.value, text: v.clue };
  };
  const roomName = def.rooms[room]!;
  const clues = shuffle<Clue>(r, [
    ...tests.map(traitClue),
    { kind: 'count', room, text: `${roomName} 출입 기록을 찾았어요. 사건이 난 시간에 ${roomName}에 있던 사람은 딱 한 명이었어요.` },
    { kind: 'method', text: def.methods[method]!.clue },
    { kind: 'motive', text: def.motives[motive]!.clue },
    ...def.herring.map((text): Clue => ({ kind: 'herring', text })),
  ]);
  return { culprit, method, motive, traits, claims, lines, room, witness, clues };
}

// 단서와 진술을 다 알 때 범인일 수 있는 사람. 거짓말은 범인만 해요.
// k가 범인이면: k는 특징 단서를 다 통과하고, k를 뺀 나머지 중 그 방에 있었다는 사람이 딱 한 명이어야 해요.
export function solve(p: Puzzle): number[] {
  const tests: Test[] = p.clues.filter((c) => c.kind === 'trait' || c.kind === 'not').map((c) => ({ trait: c.trait!, value: c.value!, not: c.kind === 'not' }));
  return left(p.traits, tests).filter((k) => p.claims.filter((room, i) => i !== k && room === p.room).length === 1);
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'F';
export const GRADE_INFO: Record<Grade, { name: string; text: string }> = {
  S: { name: '명탐정', text: '범인·방법·동기를 모두 맞히고, 수사도 빨랐어요!' },
  A: { name: '수석 탐정', text: '범인·방법·동기를 모두 맞혔어요.' },
  B: { name: '탐정', text: '범인과 방법·동기 중 하나를 맞혔어요.' },
  C: { name: '견습 탐정', text: '범인은 맞혔지만 방법과 동기는 틀렸어요.' },
  F: { name: '미해결', text: '범인을 놓쳤어요. 다음 사건에서 다시 도전해요.' },
};

export type Answer = { culprit: number; method: number; motive: number };

export function grade(p: Puzzle, a: Answer, actions: number): Grade {
  if (a.culprit !== p.culprit) return 'F';
  const extra = Number(a.method === p.method) + Number(a.motive === p.motive);
  if (extra === 2) return actions <= GOOD_ACTIONS ? 'S' : 'A';
  return extra === 1 ? 'B' : 'C';
}

// 보상: 하루 첫 3건은 내 카드 경험치, S·A면 도감 젤리 1개
export const caseJelly = (g: Grade) => (g === 'S' || g === 'A' ? 1 : 0);
