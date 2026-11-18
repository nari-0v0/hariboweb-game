// 시즌 모둠 퀘스트(500개 이상). "누가 × 무엇을 × 언제"를 조합해서 만들어요.
// 목표 숫자는 10명 모둠 기준이고 모둠 인원에 맞춰 늘거나 줄어요.
// 모두 봇이 보내는 기록(1분 통화방, 내전, 출석)과 웹 기록(칭찬, 카드, 로그인)으로 세요. 신청이나 인증은 없어요.

export type QuestDiff = 'easy' | 'normal' | 'hard';

// 한 모둠의 시즌 기록(웹이 D1에서 모아서 만들어요). 날짜는 모두 한국 날짜(YYYY-MM-DD).
export type GroupCtx = {
  // 시즌 첫날
  seasonStart: string;
  // 시즌 시작 때 모둠원 수(나간 사람 포함)
  startSize: number;
  // 지금 모둠원(나간 사람 빼고, 늦게 들어온 사람 포함)
  current: string[];
  // 시작 모둠원 중 아직 있는 사람("모둠원 모두" 퀘스트는 이 사람들만 세요)
  startCurrent: string[];
  voice: { day: string; hour: number; together: number; same: number; minutes: number }[];
  memberDay: { user: string; day: string; minutes: number }[];
  pairs: { a: string; b: string; minutes: number }[];
  rooms: number;
  bestRun: number;
  scrims: { game: string; day: string; members: string[]; newbies: number }[];
  newbie: { newbie: string; user: string; minutes: number }[];
  praises: { from: string; to: string; day: string; toNewbie: boolean }[];
  attend: { user: string; day: string }[];
  // 시즌에 새로 생긴 카드: 짝(정렬된 "a|b")과 새 카드를 얻은 모둠원
  newCardPairs: string[];
  newCardOwners: string[];
  // 모둠 안 짝 카드: 시즌 시작 레벨과 지금 레벨(짝마다 한 번)
  pairLevels: { from: number; now: number }[];
  // 내 카드 레벨이 시즌 동안 오른 모둠원
  ownLevelUp: string[];
  // 시즌 동안 웹 도감에 들어온 모둠원
  loggedIn: string[];
};

export type Quest = {
  id: string;
  name: string;
  cat: string;
  diff: QuestDiff;
  // 내전 퀘스트는 내전이 열릴 때만 뽑아요(SCRIM_QUESTS=1)
  scrim?: boolean;
  // c가 있으면 그 모둠에 맞춘 문구(작은 모둠의 짝 수 등)를 보여 줘요.
  text: (target: number, c?: GroupCtx) => string;
  target: (c: GroupCtx) => number;
  value: (c: GroupCtx) => number;
};

export const QUEST_REWARD: Record<QuestDiff, number> = { easy: 1, normal: 2, hard: 3 };
export const QUESTS_PER_GROUP: Record<QuestDiff, number> = { easy: 3, normal: 3, hard: 2 };
export const MAX_PER_CAT = 2;
// 모둠 통화는 하루 이만큼까지만 쳐요(하루 종일 하는 모둠과 직장인 모둠의 차이를 줄여요)
export const DAILY_VOICE_CAP = 240;
// 이 분 이상 같이 통화해야 "같이 통화한 짝/사람"으로 쳐요
export const PAIR_MINUTES = 10;
// 10명 모둠이 한 시즌(하루 4시간 상한 적용)에 모둠끼리 통화할 것으로 보는 분
const SEASON_VOICE = 1680;
const STARS: Record<QuestDiff, string> = { easy: '★', normal: '★★', hard: '★★★' };
const LEVEL_FACTOR: Record<QuestDiff, number> = { easy: 0.12, normal: 0.3, hard: 0.6 };

// ── 날짜 도우미 ──
const DAY_MS = 86_400_000;
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const weekday = (day: string) => new Date(dayMs(day)).getUTCDay(); // 0 일요일
const addDays = (day: string, n: number) => new Date(dayMs(day) + n * DAY_MS).toISOString().slice(0, 10);
const dayIndex = (c: GroupCtx, day: string) => Math.round((dayMs(day) - dayMs(c.seasonStart)) / DAY_MS);
const hours = (min: number) => (min % 60 === 0 ? `${min / 60}시간` : min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간 ${min % 60}분`);

// ── 언제(창) ──
type Win = {
  key: string;
  // 퀘스트 이름 앞말, 문장 앞말
  name: string;
  label: string;
  // 시간대(한국 시각) [시작, 끝)
  hours?: [number, number];
  // 날짜 조건(시즌 첫날부터 몇째 날인지 idx)
  day?: (day: string, idx: number) => boolean;
  // 한 시즌 활동 중 이 창이 차지할 것으로 보는 몫
  share: number;
  // 며칠짜리 창인지(날 수 퀘스트용)
  days: number;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_WINDOWS: Win[] = [
  { key: 'all', name: '', label: '', share: 1, days: 14 },
  { key: 'weekend', name: '주말', label: '주말(토·일)에 ', day: (d) => [0, 6].includes(weekday(d)), share: 0.35, days: 4 },
  { key: 'weekday', name: '평일', label: '평일(월~금)에 ', day: (d) => ![0, 6].includes(weekday(d)), share: 0.65, days: 10 },
  { key: 'week1', name: '첫 주', label: '시즌 첫 주(1~7일)에 ', day: (_, i) => i < 7, share: 0.5, days: 7 },
  { key: 'week2', name: '둘째 주', label: '시즌 둘째 주(8~14일)에 ', day: (_, i) => i >= 7, share: 0.5, days: 7 },
  { key: 'first3', name: '출발', label: '시즌 첫 3일 동안 ', day: (_, i) => i < 3, share: 0.21, days: 3 },
  { key: 'last3', name: '막판', label: '시즌 마지막 3일 동안 ', day: (_, i) => i >= 11, share: 0.21, days: 3 },
  ...WEEKDAYS.map((w, n) => ({
    key: `wd${n}`,
    name: `${w}요일`,
    label: `${w}요일에 `,
    day: (d: string) => weekday(d) === n,
    share: n === 0 || n === 6 ? 0.17 : 0.13,
    days: 2,
  })),
];
const HOUR_WINDOWS: Win[] = [
  { key: 'dawn', name: '새벽', label: '새벽(0~6시)에 ', hours: [0, 6], share: 0.12, days: 14 },
  { key: 'morning', name: '아침', label: '아침(6~12시)에 ', hours: [6, 12], share: 0.08, days: 14 },
  { key: 'lunch', name: '점심', label: '점심(12~14시)에 ', hours: [12, 14], share: 0.05, days: 14 },
  { key: 'afternoon', name: '오후', label: '오후(14~18시)에 ', hours: [14, 18], share: 0.15, days: 14 },
  { key: 'evening', name: '저녁', label: '저녁(18~21시)에 ', hours: [18, 21], share: 0.3, days: 14 },
  { key: 'night', name: '밤', label: '밤(21~24시)에 ', hours: [21, 24], share: 0.3, days: 14 },
];
// 요일 × 저녁/밤
const COMBO_WINDOWS: Win[] = DAY_WINDOWS.filter((w) => w.key.startsWith('wd')).flatMap((d) =>
  HOUR_WINDOWS.filter((h) => h.key === 'evening' || h.key === 'night').map((h) => ({
    key: `${d.key}-${h.key}`,
    name: `${d.name} ${h.name}`,
    label: `${d.name} ${h.label}`,
    hours: h.hours,
    day: d.day,
    share: d.share * h.share,
    days: 2,
  })),
);
const ALL_WINDOWS = [...DAY_WINDOWS, ...HOUR_WINDOWS, ...COMBO_WINDOWS];
const MULTI_DAY = DAY_WINDOWS.filter((w) => w.days >= 3);

function inWin(c: GroupCtx, w: Win, day: string, hour?: number): boolean {
  if (w.day && !w.day(day, dayIndex(c, day))) return false;
  if (w.hours && hour !== undefined && (hour < w.hours[0] || hour >= w.hours[1])) return false;
  return true;
}

// ── 기록 계산 ──
type VoiceRow = GroupCtx['voice'][number];
// 창 안 모둠 통화 분. 날마다 하루 상한까지만 쳐요.
function voiceIn(c: GroupCtx, w: Win, pick: (v: VoiceRow) => boolean = () => true): number {
  const byDay = new Map<string, number>();
  for (const v of c.voice) if (inWin(c, w, v.day, v.hour) && pick(v)) byDay.set(v.day, (byDay.get(v.day) ?? 0) + v.minutes);
  let sum = 0;
  for (const m of byDay.values()) sum += Math.min(DAILY_VOICE_CAP, m);
  return sum;
}
function voiceDays(c: GroupCtx, w: Win, pick: (v: VoiceRow) => boolean = () => true, min = 1): number {
  const byDay = new Map<string, number>();
  for (const v of c.voice) if (inWin(c, w, v.day, v.hour) && pick(v)) byDay.set(v.day, (byDay.get(v.day) ?? 0) + v.minutes);
  return [...byDay.values()].filter((m) => m >= min).length;
}
function memberMinutes(c: GroupCtx, w: Win): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of c.memberDay) if (inWin(c, w, r.day)) out.set(r.user, (out.get(r.user) ?? 0) + r.minutes);
  return out;
}
const countCurrent = (c: GroupCtx, ok: (u: string) => boolean) => c.current.filter(ok).length;
const countStart = (c: GroupCtx, ok: (u: string) => boolean) => c.startCurrent.filter(ok).length;
function partnerCounts(c: GroupCtx, min = PAIR_MINUTES): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of c.pairs) {
    if (p.minutes < min) continue;
    out.set(p.a, (out.get(p.a) ?? 0) + 1);
    out.set(p.b, (out.get(p.b) ?? 0) + 1);
  }
  return out;
}
function longestStreak(days: Iterable<string>): number {
  const set = new Set(days);
  let best = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue;
    let n = 1;
    let cur = d;
    while (set.has((cur = addDays(cur, 1)))) n++;
    best = Math.max(best, n);
  }
  return best;
}
function voiceDaySet(c: GroupCtx): Set<string> {
  return new Set(c.voice.filter((v) => v.minutes > 0).map((v) => v.day));
}

// ── 목표 숫자 ──
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
// 합계(통화 분, 칭찬 수 등): 시작 인원에 비례
const scaled = (t10: number, step = 1) => (c: GroupCtx) => roundTo((t10 * Math.max(1, c.startSize)) / 10, step);
// "모둠원 N명 이상": 지금 인원에 비례, 지금 인원보다 많을 수 없어요
const people = (t10: number) => (c: GroupCtx) =>
  Math.max(1, Math.min(c.current.length, Math.round((t10 * Math.max(1, c.current.length)) / 10)));
const everyone = (c: GroupCtx) => Math.max(1, c.startCurrent.length);
const fixed = (n: number) => () => n;
const maxPairs = (c: GroupCtx) => { const k = Math.max(c.startSize, c.current.length); return Math.max(1, (k * (k - 1)) / 2); };
// 한 사람이 같이 통화할 수 있는 모둠원 수(나 빼고, 지금 남아 있는 모둠원 기준).
// 작은 모둠이나 사람이 빠진 모둠에서 못 깨는 목표가 되지 않게 이만큼까지만 요구해요.
const partnerNeed = (c: GroupCtx, k: number) => Math.max(1, Math.min(k, c.current.length - 1));
const capTogether = (k: number, c: GroupCtx) => Math.max(2, Math.min(k, c.current.length));

// ── 퀘스트 만들기 ──
const QUESTS_BUILT: Quest[] = [];
function add(q: Omit<Quest, 'name'> & { name: string }) {
  QUESTS_BUILT.push({ ...q, name: `${q.name.trim()} ${STARS[q.diff]}` });
}
const DIFFS: QuestDiff[] = ['easy', 'normal', 'hard'];
const voiceTarget = (w: Win, diff: QuestDiff) => Math.max(30, roundTo(SEASON_VOICE * w.share * LEVEL_FACTOR[diff], 30));

// 1) 모둠끼리 통화 시간(모든 창 × 3단계)
for (const w of ALL_WINDOWS)
  for (const diff of DIFFS) {
    const t10 = voiceTarget(w, diff);
    add({
      id: `voice:${w.key}:${diff}`, name: `${w.name} 수다`, cat: '통화', diff,
      text: (t) => `${w.label}모둠끼리 통화 ${hours(t)}`,
      target: scaled(t10, 10), value: (c) => voiceIn(c, w),
    });
  }

// 2) 여럿이 한 방에(3·5·7명 × 날짜/시간 창)
const TOGETHER: [number, QuestDiff[], number][] = [
  [3, ['easy', 'normal'], 0.25],
  [5, ['normal', 'hard'], 0.1],
  [7, ['hard'], 0.04],
];
for (const w of [...DAY_WINDOWS, ...HOUR_WINDOWS])
  for (const [k, diffs, share] of TOGETHER)
    for (const diff of diffs) {
      const t = Math.max(20, roundTo(SEASON_VOICE * share * w.share * (diff === diffs[0] ? 0.4 : 1), 10));
      add({
        id: `together${k}:${w.key}:${diff}`, name: `${w.name} ${k}인 모임`, cat: '여럿이', diff,
        text: (n) => `${w.label}모둠원 ${k}명 이상이 한 통화방에 함께 ${hours(n)}`,
        target: fixed(t), value: (c) => voiceIn(c, w, (v) => v.together >= capTogether(k, c)),
      });
    }

// 요일 저녁/밤에 3명 이상 모이기
for (const w of COMBO_WINDOWS) {
  const t = Math.max(30, roundTo(SEASON_VOICE * 0.25 * w.share * 2, 10));
  add({
    id: `together3:${w.key}:easy`, name: `${w.name} 3인 모임`, cat: '여럿이', diff: 'easy',
    text: (n) => `${w.label}모둠원 3명 이상이 한 통화방에 함께 ${hours(n)}`,
    target: fixed(t), value: (c) => voiceIn(c, w, (v) => v.together >= capTogether(3, c)),
  });
}

// 3) 통화한 날 수(여러 날짜 창, 시간 창)
for (const w of MULTI_DAY)
  for (const [diff, frac] of [['easy', 0.4], ['normal', 0.65], ['hard', 0.9]] as [QuestDiff, number][]) {
    const t = Math.max(2, Math.round(w.days * frac));
    add({
      id: `days:${w.key}:${diff}`, name: `${w.name} 출근 도장`, cat: '꾸준히', diff,
      text: (n) => `${w.label || '시즌 중 '}모둠끼리 통화한 날 ${n}일`,
      target: fixed(t), value: (c) => voiceDays(c, w),
    });
  }
for (const w of HOUR_WINDOWS)
  for (const [diff, t] of [['easy', 2], ['normal', 4], ['hard', 7]] as [QuestDiff, number][])
    add({
      id: `days:${w.key}:${diff}`, name: `${w.name} 단골`, cat: '꾸준히', diff,
      text: (n) => `${w.label}모둠끼리 통화한 날 ${n}일`,
      target: fixed(t), value: (c) => voiceDays(c, w),
    });
for (const w of DAY_WINDOWS.filter((x) => x.key.startsWith('wd')))
  add({
    id: `days:${w.key}:both`, name: `${w.name} 개근`, cat: '꾸준히', diff: 'normal',
    text: () => `시즌의 ${w.name} 이틀 모두 모둠끼리 통화`,
    target: fixed(2), value: (c) => voiceDays(c, w),
  });
// 하루에 오래 통화한 날
for (const [min, cnt, diff] of [[120, 3, 'easy'], [120, 6, 'normal'], [180, 3, 'normal'], [180, 6, 'hard'], [240, 3, 'hard'], [240, 5, 'hard']] as [number, number, QuestDiff][])
  add({
    id: `longday:${min}:${cnt}`, name: `긴 하루 ${hours(min)} ${cnt}번`, cat: '꾸준히', diff,
    text: (n) => `모둠끼리 하루 통화 ${hours(min)}을 채운 날 ${n}일`,
    target: fixed(cnt), value: (c) => voiceDays(c, DAY_WINDOWS[0]!, () => true, min),
  });

// 4) 같은 게임 역할끼리(3·4·5명 × 날짜 창/시간 창)
for (const w of [...DAY_WINDOWS.slice(0, 7), ...HOUR_WINDOWS])
  for (const [k, diff, share] of [[3, 'easy', 0.12], [4, 'normal', 0.12], [5, 'hard', 0.1]] as [number, QuestDiff, number][]) {
    const t = Math.max(20, roundTo(SEASON_VOICE * share * w.share, 10));
    add({
      id: `same${k}:${w.key}`, name: `${w.name} 같은 게임 ${k}인`, cat: '게임', diff,
      text: (n) => `${w.label}같은 게임 역할인 모둠원 ${k}명 이상이 한 통화방에 ${hours(n)}`,
      target: fixed(t), value: (c) => voiceIn(c, w, (v) => v.same >= capTogether(k, c)),
    });
  }

// 5) 모둠원마다(각자 모둠원과 통화)
for (const w of DAY_WINDOWS.slice(0, 7))
  for (const [who, min, diff] of [[5, 30, 'easy'], [7, 60, 'normal'], [0, 60, 'hard'], [5, 120, 'normal'], [7, 180, 'hard'], [0, 30, 'normal']] as [number, number, QuestDiff][]) {
    const scaledMin = Math.max(10, roundTo(min * Math.min(1, w.share * 2), 10));
    add({
      id: `each:${w.key}:${who || 'all'}:${min}`, name: `${w.name} ${who ? `${who}인` : '모두'} 출석부`, cat: '모두', diff,
      text: (n) => `${w.label}${who ? `모둠원 ${n}명 이상이` : '모둠원 모두가'} 각자 모둠원과 통화 ${hours(scaledMin)}`,
      target: who ? people(who) : everyone,
      value: (c) => {
        const m = memberMinutes(c, w);
        return who ? countCurrent(c, (u) => (m.get(u) ?? 0) >= scaledMin) : countStart(c, (u) => (m.get(u) ?? 0) >= scaledMin);
      },
    });
  }
// 같은 날 모둠원 모두/여럿이 모둠원과 통화한 날
for (const [who, cnt, diff] of [[6, 1, 'normal'], [8, 1, 'hard'], [0, 1, 'hard'], [5, 3, 'normal'], [7, 3, 'hard']] as [number, number, QuestDiff][])
  add({
    id: `sameday:${who || 'all'}:${cnt}`, name: `${who ? `${who}인` : '전원'} 집합`, cat: '모두', diff,
    text: (n) => `같은 날 ${who ? `모둠원 ${who}명 이상` : '모둠원 모두'}이 모둠원과 통화한 날 ${n}번`,
    target: fixed(cnt),
    value: (c) => {
      const byDay = new Map<string, Set<string>>();
      for (const r of c.memberDay) if (r.minutes > 0) (byDay.get(r.day) ?? byDay.set(r.day, new Set()).get(r.day)!).add(r.user);
      const need = who ? Math.min(who, c.current.length) : c.startCurrent.length;
      return [...byDay.values()].filter((s) => (who ? s.size >= need : need > 0 && c.startCurrent.every((u) => s.has(u)))).length;
    },
  });

// 6) 짝(모둠 안에서 같이 통화한 짝)
for (const [n, diff] of [[5, 'easy'], [10, 'easy'], [15, 'normal'], [20, 'normal'], [25, 'hard'], [30, 'hard'], [35, 'hard']] as [number, QuestDiff][])
  add({
    id: `pairs:${n}`, name: `짝꿍 ${n}쌍`, cat: '짝', diff,
    text: (t) => `모둠 안에서 같이 통화한 짝 ${t}쌍`,
    // 사람 수로 만들 수 있는 짝보다 많이 요구하지 않아요(7명이면 21쌍이 최대)
    target: (c) => Math.min(scaled(n)(c), maxPairs(c)), value: (c) => c.pairs.filter((p) => p.minutes >= PAIR_MINUTES).length,
  });
for (const [min, n, diff] of [[60, 5, 'normal'], [60, 10, 'hard'], [120, 3, 'normal'], [120, 6, 'hard'], [30, 10, 'normal']] as [number, number, QuestDiff][])
  add({
    id: `pairs${min}:${n}`, name: `단짝 만들기 ${hours(min)}`, cat: '짝', diff,
    text: (t) => `모둠 안에서 ${hours(min)} 넘게 같이 통화한 짝 ${t}쌍`,
    target: (c) => Math.min(scaled(n)(c), maxPairs(c)), value: (c) => c.pairs.filter((p) => p.minutes >= min).length,
  });
for (const [k, diff] of [[2, 'normal'], [3, 'normal'], [4, 'hard'], [5, 'hard']] as [number, QuestDiff][])
  add({
    id: `partners:${k}`, name: `발 넓은 모둠 ${k}`, cat: '짝', diff,
    text: (_t, c) => `모둠원 모두가 모둠원 ${c ? partnerNeed(c, k) : k}명 이상과 통화`,
    target: everyone, value: (c) => { const p = partnerCounts(c); const need = partnerNeed(c, k); return countStart(c, (u) => (p.get(u) ?? 0) >= need); },
  });
for (const [who, k, diff] of [[5, 3, 'easy'], [7, 3, 'normal'], [5, 5, 'normal'], [7, 5, 'hard']] as [number, number, QuestDiff][])
  add({
    id: `partners:${who}:${k}`, name: `친구 사귀기 ${who}·${k}`, cat: '짝', diff,
    text: (t, c) => `모둠원 ${t}명 이상이 각자 모둠원 ${c ? partnerNeed(c, k) : k}명 이상과 통화`,
    target: people(who), value: (c) => { const p = partnerCounts(c); const need = partnerNeed(c, k); return countCurrent(c, (u) => (p.get(u) ?? 0) >= need); },
  });

// 7) 이어서 통화, 방, 연속
for (const [min, diff] of [[60, 'easy'], [90, 'easy'], [120, 'normal'], [180, 'normal'], [240, 'hard'], [300, 'hard']] as [number, QuestDiff][])
  add({
    id: `run:${min}`, name: `마라톤 ${hours(min)}`, cat: '기록', diff,
    text: (t) => `모둠끼리 한 번에 ${hours(t)} 이상 이어서 통화`, target: fixed(min), value: (c) => c.bestRun,
  });
for (const [n, diff] of [[2, 'easy'], [3, 'normal'], [4, 'normal'], [5, 'hard']] as [number, QuestDiff][])
  add({
    id: `rooms:${n}`, name: `방 탐험 ${n}곳`, cat: '기록', diff,
    text: (t) => `서로 다른 통화방 ${t}곳에서 모둠끼리 통화`, target: fixed(n), value: (c) => c.rooms,
  });
for (const [n, diff] of [[3, 'easy'], [5, 'normal'], [7, 'hard'], [10, 'hard']] as [number, QuestDiff][])
  add({
    id: `streak:${n}`, name: `${n}일 연속`, cat: '기록', diff,
    text: (t) => `${t}일 연속 모둠끼리 통화`, target: fixed(n), value: (c) => longestStreak(voiceDaySet(c)),
  });
for (const [n, diff] of [[5, 'normal'], [7, 'hard']] as [number, QuestDiff][])
  add({
    id: `weekdays:${n}`, name: `요일 도장 ${n}`, cat: '기록', diff,
    text: (t) => `서로 다른 요일 ${t}개에 모둠끼리 통화`, target: fixed(n),
    value: (c) => new Set(c.voice.map((v) => weekday(v.day))).size,
  });
for (const [n, diff] of [[3, 'easy'], [4, 'normal'], [6, 'hard']] as [number, QuestDiff][])
  add({
    id: `bands:${n}`, name: `하루 종일 ${n}타임`, cat: '기록', diff,
    text: (t) => `하루 안에 서로 다른 시간대(새벽·아침·점심·오후·저녁·밤) ${t}곳에서 모둠끼리 통화`, target: fixed(n),
    value: (c) => {
      const bands = new Map<string, Set<string>>();
      for (const v of c.voice) {
        const band = HOUR_WINDOWS.find((h) => v.hour >= h.hours![0] && v.hour < h.hours![1])?.key;
        if (band) (bands.get(v.day) ?? bands.set(v.day, new Set()).get(v.day)!).add(band);
      }
      return Math.max(0, ...[...bands.values()].map((s) => s.size));
    },
  });

// 8) 칭찬(날짜 창)
for (const w of MULTI_DAY)
  for (const diff of DIFFS) {
    const t10 = Math.max(2, Math.round(40 * w.share * { easy: 0.3, normal: 0.6, hard: 1 }[diff]));
    add({
      id: `praise:${w.key}:${diff}`, name: `${w.name} 칭찬 릴레이`, cat: '칭찬', diff,
      text: (t) => `${w.label}모둠 안 칭찬 ${t}번`, target: scaled(t10),
      value: (c) => c.praises.filter((p) => inWin(c, w, p.day)).length,
    });
  }
for (const [kind, diff] of [['give', 'normal'], ['get', 'normal'], ['both', 'hard']] as [string, QuestDiff][])
  add({
    id: `praise:everyone:${kind}`, name: `모두에게 박수 ${kind === 'both' ? '(주고받기)' : kind === 'give' ? '(주기)' : '(받기)'}`, cat: '칭찬', diff,
    text: () => `모둠원 모두가 모둠원에게 칭찬 ${kind === 'both' ? '1번 주고 1번 받기' : kind === 'give' ? '1번 이상 주기' : '1번 이상 받기'}`,
    target: everyone,
    value: (c) => {
      const gave = new Set(c.praises.map((p) => p.from));
      const got = new Set(c.praises.map((p) => p.to));
      return countStart(c, (u) => (kind !== 'get' ? gave.has(u) : true) && (kind !== 'give' ? got.has(u) : true));
    },
  });
for (const [n, diff] of [[2, 'easy'], [3, 'normal'], [5, 'hard']] as [number, QuestDiff][])
  add({
    id: `praise:popular:${n}`, name: `인기 스타 ${n}`, cat: '칭찬', diff,
    text: (t) => `모둠원 한 명이 모둠원 ${t}명에게 칭찬받기`, target: (c) => partnerNeed(c, n),
    value: (c) => {
      const got = new Map<string, Set<string>>();
      for (const p of c.praises) (got.get(p.to) ?? got.set(p.to, new Set()).get(p.to)!).add(p.from);
      return Math.max(0, ...[...got.values()].map((s) => s.size));
    },
  });

// 9) 출석(날짜 창)
for (const w of DAY_WINDOWS)
  for (const diff of (w.days >= 3 ? ['easy', 'normal', 'hard'] : ['easy', 'normal']) as QuestDiff[]) {
    const frac = { easy: 0.35, normal: 0.6, hard: 0.85 }[diff];
    const t10 = Math.max(3, Math.round(10 * w.days * frac));
    add({
      id: `attend:${w.key}:${diff}`, name: `${w.name} 출석 체크`, cat: '출석', diff,
      text: (t) => `${w.label}모둠원 출석 합계 ${t}번`, target: scaled(t10),
      value: (c) => c.attend.filter((a) => inWin(c, w, a.day)).length,
    });
  }
for (const [n, diff] of [[3, 'easy'], [5, 'easy'], [7, 'normal'], [10, 'hard'], [12, 'hard']] as [number, QuestDiff][])
  add({
    id: `attend:everyone:${n}`, name: `개근상 ${n}일`, cat: '출석', diff,
    text: (t) => `모둠원 모두 시즌 동안 출석 ${t}일 이상`, target: fixed(n),
    value: (c) => {
      const days = new Map<string, Set<string>>();
      for (const a of c.attend) (days.get(a.user) ?? days.set(a.user, new Set()).get(a.user)!).add(a.day);
      return c.startCurrent.length ? Math.min(...c.startCurrent.map((u) => days.get(u)?.size ?? 0)) : 0;
    },
  });
for (const [who, cnt, diff] of [[6, 1, 'easy'], [8, 1, 'normal'], [8, 3, 'hard'], [0, 1, 'hard']] as [number, number, QuestDiff][])
  add({
    id: `attend:sameday:${who || 'all'}:${cnt}`, name: `${who ? `${who}인` : '전원'} 출석 날`, cat: '출석', diff,
    text: (n) => `${who ? `모둠원 ${who}명 이상` : '모둠원 모두'}이 같은 날 출석한 날 ${n}번`, target: fixed(cnt),
    value: (c) => {
      const byDay = new Map<string, Set<string>>();
      for (const a of c.attend) (byDay.get(a.day) ?? byDay.set(a.day, new Set()).get(a.day)!).add(a.user);
      const need = who ? Math.min(who, c.current.length) : c.startCurrent.length;
      return [...byDay.values()].filter((s) => (who ? [...s].filter((u) => c.current.includes(u)).length >= need : need > 0 && c.startCurrent.every((u) => s.has(u)))).length;
    },
  });
for (const [n, diff] of [[3, 'easy'], [5, 'normal'], [7, 'hard']] as [number, QuestDiff][])
  add({
    id: `attend:streak:${n}`, name: `출석 ${n}일 연속`, cat: '출석', diff,
    text: (t) => `모둠원 누군가가 ${t}일 연속 출석`, target: fixed(n),
    value: (c) => {
      const days = new Map<string, string[]>();
      for (const a of c.attend) (days.get(a.user) ?? days.set(a.user, []).get(a.user)!).push(a.day);
      return Math.max(0, ...[...days.values()].map((d) => longestStreak(d)));
    },
  });

// 10) 신입(초록하리보) 챙기기
for (const [min, diff] of [[30, 'easy'], [60, 'easy'], [120, 'normal'], [240, 'hard']] as [number, QuestDiff][])
  add({
    id: `newbie:minutes:${min}`, name: `신입 환영 ${hours(min)}`, cat: '신입', diff,
    text: (t) => `모둠원이 신입과 통화 합계 ${hours(t)}`, target: fixed(min),
    value: (c) => c.newbie.reduce((s, n) => s + n.minutes, 0),
  });
for (const [n, diff] of [[2, 'easy'], [3, 'normal'], [5, 'hard']] as [number, QuestDiff][])
  add({
    id: `newbie:hosts:${n}`, name: `신입 도우미 ${n}명`, cat: '신입', diff,
    text: (t) => `모둠원 ${t}명 이상이 각자 신입과 통화`, target: people(n),
    value: (c) => new Set(c.newbie.filter((x) => x.minutes >= PAIR_MINUTES).map((x) => x.user)).size,
  });
for (const [n, diff] of [[1, 'easy'], [2, 'normal'], [3, 'hard'], [5, 'hard']] as [number, QuestDiff][])
  add({
    id: `newbie:met:${n}`, name: `신입 친구 ${n}명`, cat: '신입', diff,
    text: (t) => `신입 ${t}명 이상과 모둠원이 통화`, target: fixed(n),
    value: (c) => new Set(c.newbie.filter((x) => x.minutes >= PAIR_MINUTES).map((x) => x.newbie)).size,
  });
for (const [n, diff] of [[1, 'easy'], [3, 'normal'], [5, 'hard']] as [number, QuestDiff][])
  add({
    id: `newbie:praise:${n}`, name: `신입 응원 ${n}번`, cat: '신입', diff,
    text: (t) => `모둠원이 신입에게 칭찬 ${t}번`, target: fixed(n), value: (c) => c.praises.filter((p) => p.toNewbie).length,
  });

// 11) 도감 카드
for (const [n, diff] of [[3, 'easy'], [5, 'easy'], [10, 'normal'], [15, 'normal'], [20, 'hard'], [30, 'hard']] as [number, QuestDiff][])
  add({
    id: `newcards:${n}`, name: `새 카드 ${n}장`, cat: '카드', diff,
    text: (t) => `시즌에 처음 같이 논 짝 ${t}쌍(도감 새 카드)`, target: (c) => Math.min(scaled(n)(c), maxPairs(c)), value: (c) => c.newCardPairs.length,
  });
for (const [who, diff] of [[5, 'normal'], [0, 'hard']] as [number, QuestDiff][])
  add({
    id: `newcards:each:${who || 'all'}`, name: `${who ? `${who}인` : '모두'} 새 카드`, cat: '카드', diff,
    text: (t) => `${who ? `모둠원 ${t}명 이상이` : '모둠원 모두가'} 도감 새 카드 1장 이상 얻기`,
    target: who ? people(who) : everyone,
    value: (c) => { const s = new Set(c.newCardOwners); return who ? countCurrent(c, (u) => s.has(u)) : countStart(c, (u) => s.has(u)); },
  });
for (const [n, diff] of [[10, 'easy'], [20, 'easy'], [30, 'normal'], [50, 'normal'], [80, 'hard'], [120, 'hard']] as [number, QuestDiff][])
  add({
    id: `levelups:${n}`, name: `레벨업 ${n}`, cat: '카드', diff,
    text: (t) => `모둠 안 짝 카드 레벨업 합계 ${t}번`, target: scaled(n),
    value: (c) => c.pairLevels.reduce((s, p) => s + Math.max(0, p.now - p.from), 0),
  });
for (const [lv, n, diff] of [[5, 3, 'easy'], [5, 8, 'normal'], [10, 1, 'easy'], [10, 3, 'normal'], [10, 6, 'hard'], [15, 2, 'normal'], [20, 1, 'hard'], [20, 3, 'hard'], [30, 1, 'hard']] as [number, number, QuestDiff][])
  add({
    id: `reach${lv}:${n}`, name: `Lv.${lv} 달성 ${n}쌍`, cat: '카드', diff,
    text: (t) => `모둠 안 짝 카드가 시즌 중 Lv.${lv}에 닿은 짝 ${t}쌍`, target: (c) => Math.min(n, maxPairs(c)),
    value: (c) => c.pairLevels.filter((p) => p.from < lv && p.now >= lv).length,
  });
for (const [who, diff] of [[5, 'easy'], [7, 'normal'], [0, 'hard']] as [number, QuestDiff][])
  add({
    id: `ownlevel:${who || 'all'}`, name: `${who ? `${who}인` : '모두'} 내 카드 성장`, cat: '카드', diff,
    text: (t) => `${who ? `모둠원 ${t}명 이상이` : '모둠원 모두'} 내 카드 레벨 1 이상 올리기`,
    target: who ? people(who) : everyone,
    value: (c) => { const s = new Set(c.ownLevelUp); return who ? countCurrent(c, (u) => s.has(u)) : countStart(c, (u) => s.has(u)); },
  });
for (const [who, diff] of [[5, 'easy'], [8, 'normal'], [0, 'normal']] as [number, QuestDiff][])
  add({
    id: `login:${who || 'all'}`, name: `${who ? `${who}인` : '모두'} 도감 방문`, cat: '카드', diff,
    text: (t) => `${who ? `모둠원 ${t}명 이상이` : '모둠원 모두'} 웹 도감에 한 번 이상 들어오기`,
    target: who ? people(who) : everyone,
    value: (c) => { const s = new Set(c.loggedIn); return who ? countCurrent(c, (u) => s.has(u)) : countStart(c, (u) => s.has(u)); },
  });

// 12) 내전(참가만 하면 세요). 내전이 열릴 때만 뽑아요.
const allScrimRows = (c: GroupCtx) => c.scrims.reduce((s, x) => s + x.members.length, 0);
for (const [n, diff] of [[3, 'easy'], [8, 'normal'], [15, 'hard']] as [number, QuestDiff][])
  add({
    id: `scrim:total:${n}`, name: `내전 참가 ${n}판`, cat: '내전', diff, scrim: true,
    text: (t) => `모둠원 내전 참가 합계 ${t}판`, target: scaled(n), value: allScrimRows,
  });
for (const [who, times, diff] of [[5, 1, 'normal'], [3, 2, 'normal'], [0, 1, 'hard']] as [number, number, QuestDiff][])
  add({
    id: `scrim:each:${who || 'all'}:${times}`, name: `${who ? `${who}인` : '모두'} 내전 ${times}판`, cat: '내전', diff, scrim: true,
    text: (t) => `${who ? `모둠원 ${t}명 이상이 각자` : '모둠원 모두'} 내전 ${times}판 참가`,
    target: who ? people(who) : everyone,
    value: (c) => {
      const n = new Map<string, number>();
      for (const s of c.scrims) for (const u of s.members) n.set(u, (n.get(u) ?? 0) + 1);
      return who ? countCurrent(c, (u) => (n.get(u) ?? 0) >= times) : countStart(c, (u) => (n.get(u) ?? 0) >= times);
    },
  });
for (const [n, diff] of [[2, 'normal'], [3, 'hard']] as [number, QuestDiff][])
  add({
    id: `scrim:games:${n}`, name: `여러 게임 내전 ${n}`, cat: '내전', diff, scrim: true,
    text: (t) => `모둠원이 ${t}가지 게임 내전 참가`, target: fixed(n), value: (c) => new Set(c.scrims.map((s) => s.game)).size,
  });
add({
  id: 'scrim:weekend', name: '주말 내전', cat: '내전', diff: 'easy', scrim: true,
  text: (t) => `주말에 모둠원 내전 참가 합계 ${t}판`, target: fixed(2),
  value: (c) => c.scrims.filter((s) => [0, 6].includes(weekday(s.day))).reduce((s, x) => s + x.members.length, 0),
});
add({
  id: 'scrim:newbie', name: '신입과 내전', cat: '내전', diff: 'normal', scrim: true,
  text: (t) => `모둠원이 신입과 내전 ${t}판`, target: fixed(2), value: (c) => c.scrims.filter((s) => s.newbies > 0).length,
});

export const QUESTS: readonly Quest[] = QUESTS_BUILT;
const BY_ID = new Map(QUESTS.map((q) => [q.id, q]));
export const questById = (id: string) => BY_ID.get(id);

// 시드가 같으면 늘 같은 순서(시즌 id로 뽑아서 다시 계산해도 같아요)
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// 모둠 하나의 퀘스트 8개: 쉬움 3, 보통 3, 어려움 2. 같은 종류는 2개까지.
// 지난 시즌에 모둠원들이 받았던 퀘스트(seen: 퀘스트 → 받았던 모둠원 수)는 되도록 피해요.
export function pickQuests(rand: () => number, opts: { seen?: Map<string, number>; scrim?: boolean } = {}): string[] {
  const seen = opts.seen ?? new Map<string, number>();
  const pool = QUESTS.filter((q) => opts.scrim || !q.scrim);
  const picked: Quest[] = [];
  const cats = new Map<string, number>();
  // 같은 기록을 숫자만 바꾼 퀘스트가 한 모둠에 두 번 나오지 않게(예: 통화 저녁 쉬움 + 통화 저녁 어려움)
  const family = (q: Quest) => q.id.split(':').slice(0, 2).join(':');
  const families = new Set<string>();
  for (const diff of ['hard', 'normal', 'easy'] as QuestDiff[]) {
    const ordered = shuffle(pool.filter((q) => q.diff === diff), rand).sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0));
    for (const strict of [true, false]) {
      for (const q of ordered) {
        if (picked.filter((p) => p.diff === diff).length >= QUESTS_PER_GROUP[diff]) break;
        if (picked.includes(q) || families.has(family(q))) continue;
        if (strict && (cats.get(q.cat) ?? 0) >= MAX_PER_CAT) continue;
        picked.push(q);
        families.add(family(q));
        cats.set(q.cat, (cats.get(q.cat) ?? 0) + 1);
      }
    }
  }
  const order: Record<QuestDiff, number> = { easy: 0, normal: 1, hard: 2 };
  return picked.sort((a, b) => order[a.diff] - order[b.diff]).map((q) => q.id);
}
