// 도감의 "하루"는 한국 시간 아침 6시에 바뀌어요(나리 2026-11-21). 새벽 0~6시는 아직 전날이에요.
// 출석·짝 카드 하루 한도(봇)·원정대 하루 보상·오늘의 사건·사건파일 부스터 동전·겜블 젤칩 충전·칭찬 횟수가 모두 이 기준이에요.
// 봇(services/dogam_sync.py)도 같은 6시 기준을 써요. 한쪽만 바꾸면 날짜가 어긋나요.
export const DAY_START_HOUR = 6;
const SHIFT_MS = (9 - DAY_START_HOUR) * 3_600_000; // UTC → (한국 시간 − 6시간)

// 도감 날짜(YYYY-MM-DD). 6시 정각에 다음 날짜가 돼요.
export const gameDay = (at: Date | number = new Date()) => new Date(typeof at === 'number' ? at + SHIFT_MS : at.getTime() + SHIFT_MS).toISOString().slice(0, 10);
// 그 도감 날짜가 시작하는 순간(한국 시간 아침 6시)
export const dayStartMs = (day: string) => Date.parse(`${day}T0${DAY_START_HOUR}:00:00+09:00`);
