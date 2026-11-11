import { levelFromXp, xpForLevel } from './levels';

// 도감 칭호. 고르면 하리보봇이 디스코드 닉네임 앞에 `「칭호」 `로 붙여요(닉네임·생년과는 따로).
// 디스코드 서버 태그처럼 4글자까지예요. 이름·조건·값은 여기서만 바꾸면 돼요.
// 이미 누가 얻은 칭호의 id는 바꾸지 마세요(얻은 기록이 id로 남아요).
export const TITLE_MAX = 4;

export type TitleRule =
  | { kind: 'shop'; price: number }
  | { kind: 'bestLevel'; level: number } // 카드 한 장을 이 레벨까지
  | { kind: 'friends'; level: number; count: number } // 이 레벨 넘은 카드가 몇 장
  | { kind: 'ownLevel'; level: number } // 내 카드 레벨
  | { kind: 'cards'; count: number } // 도감 카드 몇 장
  | { kind: 'questRate'; rate: number; seasons: number } // 끝난 시즌 모둠 퀘스트 성공률
  | { kind: 'fullClear'; count: number } // 모둠 퀘스트 8개를 다 깬 시즌 수
  | { kind: 'seasons'; count: number } // 끝까지 함께한 시즌 수
  | { kind: 'bingo'; count: number } // 빙고 줄 수(모두 합쳐서)
  | { kind: 'bingoFull'; count: number } // 빙고판을 다 채운 수
  | { kind: 'praiseGot'; count: number }
  | { kind: 'praiseGave'; count: number }
  | { kind: 'voiceHours'; hours: number }; // 같이 통화한 시간(카드마다 더해서)

export type Title = { id: string; name: string; group: string; rule: TitleRule };

// ── 상점 칭호: [묶음, 값(도감 젤리), 이름들] ─────────────
// id는 이 목록 순서대로 shop-1, shop-2 … 로 정해져요. 새 칭호는 맨 뒤에만 더하고, 중간에 넣거나 빼지 마세요.
const SHOP_GROUPS: [string, number, string][] = [
  ["영어 태그", 10, "MOOD VIBE ZZZ LUV WAVE NOVA AURA BLUE CALM COZY DAWN DUSK ECHO GLOW HAZE HOPE JAZZ LUNA MINT MIST NEON PEAK PINK PURE RAIN ROSE SAGE SNOW SOFT SOLO SYNC TIDE VOID WILD WISH ZERO ZEST BOLD COOL CUTE EASY FREE HYPE LOFI LUCK MOON NERD OKAY POP RAD SUN SKY YAY ZEN BUZZ CHEF FOMO OMG YOLO WOW HIHI BYE"],
  ["게임 용어", 20, "GG GLHF AFK BRB LOL OP NPC PVP RPG FPS TANK HEAL DPS BUFF NERF META LAG PING RAGE TRIO AIM HP MP EXP LVUP KDA DUOQ 1V1 5V5 RUSH CAMP LOOT 캐리 버스 고인물 뉴비 원딜 정글 탑신 미드 서폿 힐러 탱커 딜러 에임 피지컬 뇌지컬 한타 존버 랭커 티어 승률 연승 각성 역캐 하드캐리 보스 막타 파밍 칼각 무빙 갱킹 와드 백도어 풀피"],
  ["유행어", 30, "킹받 찐 가보자고 럭키비키 원영적 갓벽 아싸 MZ 꾸안꾸 어쩔 저쩔 쌉가능 개꿀 꿀잼 노잼 텐션 하이텐션 갓생 소확행 오운완 중꺾마 반모 칼답 짤부자 밈장인 인싸템 TMI 몰루 ㄱㄱ ㅇㅈ 실화 레알 인정 ㄹㅇ 존맛 JMT 꿀팁 대박 띵작 갓겜 국룰 찐텐 할많하않 머쓱 별다줄 뇌절 스불재 아무말 혼코노 퇴사각 출첵 오히려 킹갓"],
  ["하루와 기분", 30, "몽글 새벽 느긋 감성 낭만 야행성 포근 산들 반짝 말랑 꿀잠 졸림 출근 퇴근 칼퇴 월요병 불금 주말 방학 휴가 집순 집돌 귀차니 무념 멍때림 힐링 행복 평화 여유 낮잠 밤샘 올빼미 아침형 설렘 두근 심쿵 시크 츤데레 열정 냉정 엉뚱 해맑 수줍 당당 느림보 부지런 덤벙 꼼꼼 소심 대범 낙천 진지 장난꾼 개구짐 엉망 단순 복잡 배고픔"],
  ["간식", 20, "커피 라떼 녹차 딸기 복숭아 레몬 체리 수박 귤 망고 초코 바닐라 민초 반민초 떡볶이 치킨 피자 라면 국밥 마라 탕후루 붕어빵 호떡 고구마 마카롱 쿠키 푸딩 젤리빈 솜사탕 팝콘 아아 따아 버블티 콜라 사이다 우유 식혜 김밥 만두 쭈꾸미"],
  ["자연과 하늘", 50, "구름 하늘 바다 노을 별빛 달빛 은하 우주 오로라 무지개 햇살 소나기 눈송이 벚꽃 단풍 파도 바람 숲속 이슬 안개 새싹잎 첫눈 한여름 봄바람 가을밤 겨울잠 유성 혜성 성운 일출"],
  ["동물", 50, "여우 늑대 토끼 펭귄 수달 판다 햄찌 다람쥐 부엉이 고래 상어 돌고래 해달 알파카 라쿤 너구리 사막여우 미어캣 코알라 치타 호랑이 사자 독수리 까마귀 두더지 거북이 문어 해파리 오리 병아리"],
  ["판타지", 80, "마법사 기사 용사 마왕 성기사 궁수 도적 암살자 소환사 연금술사 엘프 요정 천사 악마 뱀파이어 닌자 사무라이 해적 선장 드루이드 사제 마녀 흑마법 음유시인 현자 방랑자 수호자 파수꾼 검성 대마법사 용기사 정령사 네크로"],
  ["직업", 50, "대표 사장 부장 과장 대리 사원 인턴 알바 교수 박사 학생 백수 프로 장인 달인 고수 초보 견습 매니저 감독 코치 주장 막내 반장 회장 총무 이장 경비 기자 작가 화가 가수 DJ 셰프 바리스타 탐정 형사 의사 간호사 선생님"],
  ["특별", 100, "ICON GOAT STAR 24H 365 777 404 1004 99% 100% 0101 1st NO.1 MAX 999 2026 7777 24/7"],
];

// ── 활동으로 얻는 칭호: 단계마다 [조건 값, 이름] ─────────────
// id는 조건으로 정해져요(예: lv-30). 값을 바꾸면 id도 바뀌니 조심하세요.
type Ladder = { group: string; id: string; steps: [number, string][]; rule: (v: number) => TitleRule };
const steps = (values: number[], names: string): [number, string][] => {
  const n = names.split(' ');
  if (n.length !== values.length) throw new Error(`칭호 단계 수가 달라요: ${names}`);
  return values.map((v, i) => [v, n[i]!]);
};
const every5 = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);
const LADDERS: Ladder[] = [
  { group: '카드 레벨', id: 'lv', rule: (level) => ({ kind: 'bestLevel', level }),
    steps: steps(every5, '첫인연 인연 친분 단골 동료 BFF 찐친 베프 짝꿍 소꿉 동반자 DUO 파트너 전우 의형제 영혼짝 운명 반쪽 단짝신 SOUL') },
  { group: '카드 레벨', id: 'friends10', rule: (count) => ({ kind: 'friends', level: 10, count }),
    steps: steps([3, 5, 10, 15, 20, 30, 40, 50], '친화력 사교적 인싸 분위기 인기쟁이 핵인싸 인맥왕 셀럽') },
  { group: '카드 레벨', id: 'friends30', rule: (count) => ({ kind: 'friends', level: 30, count }),
    steps: steps([1, 3, 5, 10, 20], '절친 의리 우정 우정왕 우정신') },
  { group: '카드 레벨', id: 'friends60', rule: (count) => ({ kind: 'friends', level: 60, count }),
    steps: steps([1, 3, 5, 10], '단짝 끈끈 찰떡 꿀조합') },
  { group: '카드 레벨', id: 'friends100', rule: (count) => ({ kind: 'friends', level: 100, count }), steps: steps([1, 3], '평생 영원') },
  { group: '내 레벨', id: 'own', rule: (level) => ({ kind: 'ownLevel', level }),
    steps: steps(every5, '새싹 떡잎 풋내기 견습생 도전자 성장중 꾸준 노력파 실력자 숙련자 베테랑 상급자 명수 명인 마스터 그랜드 전설 신화 초월 만렙') },
  { group: '도감', id: 'cards', rule: (count) => ({ kind: 'cards', count }),
    steps: steps([5, 10, 15, 20, 30, 40, 50, 60, 80, 100], '수집가 탐험가 여행자 마당발 발도장 도감러 수집왕 컬렉터 대도감 완성형') },
  ...([
    [2, '참가자 성실 열심 ACE 엘리트 완벽'],
    [4, '꾸준히 모범생 우등생 해결사 퀘신 무결점'],
    [8, '개근상 장기전 철인 레전드 퀘장인 불멸'],
  ] as [number, string][]).map(
    ([seasons, names]): Ladder => ({
      group: '모둠 퀘스트',
      id: `rate-s${seasons}`,
      rule: (pct) => ({ kind: 'questRate', rate: pct / 100, seasons }),
      steps: steps([30, 50, 70, 80, 90, 100], names),
    }),
  ),
  { group: '모둠 퀘스트', id: 'clear', rule: (count) => ({ kind: 'fullClear', count }),
    steps: steps([1, 2, 3, 5, 7, 10, 15, 20], '올클 더블클 PRO 클리어 행운7 텐클 무패 전설팀') },
  { group: '모둠 퀘스트', id: 'season', rule: (count) => ({ kind: 'seasons', count }),
    steps: steps([1, 2, 3, 5, 10, 20], '신입 재학생 고학년 고참 원년 화석') },
  { group: '빙고', id: 'bingo', rule: (count) => ({ kind: 'bingo', count }),
    steps: steps([1, 5, 10, 20, 30, 50, 75, 100, 150, 200], '첫빙고 빙고 럭키 빙고러 빙고광 빙고킹 행운아 잭팟 대박빙고 빙고신') },
  { group: '빙고', id: 'full', rule: (count) => ({ kind: 'bingoFull', count }),
    steps: steps([1, 3, 5, 10, 20], '판쓸이 꽉꽉 올빙고 빙고장인 빙고전설') },
  { group: '칭찬', id: 'got', rule: (count) => ({ kind: 'praiseGot', count }),
    steps: steps([1, 5, 10, 20, 30, 50, 100, 200, 300], '첫칭찬 뿌듯 호감 인기 사랑둥이 칭찬왕 하트부자 국민호감 칭찬신') },
  { group: '칭찬', id: 'gave', rule: (count) => ({ kind: 'praiseGave', count }),
    steps: steps([1, 5, 10, 20, 30, 50, 100, 200, 300], '따뜻 상냥 다정 친절 응원단 박수왕 엔젤 미담 칭찬요정') },
  { group: '통화', id: 'voice', rule: (hours) => ({ kind: 'voiceHours', hours }),
    steps: steps([10, 30, 50, 100, 200, 300, 500, 1000], '수다 수다쟁이 입담 토크왕 통화왕 목소리 라디오 마이크신') },
];

let shopNo = 0;
export const TITLES: Title[] = [
  ...SHOP_GROUPS.flatMap(([group, price, names]) =>
    names.split(' ').map((name): Title => ({ id: `shop-${++shopNo}`, name, group, rule: { kind: 'shop', price } })),
  ),
  ...LADDERS.flatMap((l) => l.steps.map(([v, name]): Title => ({ id: `${l.id}-${v}`, name, group: l.group, rule: l.rule(v) }))),
];

export const TITLE_GROUPS = [...new Set(TITLES.map((t) => t.group))];
const BY_ID = new Map(TITLES.map((t) => [t.id, t]));
export const titleById = (id: unknown): Title | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);
export const titleName = (id: string | null | undefined): string | null => (id ? (BY_ID.get(id)?.name ?? null) : null);
export const titleItemId = (id: string) => `title:${id}`;

// 칭호 조건에 쓰는 기록
export type TitleStats = {
  bestXp: number;
  ownXp: number; // 내 카드(혼자 쌓은) 경험치
  friendXps: number[]; // 내 카드들의 경험치
  cards: number;
  seasons: { done: number; total: number }[]; // 끝난 시즌마다 내 모둠 퀘스트
  fullClears: number; // 시즌 모둠 완주 칭호를 받은 수
  bingoLines: number;
  bingoFull: number;
  praiseGot: number;
  praiseGave: number;
  voiceSeconds: number;
};

export type TitleProgress = { ok: boolean; text: string; now?: string };

export function titleProgress(t: Title, s: TitleStats): TitleProgress {
  const r = t.rule;
  const count = (n: number, need: number, text: string, unit: string): TitleProgress => ({
    ok: n >= need,
    text,
    now: `${n}/${need}${unit}`,
  });
  switch (r.kind) {
    case 'shop':
      return { ok: false, text: `도감 젤리 ${r.price}개로 사요` };
    case 'bestLevel': {
      const lv = levelFromXp(s.bestXp);
      return { ok: lv >= r.level, text: `카드 한 장을 Lv${r.level}까지`, now: `최고 Lv${lv}` };
    }
    case 'ownLevel': {
      const lv = levelFromXp(s.ownXp);
      return { ok: lv >= r.level, text: `내 카드 Lv${r.level}`, now: `Lv${lv}` };
    }
    case 'friends': {
      const need = xpForLevel(r.level);
      return count(s.friendXps.filter((xp) => xp >= need).length, r.count, `Lv${r.level} 넘은 카드 ${r.count}장`, '장');
    }
    case 'cards':
      return count(s.cards, r.count, `도감 카드 ${r.count}장 모으기`, '장');
    case 'questRate': {
      const done = s.seasons.reduce((a, x) => a + x.done, 0);
      const total = s.seasons.reduce((a, x) => a + x.total, 0);
      const rate = total ? done / total : 0;
      return {
        ok: s.seasons.length >= r.seasons && rate >= r.rate,
        text: `시즌 ${r.seasons}번 이상, 모둠 퀘스트 성공률 ${Math.round(r.rate * 100)}% 이상`,
        now: `시즌 ${s.seasons.length}번 · ${Math.floor(rate * 100)}%`,
      };
    }
    case 'fullClear':
      return count(s.fullClears, r.count, `모둠 퀘스트 8개를 다 깬 시즌 ${r.count}번`, '번');
    case 'seasons':
      return count(s.seasons.length, r.count, `시즌 ${r.count}번 끝까지 함께하기`, '번');
    case 'bingo':
      return count(s.bingoLines, r.count, `빙고 ${r.count}줄 채우기`, '줄');
    case 'bingoFull':
      return count(s.bingoFull, r.count, `빙고판 ${r.count}번 다 채우기`, '번');
    case 'praiseGot':
      return count(s.praiseGot, r.count, `칭찬 ${r.count}번 받기`, '번');
    case 'praiseGave':
      return count(s.praiseGave, r.count, `칭찬 ${r.count}번 하기`, '번');
    case 'voiceHours':
      return count(Math.floor(s.voiceSeconds / 3600), r.hours, `같이 통화 ${r.hours}시간`, '시간');
  }
}

// 디스코드 닉네임에서 칭호(「..」)와 관리자 왕관(👑)을 떼요. 봇과 같은 모양이에요.
const LEAD_RE = /^(?:\u{1F451}\u{FE0F}?\s*)+/u;
const TAIL_RE = /(?:\s*\u{1F451}\u{FE0F}?)+$/u;
const TITLE_RE = new RegExp(`^\u300c[^\u300c\u300d\\s]{1,${TITLE_MAX}}\u300d (?=\\S)`, 'u');
export const stripTitle = (name: string): string => {
  const rest = name.replace(LEAD_RE, '').replace(TITLE_RE, '');
  const core = rest.replace(TAIL_RE, '');
  return core || rest;
};
