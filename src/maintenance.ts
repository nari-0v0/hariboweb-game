// 문제가 생겼을 때 보여 줄 화면을 정해요(나리 2026-11-18).
// 1) 점검: 나리가 Cloudflare 설정 > 변수에 MAINTENANCE를 넣으면 모든 화면이 "점검 중이에요!"로 바뀌어요.
//    값에 시간을 적으면(예: 11월 20일 22:00~23:00) 그 시간을 보여 줘요. 1만 넣으면 시간 없이 보여요.
// 2) DB 한도: 무료 하루 사용량에 닿으면 "DB가 가득 찼어요!"
// 3) 그 밖의 오류: "오류가 생겼어요!"

const OFF = new Set(['', '0', 'false', 'off']);
export const maintenanceOn = (v: string | undefined) => v !== undefined && !OFF.has(v.trim().toLowerCase());
// 화면에 보여 줄 점검 시간(1·true처럼 켜기만 한 값이면 없음)
export const maintenanceWhen = (v: string | undefined) => {
  const t = (v ?? '').trim().slice(0, 60);
  return t === '1' || t.toLowerCase() === 'true' || t.toLowerCase() === 'on' ? '' : t;
};

// 그림 파일은 점검 중에도 그대로 줘요(점검 화면이 쓰는 그림도 있어요).
export const maintenanceSkips = (path: string) => /^\/(char|case|journey)\//.test(path);

// D1 사용량 한도에 닿아서 난 오류인지(하루 읽기·쓰기 한도, 용량 한도).
export function isDbLimit(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const text = `${err.message}\n${err.stack ?? ''}`;
  const fromD1 = /D1_|cloudflare-internal:d1-api/.test(text);
  return fromD1 && /exceed|limit|quota|maximum/i.test(err.message);
}
