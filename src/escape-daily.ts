// 오늘의 사건(나리 2026-11-19): 하루에 한 번, 내가 해결한 사건 하나를 범인·단서·물건 자리를 새로 섞어 다시 풀어요.
// - 재수사와 같은 규칙: 힌트 없음, 답(비밀번호·장치 확인·범인)을 3번 틀리면 실패.
// - 하루에 한 번만(시작하면 그날 기회를 쓴 거예요). 날짜는 한국 시간 아침 6시에 바뀌어요.
// - 기록(해결한 날 수, 연속 해결, 그날 걸린 시간)이 남아요. 숙제처럼 되지 않게(나리 2026-11-19).
// - 보상(멍쑤님 제안, 나리 2026-11-21): 답을 1번까지만 틀리고 해결하면 겜블장 젤칩 100개. 2번 틀리고 해결하면 없어요.
//   재수사도 같은 기준으로 사건마다 처음 한 번 100개(나리 2026-11-21). 0으로 바꾸면 재수사 젤칩만 꺼져요.
// - 다시 푸는 판(재수사·오늘의 사건)은 숫자·판을 바꾼 수수께끼를 써요(src/escape-bank-re.ts, 나리 2026-11-21 「숫자만 바꾸기」).
//   처음 판의 답으로는 풀리지 않아요. 다시 푸는 판끼리는 같은 수수께끼이고, 범인·단서·자리만 판마다 섞여요.
import { STORY_SEEDS } from './escape-stories';
import { gameDay } from './day';

// 나리 2026-11-19 켬("오늘의 사건도 배포해줘"). false로 바꿔 배포하면 화면에서 사라지고 시작도 안 돼요.
export const DAILY_OPEN = true;

// 오늘의 사건·재수사 젤칩: 틀린 답이 이 수 이하로 해결하면 받아요(migrations/0072)
export const DAILY_CHIP_REWARD = 100;
export const DAILY_CHIP_MAX_MISTAKES = 1;
export const RE_CHIP_REWARD = 100;
export const RE_CHIP_RULE = RE_CHIP_REWARD > 0 ? `답을 ${DAILY_CHIP_MAX_MISTAKES}번까지만 틀리고 해결하면 사건마다 처음 한 번 겜블장 젤칩 ${RE_CHIP_REWARD}개를 받아요.` : '보상 없이 기록만 남아요.';
export const DAILY_CHIP_RULE = `답을 ${DAILY_CHIP_MAX_MISTAKES}번까지만 틀리고 해결하면 겜블장 젤칩 ${DAILY_CHIP_REWARD}개를 받아요.`;
export const dailyChipsEarned = (won: boolean, mistakes: number, re = false) => (won && mistakes <= DAILY_CHIP_MAX_MISTAKES ? (re ? RE_CHIP_REWARD : DAILY_CHIP_REWARD) : 0);

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
