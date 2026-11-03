import { levelFromXp, xpForLevel } from './levels';

// 도감 칭호. 고르면 하리보봇이 디스코드 닉네임 앞에 `[칭호] `로 붙여요(닉네임·생년과는 따로).
// 디스코드 서버 태그처럼 4글자까지예요. 이름·조건·값은 여기서만 바꾸면 돼요.
// 이미 누가 얻은 칭호의 id는 바꾸지 마세요(얻은 기록이 id로 남아요).
export const TITLE_MAX = 4;

export type TitleRule =
  | { kind: 'shop'; price: number }
  | { kind: 'bestLevel'; level: number } // 카드 한 장을 이 레벨까지
  | { kind: 'friends'; level: number; count: number } // 이 레벨 넘은 카드가 몇 장
  | { kind: 'cards'; count: number } // 도감 카드 몇 장
  | { kind: 'questRate'; rate: number; seasons: number } // 끝난 시즌 모둠 퀘스트 성공률
  | { kind: 'fullClear'; count: number } // 모둠 퀘스트 8개를 다 깬 시즌 수
  | { kind: 'bingo'; count: number } // 빙고 줄 수(모두 합쳐서)
  | { kind: 'praiseGot'; count: number }
  | { kind: 'praiseGave'; count: number };

export type Title = { id: string; name: string; group: string; rule: TitleRule };

const shop = (id: string, name: string, price: number): Title => ({ id, name, group: '상점', rule: { kind: 'shop', price } });

export const TITLES: Title[] = [
  shop('mood', 'MOOD', 30),
  shop('vibe', 'VIBE', 30),
  shop('zzz', 'ZZZ', 30),
  shop('luv', 'LUV', 30),
  shop('mongle', '몽글', 30),
  shop('dawn', '새벽', 30),
  shop('easy', '느긋', 30),
  shop('wave', 'WAVE', 60),
  shop('nova', 'NOVA', 60),
  shop('emo', '감성', 60),
  shop('roman', '낭만', 60),
  shop('owl', '야행성', 60),
  shop('icon', 'ICON', 100),
  shop('goat', 'GOAT', 100),
  shop('godlife', '갓생', 100),
  { id: 'bond', name: '인연', group: '카드 레벨', rule: { kind: 'bestLevel', level: 10 } },
  { id: 'bff', name: 'BFF', group: '카드 레벨', rule: { kind: 'bestLevel', level: 30 } },
  { id: 'duo', name: 'DUO', group: '카드 레벨', rule: { kind: 'bestLevel', level: 60 } },
  { id: 'soul', name: 'SOUL', group: '카드 레벨', rule: { kind: 'bestLevel', level: 100 } },
  { id: 'insider', name: '인싸', group: '카드 레벨', rule: { kind: 'friends', level: 10, count: 10 } },
  { id: 'super-insider', name: '핵인싸', group: '카드 레벨', rule: { kind: 'friends', level: 10, count: 30 } },
  { id: 'wide', name: '마당발', group: '도감', rule: { kind: 'cards', count: 20 } },
  { id: 'steady', name: '성실', group: '모둠 퀘스트', rule: { kind: 'questRate', rate: 0.5, seasons: 2 } },
  { id: 'ace', name: 'ACE', group: '모둠 퀘스트', rule: { kind: 'questRate', rate: 0.8, seasons: 2 } },
  { id: 'allclear', name: '올클', group: '모둠 퀘스트', rule: { kind: 'fullClear', count: 1 } },
  { id: 'pro', name: 'PRO', group: '모둠 퀘스트', rule: { kind: 'fullClear', count: 3 } },
  { id: 'lucky', name: '럭키', group: '빙고·칭찬', rule: { kind: 'bingo', count: 10 } },
  { id: 'popular', name: '인기', group: '빙고·칭찬', rule: { kind: 'praiseGot', count: 30 } },
  { id: 'kind', name: '다정', group: '빙고·칭찬', rule: { kind: 'praiseGave', count: 30 } },
];

export const TITLE_GROUPS = [...new Set(TITLES.map((t) => t.group))];
const BY_ID = new Map(TITLES.map((t) => [t.id, t]));
export const titleById = (id: unknown): Title | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);
export const titleName = (id: string | null | undefined): string | null => (id ? (BY_ID.get(id)?.name ?? null) : null);
export const titleItemId = (id: string) => `title:${id}`;

// 칭호 조건을 보는 데 쓰는 기록
export type TitleStats = {
  bestXp: number;
  friendXps: number[]; // 내 카드들의 경험치
  cards: number;
  seasons: { done: number; total: number }[]; // 끝난 시즌마다 내 모둠 퀘스트
  fullClears: number; // 시즌 모둠 완주 칭호를 받은 수
  bingoLines: number;
  praiseGot: number;
  praiseGave: number;
};

export type TitleProgress = { ok: boolean; text: string; now?: string };

export function titleProgress(t: Title, s: TitleStats): TitleProgress {
  const r = t.rule;
  switch (r.kind) {
    case 'shop':
      return { ok: false, text: `도감 젤리 ${r.price}개로 사요` };
    case 'bestLevel': {
      const lv = levelFromXp(s.bestXp);
      return { ok: lv >= r.level, text: `카드 한 장을 Lv${r.level}까지`, now: `최고 Lv${lv}` };
    }
    case 'friends': {
      const need = xpForLevel(r.level);
      const n = s.friendXps.filter((xp) => xp >= need).length;
      return { ok: n >= r.count, text: `Lv${r.level} 넘은 카드 ${r.count}장`, now: `${n}/${r.count}장` };
    }
    case 'cards':
      return { ok: s.cards >= r.count, text: `도감 카드 ${r.count}장 모으기`, now: `${s.cards}/${r.count}장` };
    case 'questRate': {
      const done = s.seasons.reduce((a, x) => a + x.done, 0);
      const total = s.seasons.reduce((a, x) => a + x.total, 0);
      const rate = total ? done / total : 0;
      const pct = Math.round(rate * 100);
      return {
        ok: s.seasons.length >= r.seasons && rate >= r.rate,
        text: `시즌 ${r.seasons}번 이상, 모둠 퀘스트 성공률 ${Math.round(r.rate * 100)}% 이상`,
        now: `시즌 ${s.seasons.length}번 · ${pct}%`,
      };
    }
    case 'fullClear': {
      const n = s.fullClears;
      return { ok: n >= r.count, text: `모둠 퀘스트 8개를 다 깬 시즌 ${r.count}번`, now: `${n}/${r.count}번` };
    }
    case 'bingo':
      return { ok: s.bingoLines >= r.count, text: `빙고 ${r.count}줄 채우기`, now: `${s.bingoLines}/${r.count}줄` };
    case 'praiseGot':
      return { ok: s.praiseGot >= r.count, text: `칭찬 ${r.count}번 받기`, now: `${s.praiseGot}/${r.count}번` };
    case 'praiseGave':
      return { ok: s.praiseGave >= r.count, text: `칭찬 ${r.count}번 하기`, now: `${s.praiseGave}/${r.count}번` };
  }
}

// 디스코드 닉네임 앞에 붙은 칭호 떼기. 봇과 같은 모양(`[..] `)이에요.
const TITLE_RE = new RegExp(`^\\[[^\\[\\]\\s]{1,${TITLE_MAX}}\\] (?=\\S)`);
export const stripTitle = (name: string): string => name.replace(TITLE_RE, '');
