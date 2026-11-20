// 오늘의 사건(나리 2026-11-19): 하루에 한 번, 내가 해결한 사건 하나를 범인·단서·물건 자리를 새로 섞어 다시 풀어요.
// - 재수사와 같은 규칙: 힌트 없음, 답(비밀번호·장치 확인·범인)을 3번 틀리면 실패.
// - 하루에 한 번만(시작하면 그날 기회를 쓴 거예요). 날짜는 한국 시간 아침 6시에 바뀌어요.
// - 보상은 없고 기록만(해결한 날 수, 연속 해결, 그날 걸린 시간). 숙제처럼 되지 않게(나리 2026-11-19).
// - 수수께끼는 같아서 숫자만 바꾼 문제는 만들지 않아요(사건파일이 계산 문제처럼 느껴진다는 나리 의견).
import { STORY_SEEDS } from './escape-stories';
import { gameDay } from './day';

// 나리 2026-11-19 켬("오늘의 사건도 배포해줘"). false로 바꿔 배포하면 화면에서 사라지고 시작도 안 돼요.
export const DAILY_OPEN = true;

// 도감 날짜(한국 시간 아침 6시에 바뀌어요. src/day.ts)
export const kstDay = (now: Date) => gameDay(now);
// 그날의 섞은 판 번호. 다시 열기 판 번호(그 사건을 시작한 횟수)와 겹치지 않게 크게 잡아요.
export const dailyVariant = (day: string) => 100_000 + Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

// 섞을 수 있는 사건(이야기 씨앗으로 만든 사건). 입문 사건과 대화 사건은 섞이지 않아서 빼요.
const MIXABLE = new Set(STORY_SEEDS.map((x) => x.id));
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
// 오늘 풀 사건: 내가 해결한 섞을 수 있는 사건 중 하나(사람·날짜마다 정해져요). 없으면 null.
export function dailyPick(user: string, day: string, solved: Iterable<string>): string | null {
  const pool = [...new Set(solved)].filter((id) => MIXABLE.has(id)).sort();
  return pool.length ? pool[hash(`${user}:${day}`) % pool.length]! : null;
}

export const prevDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
// 지금 보여 줄 연속 해결: 마지막으로 해결한 날이 오늘이나 어제면 이어지는 중, 아니면 끊겼어요(0)
export const shownStreak = (streak: number, lastDay: string | null, today: string) => (lastDay === today || lastDay === prevDay(today) ? streak : 0);
