export const DAILY_CHIPS = 1000;
export const SLOTS = [
  { weight: 39, payout: 3 },
  { weight: 35, payout: 5 },
  { weight: 23, payout: 7 },
  { weight: 3, payout: 10 },
] as const;
export const CHERRY_PAIR = 2;
// 2026-11-12 나리: 판 그림은 같은 크기 8칸(×0 ×0.5 ×1 ×1.5 ×2 ×3 ×5 ×10)이고, 나올 확률만 따로 정해요.
// count = 100번 중 몇 번(=%)이에요. 평균 1.04배(조금 따는 쪽). 소수 배수는 받을 칩을 내림해요.
export const ROULETTE = [
  { payout: 0, count: 32 }, { payout: 0.5, count: 20 }, { payout: 1, count: 18 }, { payout: 1.5, count: 12 },
  { payout: 2, count: 9 }, { payout: 3, count: 5 }, { payout: 5, count: 3 }, { payout: 10, count: 1 },
] as const;
export const WHEEL = ROULETTE.flatMap(({ payout, count }) => Array<number>(count).fill(payout));
// 건 칩 × 배수를 내림한 만큼 돌려받아요(0.5배·1.5배 때문에).
export const payback = (bet: number, multiplier: number) => Math.floor(bet * multiplier);

export function randomBelow(n: number): number {
  const limit = 2 ** 32 - (2 ** 32 % n);
  const sample = new Uint32Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0]! >= limit);
  return sample[0]! % n;
}

const reel = SLOTS.flatMap(({ weight }, i) => Array<number>(weight).fill(i));
export const spinSlots = () => Array.from({ length: 3 }, () => reel[randomBelow(reel.length)]!);
export const spinWheel = () => randomBelow(WHEEL.length);

export function slotPayout(reels: readonly number[]): number {
  const [a, b, c] = reels;
  if (a !== undefined && a === b && b === c) return SLOTS[a]?.payout ?? 0;
  return reels.filter((symbol) => symbol === 0).length === 2 ? CHERRY_PAIR : 0;
}

export type Hand = { player: number[]; dealer: number[]; deck: number[] };
export type CardMove = 'hit' | 'stand';
export const rankOf = (card: number) => card % 13;

export function cardScore(cards: readonly number[]): number {
  const ranks = cards.map(rankOf);
  const low = ranks.reduce((total, rank) => total + Math.min(10, rank + 1), 0);
  return ranks.includes(0) && low <= 11 ? low + 10 : low;
}

export const natural = (cards: readonly number[]) => cards.length === 2 && cardScore(cards) === 21;

export function startHand(): Hand {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return { player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], deck };
}

export function openingPayout(hand: Hand): number | null {
  const player = natural(hand.player);
  const dealer = natural(hand.dealer);
  if (player && dealer) return 1;
  if (player) return 3;
  return dealer ? 0 : null;
}

export function playHand(hand: Hand, move: CardMove): number | null {
  if (move === 'hit') {
    hand.player.push(hand.deck.pop()!);
    return cardScore(hand.player) > 21 ? 0 : null;
  }
  while (cardScore(hand.dealer) < 17) hand.dealer.push(hand.deck.pop()!);
  const player = cardScore(hand.player);
  const dealer = cardScore(hand.dealer);
  if (dealer > 21 || player > dealer) return 2;
  return player === dealer ? 1 : 0;
}
