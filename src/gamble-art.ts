export type GambleArt = { text: string; image?: string };

export const GAMBLE_ART: Record<string, GambleArt> = {
  slot: { text: '🎰' },
  roulette: { text: '🎡' },
  cards: { text: '🃏' },
  coinflip: { text: '🪙', image: '/gamble/coin-heads.webp?v=1' },
  cherry: { text: '🍒', image: '/gamble/cherry.webp?v=2' },
  lemon: { text: '🍋', image: '/gamble/lemon.webp?v=2' },
  star: { text: '⭐', image: '/gamble/star.webp?v=2' },
  seven: { text: '7️⃣', image: '/gamble/seven.webp?v=2' },
  spade: { text: '♠️' },
  heart: { text: '♥️' },
  diamond: { text: '♦️' },
  club: { text: '♣️' },
  coin: { text: '🪙', image: '/gamble/chip.webp?v=2' },
  slotFrame: { text: '', image: '/gamble/slot-frame.webp?v=2' },
  wheel: { text: '', image: '/gamble/wheel-rim.webp?v=2' },
  wheelDisc: { text: '', image: '/gamble/wheel-disc.webp?v=1' },
  pointer: { text: '▼', image: '/gamble/pointer.webp?v=2' },
  cardBack: { text: '🂠', image: '/gamble/card-back.webp?v=2' },
  cardFront: { text: '' },
  coinHeads: { text: '곰', image: '/gamble/coin-heads.webp?v=1' },
  coinTails: { text: '발바닥', image: '/gamble/coin-tails.webp?v=1' },
};
export const SLOT_ART = ['cherry', 'lemon', 'star', 'seven'] as const;
export const SUIT_ART = ['spade', 'heart', 'diamond', 'club'] as const;
