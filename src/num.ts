// 숫자에 천 단위 쉼표(1234567 -> "1,234,567"). toLocaleString('ko-KR')과 같은 결과인데,
// 그건 처음 부를 때 언어 자료를 불러오느라 몇 ms씩 걸려서(무료 요금제는 요청 한 번에 10ms) 직접 붙여요.
export function comma(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const [int, frac] = String(Math.abs(n)).split('.');
  const body = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + body + (frac ? '.' + frac.slice(0, 3).replace(/0+$/, '') : '');
}

// 글자 순서 비교(가나다·숫자). localeCompare도 처음 부를 때 느려서 코드 순서로 비교해요.
// 한글 음절은 코드 순서가 가나다 순서와 같아요.
export const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
