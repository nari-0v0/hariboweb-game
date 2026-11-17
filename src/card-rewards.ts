// 도감 카드 장수 보상(멍쑤님 아이디어, 나리 2026-11-17): 도감 칭호 단계(5·10·15…100장)에 처음 닿을 때마다
// 도감 젤리를 한 번 줘요. 처음엔 빡빡하게(다 모아도 16개). 값은 여기서만 바꾸면 돼요.
// 카드는 지금 서버에 있는 멤버 카드만 세요. 한 번 받은 단계는 카드 수가 줄어도 다시 주지 않아요.
// 받는 일은 봇 동기화(src/sync.ts)에서 카드 경험치를 올린 다음 같은 묶음 안에서 해요.
import { titleName } from './titles';

export const CARD_JELLY: [cards: number, jelly: number][] = [
  [5, 1], [10, 1], [15, 1], [20, 1], [30, 1], [40, 2], [50, 2], [60, 2], [80, 2], [100, 3],
];

export type CardReward = { cards: number; jelly: number; title: string | null };
const reward = ([cards, jelly]: [number, number]): CardReward => ({ cards, jelly, title: titleName(`cards-${cards}`) });

// 다음에 받을 단계(다 받았으면 null)
export function nextCardReward(cards: number): CardReward | null {
  const s = CARD_JELLY.find(([n]) => n > cards);
  return s ? reward(s) : null;
}

// SQL에 쓰는 단계 표: (VALUES (5, 1), (10, 1), …)
export const CARD_JELLY_VALUES = `(VALUES ${CARD_JELLY.map(([n, j]) => `(${n}, ${j})`).join(', ')})`;
