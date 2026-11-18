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

// D1 한도에 닿아서 난 오류인지, 어떤 한도인지.
// - 'daily': 무료 하루 읽기·쓰기 한도(한국 시간 아침 9시에 다시 채워져요)
// - 'storage': 저장 용량 한도(기다려도 안 풀려요. 방장이 정리해야 해요)
// 시간 초과·재시작·과부하 같은 잠깐 생기는 오류는 한도가 아니에요(일반 오류 화면).
export type DbLimit = 'daily' | 'storage';
export function dbLimitKind(err: unknown): DbLimit | null {
  if (!(err instanceof Error)) return null;
  const fromD1 = /D1_|cloudflare-internal:d1-api/.test(`${err.message}\n${err.stack ?? ''}`);
  const m = err.message;
  if (!fromD1 || /timeout|timed out|reset|overload|network|internal error|try again/i.test(m)) return null;
  if (/maximum (DB|database) size|storage (limit|quota)|account storage/i.test(m)) return 'storage';
  if (/daily|rows? (read|written)|exceed|quota|limit/i.test(m)) return 'daily';
  return null;
}
