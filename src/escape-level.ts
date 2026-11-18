// 사건파일 난이도(★ 1~3): 수수께끼 하나하나에 어려움 점수(1 쉬움 · 2 보통 · 3 어려움)를 매기고,
// 만든 사건은 수수께끼 다섯 개 점수를 더해서 쉬운 사건부터 ★, ★★, ★★★로 나눠요.
// 여기 없는 수수께끼는 2(보통)예요. 비율을 바꾸려면 아래 LEVEL_SPLIT 숫자만 바꾸면 돼요.
import { BANK, type BankItem } from './escape-bank';

const EASY = new Set([
  // 글 수수께끼
  'torn-leaf', 'tz009', 'tz010', 'tz012', 'tz021', 'tz030', 'tz032', 'tz035', 'tz036', 'tz040', 'tz044', 'tz050', 'tz062', 'tz071',
  'tz075', 'tz079', 'tz081', 'tz084', 'tz092', 'knockout', 'tz115', 'tz117', 'tz120', 'tz125', 'tz128', 'tz129', 'tz132', 'tz149',
  'tz154', 'tz157', 'tz162', 'tz167', 'tz176', 'tz181', 'tz182', 'tz186', 'tz188', 'tz190', 'domino', 'shadow', 'same-color', 'pets-sum',
  // 손으로 푸는 것
  'card-riddle', 'num-triangle', 'num-fillomino', 'num-magic', 'mark-twins', 'color-map3', 'river-farmer', 'path-maze',
]);
const HARD = new Set([
  // 글 수수께끼
  'tz007', 'tz022', 'tz025', 'tz029', 'tz037', 'tz039', 'tz041', 'tz047', 'tz049', 'tz052', 'chain-pay', 'tz077', 'tz086', 'tz087',
  'tz099', 'bertrand-card', 'tz102', 'tz111', 'tz113', 'tz119', 'donkey-carrots', 'tz133', 'tz142', 'tz153', 'tz155', 'tz161', 'tz163', 'monkey-jelly',
  'faro', 'tz170', 'tz173', 'tz174', 'tz184', 'tz185', 'tz187', 'tz193', 'tz194', 'code-logic', 'keys-worst', 'cups', 'hats',
  'poison', 'egg-drop', 'birthday', 'diag-tiles', 'self-count', 'cryptarithm', 'pirates', 'lion-days', 'cheryl', 'boat-stone',
  'ants', 'cards-split', 'lock-box', 'prime-code', 'hiker', 'race-handicap',
  // 손으로 푸는 것
  'slide-rush', 'slide-push', 'slide-ice2', 'jump-knights', 'jump-peg', 'stack-pancake', 'num-sudoku6', 'num-sky', 'num-kakuro',
  'num-killer', 'num-kenken', 'num-futoshiki', 'num-crosssum', 'mark-queens', 'mark-tents', 'mark-ships', 'mark-nonogram',
  'mark-binary', 'mark-akari', 'mark-hitori', 'divide-same4', 'divide-five', 'multi-wason', 'multi-liars', 'multi-coins',
  'multi-selfref', 'river-mothers', 'river-thieves', 'path-knight', 'path-loop', 'order-weights', 'order-truth', 'order-lie',
]);

export const riddleHardness = (b: BankItem): number => (EASY.has(b.idea) ? 1 : HARD.has(b.idea) ? 3 : 2);
// 수수께끼 번호(은행 번호 + 1) 목록 → 점수 합
export const handHardness = (refs: number[]): number => refs.reduce((s, n) => s + riddleHardness(BANK[n - 1]!), 0);

// 만든 사건 47개 중 쉬운 쪽부터 ★ 17개, ★★ 18개, 나머지 ★★★ (입문 3개는 ★, 대화 사건은 ★★★)
export const LEVEL_SPLIT = { one: 17, two: 18 };
