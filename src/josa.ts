// 한국어 조사 붙이기: 받침에 따라 「이에요/예요」「으로/로」처럼 골라요. 한글로 끝나지 않으면 두 꼴을 함께 적어요.
const jong = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 ? c % 28 : -1;
};
// 받침이 있으면 a, 없으면 b (예: jo('단비', '이에요', '예요') → 단비예요)
export const jo = (w: string, a: string, b: string) => {
  const j = jong(w);
  return w + (j < 0 ? `${b}(${a})` : j ? a : b);
};
// 「(으)로」: 받침이 없거나 ㄹ 받침이면 「로」(교실로), 그 밖의 받침은 「으로」(창고 → 창고로, 부엌 → 부엌으로)
export const ro = (w: string) => {
  const j = jong(w);
  return w + (j < 0 ? '(으)로' : j === 0 || j === 8 ? '로' : '으로');
};
