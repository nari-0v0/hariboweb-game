// 사건파일 물건 그림: 사건 데이터의 이모지 → 나리님이 만든 그림(public/case/obj/*.webp, scripts/build_sprites.py).
// 열리는 물건은 닫힌 그림과 열린 그림이 따로 있어요. 그림이 없는 이모지는 이모지 그대로 보여요.
import { SPRITES } from './sprites.gen';

const OPENABLE: Record<string, string> = {
  '🚪': 'door', '🗃️': 'cabinet', '🗄️': 'cabinet', '📦': 'chest', '🧰': 'chest', '🧳': 'chest', '💼': 'chest',
  '🎁': 'jewel', '💎': 'jewel', '🔐': 'safe', '🧊': 'fridge',
};
const SINGLE: Record<string, string> = {
  '🕰️': 'clock', '⏰': 'alarm', '⌚': 'watch', '⏱️': 'metronome', '📅': 'calendar', '📋': 'board',
  '📝': 'crumpled', '🗒️': 'pinned', '📌': 'pinned', '🃏': 'card', '📁': 'folder', '📜': 'scroll', '🎼': 'sheet', '📘': 'folder',
  '🖼️': 'frame', '🌌': 'starframe', '🎨': 'chart', '🖌️': 'chart', '🧮': 'blackboard', '🪟': 'window', '🪞': 'mirror',
  '🪴': 'plant', '💐': 'flowers', '🐠': 'fishbowl', '🔘': 'buttons', '🧺': 'basket', '🌍': 'globe',
  '📚': 'shelf', '🎹': 'piano', '🖥️': 'computer', '💡': 'lamp-on', '🔌': 'lamp-off', '🛏️': 'bed',
  '🪑': 'chair', '🛋️': 'cushion', '👟': 'shoes', '☂️': 'umbrella', '🧹': 'broom', '🕯️': 'candle',
  '☕': 'mug', '🫖': 'kettle', '🧸': 'teddy', '🐈': 'cat', '🤖': 'robot', '🕳️': 'drain',
};

export type CasePic = { src: string; w: number; h: number };
// box = 그림이 들어갈 네모 한 변(cqw). 긴 쪽을 box에 맞춰요.
function pic(key: string, box: number): CasePic | null {
  const src = `/case/obj/${key}.webp`;
  const size = SPRITES[src];
  if (!size) return null;
  const m = Math.max(size[0], size[1]);
  return { src, w: +((box * size[0]) / m).toFixed(2), h: +((box * size[1]) / m).toFixed(2) };
}

// open = 지금 열린 모습으로 보여 줄지. was = 방금 열렸으면 닫힌 그림(사라지는 움직임용)
export function casePics(emoji: string, open: boolean, big: boolean): { now: CasePic; was: CasePic | null } | null {
  const box = big ? 15 : 10;
  const o = OPENABLE[emoji];
  if (o) {
    const closed = pic(o, box);
    const opened = pic(`${o}-open`, box);
    if (!closed || !opened) return null;
    return { now: open ? opened : closed, was: open ? closed : null };
  }
  const s = SINGLE[emoji];
  const p = s ? pic(s, box) : null;
  return p ? { now: p, was: null } : null;
}
export const caseArtKeys = () => ({ openable: Object.values(OPENABLE), single: Object.values(SINGLE) });

// 가방 속 소지품 그림(public/case/item/*.webp)
const ITEM: Record<string, string> = {
  '🔑': 'key', '🗝️': 'oldkey', '🔦': 'flashlight', '🪛': 'driver', '🔋': 'battery', '🪜': 'ladder',
  '🪵': 'wood', '💡': 'bulb', '🔩': 'screw', '🪣': 'bucket', '🍶': 'bottle', '🚿': 'shower',
  '🔎': 'magnifier', '🔍': 'magnifier', '🥢': 'chopsticks', '🧲': 'magnet', '🧶': 'yarn', '🎣': 'rod', '🔨': 'hammer',
};
export function itemPic(emoji: string | undefined): string | null {
  const k = emoji && ITEM[emoji];
  return k && SPRITES[`/case/item/${k}.webp`] ? `/case/item/${k}.webp` : null;
}
