export type GambleArt = { text: string; image?: string };

export const GAMBLE_ART: Record<string, GambleArt> = {
  slot: { text: '🎰' },
  roulette: { text: '🎡' },
  cards: { text: '🃏' },
  cherry: { text: '🍒' },
  lemon: { text: '🍋' },
  star: { text: '⭐' },
  seven: { text: '7️⃣' },
  spade: { text: '♠️' },
  heart: { text: '♥️' },
  diamond: { text: '♦️' },
  club: { text: '♣️' },
  hidden: { text: '🂠' },
};
export const SLOT_ART = ['cherry', 'lemon', 'star', 'seven'] as const;
export const SUIT_ART = ['spade', 'heart', 'diamond', 'club'] as const;
