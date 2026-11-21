// 겜블장 잠금 스위치(나리 2026-11-15에 잠가 달라고 함). 다시 열려면 false로 바꿔요.
// true면 메뉴에 🔒로 보이고, 겜블장 주소로 들어가도 잠금 안내만 보여요. 젤칩·순위 기록은 그대로 남아요.
export const GAMBLE_LOCKED = false;

// 잠겨 있어도 시험해 볼 수 있는 사람(wrangler.jsonc의 GAMBLE_TESTERS). 메뉴는 똑같이 🔒로 보이고, /gamble 주소로 직접 들어가요.
export const gambleTester = (testers: string | undefined, userId: string) =>
  (testers ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(userId);

// 처음 겜블장에 들어오면 받는 시작 젤칩(게임 기록 초기화 뒤에도 이만큼)
export const DAILY_CHIPS = 1000;
// 2026-11-21 나리: 매일 주던 젤칩은 없애고, 젤칩이 0개 이하일 때만 하루 한 번 300개로 채워 줘요(부스터 400개).
export const REFILL_CHIPS = 300;
export const BOOSTER_REFILL_CHIPS = 400; // 디스코드 서버 부스터(나리 2026-11-21)
/** @deprecated 예전 이름. 부스터 채워 주기 양이에요. */
export const BOOSTER_DAILY_CHIPS = BOOSTER_REFILL_CHIPS;
// 2026-11-18 나리: 점검 보고서 W34–W38(평균이 100%를 넘어 계속 하면 칩이 불어남)을 고쳐 달라고 함.
// 배수는 그대로 두고 나올 확률만 바꿔 평균을 100%보다 조금 낮게(약 99.3%) 맞췄어요(예전 약 103.4%).
export const SLOTS = [
  { weight: 37, payout: 3 },
  { weight: 35, payout: 5 },
  { weight: 25, payout: 7 },
  { weight: 3, payout: 10 },
] as const;
export const CHERRY_PAIR = 2;
// 2026-11-15 나리: 판 그림은 같은 크기 6칸(×0 ×1 ×2 ×3 ×5 ×10)이고, 나올 확률만 따로 정해요.
// (예전 ×0.5·×1.5는 1젤칩이면 내림해서 어차피 0·1배라 뺐어요.) 예전 0.5·1.5 확률은 0·1배에 합치고,
// count = 100번 중 몇 번(=%)이에요.
// 2026-11-18 나리: 평균 1.04배(조금 따는 쪽)를 0.99배로 낮췄어요(5배 칸 3% → 2%, 0배 칸 48% → 49%).
export const ROULETTE = [
  { payout: 0, count: 49 }, { payout: 1, count: 25 }, { payout: 2, count: 15 },
  { payout: 3, count: 8 }, { payout: 5, count: 2 }, { payout: 10, count: 1 },
] as const;
export const WHEEL = ROULETTE.flatMap(({ payout, count }) => Array<number>(count).fill(payout));
// 건 칩 × 배수를 내림한 만큼 돌려받아요(예전 동전 2.05배·룰렛 0.5배·1.5배 기록).
// 2.05 같은 배수는 부동소수점 오차가 나서(100×2.05=204.999…) 백분율 정수로 계산해요. DB 트리거·순위 계산과 같은 방식이에요.
export const payback = (bet: number, multiplier: number) => Math.floor(bet * Math.round(multiplier * 100) / 100);

// 동전 던지기(나리 2026-11-13): 곰(앞)·발바닥(뒤) 중 하나를 골라 맞히면 2배.
// 2026-11-15 나리: 배수는 2.05배처럼 소수 말고 정수로 딱 떨어지게(예전 2.05배 기록은 그대로 남고 계산도 그대로 맞아요).
// 2026-11-21 점검: 반반(50%)에 2배면 평균이 딱 100%라 다른 게임처럼 100%보다 조금 낮게, 맞힐 확률을 49.5%로 했어요(평균 99%).
export const COIN_SIDES = ['heads', 'tails'] as const;
export type CoinSide = (typeof COIN_SIDES)[number];
export const COIN_PAYOUT = 2;
export const isCoinSide = (v: unknown): v is CoinSide => v === 'heads' || v === 'tails';
export type CoinFlip = { pick: CoinSide; side: CoinSide };
// 1000번 중 COIN_WIN_PER_MILLE번 맞혀요.
export const COIN_WIN_PER_MILLE = 495;
export const flipCoin = (pick: CoinSide): CoinFlip => {
  const win = randomBelow(1000) < COIN_WIN_PER_MILLE;
  return { pick, side: win ? pick : pick === 'heads' ? 'tails' : 'heads' };
};
export const coinPayout = (flip: CoinFlip) => (flip.pick === flip.side ? COIN_PAYOUT : 0);

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
  // 2026-11-19 나리 "좀 낮춰": 첫 두 장 21은 A와 그림 카드(J·Q·K)면 3배, A와 10이면 2배.
  // 무승부는 그대로 1배예요. 평균이 약 100.3% → 약 99.1%(다른 게임과 비슷, 배수는 정수).
  if (player) return hand.player.some((card) => rankOf(card) >= 10) ? 3 : 2;
  return dealer ? 0 : null;
}

export function playHand(hand: Hand, move: CardMove): number | null {
  if (move === 'hit') {
    hand.player.push(hand.deck.pop()!);
    const score = cardScore(hand.player);
    if (score > 21) return 0;
    // 21점이 되면 더 받을 이유가 없어서(받으면 무조건 넘어요) 저절로 멈춰요(2026-11-21 점검).
    if (score < 21) return null;
  }
  while (cardScore(hand.dealer) < 17) hand.dealer.push(hand.deck.pop()!);
  const player = cardScore(hand.player);
  const dealer = cardScore(hand.dealer);
  if (dealer > 21 || player > dealer) return 2;
  if (player === dealer) return 1;
  return 0;
}
