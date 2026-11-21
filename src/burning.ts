// 버닝타임(고나님 제안, 나리 2026-11-20): 스위치만 걸어 두고, 나리가 "버닝타임 시작해줘" 하면 켜요.
// 켜는 법: burning 표의 started_at·until을 적어요(docs/burning.md). 저절로 켜지지 않아요.
// 켜져 있는 동안: 짝 카드 통화 경험치 1.5배(하루 한도도 1.5배, 봇이 세요), 원정대 재료 나올 확률 1.5배(대장은 그대로),
// 깬 장 다시 돌아도 젤코인 최소 50%, 사건파일 힌트 동전 2배, 빙고 통화 시간 2배. 겜블장은 빼요.

export const BURN_CARD_XP = 1.5; // 봇이 써요(docs/bot-sync.md)
export const BURN_DROP = 1.5;
export const BURN_FARM_MIN = 50;
export const BURN_HINT_COINS = 2;
export const BURN_BINGO_VOICE = 2;

type Row = { started_at: string | null; until: string | null };
export type BurnWindow = { from: string; until: string };
// 화면마다 DB를 읽지 않게 1분 동안 기억해요(켜거나 끈 뒤 길게는 1분 늦게 바뀌어요)
const CACHE_MS = 60_000;
let cache: { at: number; row: Row | null } | null = null;
// 테스트용
export const resetBurningCache = () => {
  cache = null;
};

// 가장 최근 버닝타임(이미 끝났을 수도 있어요).
// 봇 묶음은 조금 늦게 오니까, 통화 기록은 지금이 아니라 그 시각이 이 안에 있는지로 봐요.
// fresh = 캐시를 쓰지 않고 새로 읽어요(봇 동기화 정산처럼 기록이 남는 곳)
export async function burnWindow(db: D1Database, nowMs = Date.now(), fresh = false): Promise<BurnWindow | null> {
  let row: Row | null;
  if (!fresh && cache && nowMs - cache.at >= 0 && nowMs - cache.at < CACHE_MS) row = cache.row;
  else {
    try {
      row = await db.prepare('SELECT started_at, until FROM burning WHERE id = 1').first<Row>();
    } catch {
      return null; // 표가 아직 없거나 DB 오류면 꺼진 것으로 봐요
    }
    cache = { at: nowMs, row };
  }
  if (!row?.started_at || !row.until || !(Date.parse(row.started_at) < Date.parse(row.until))) return null;
  return { from: row.started_at, until: row.until };
}

// 봇 동기화 정산용: 지금(또는 가장 최근) 버닝타임과, 그 전에 끝난 버닝타임들(최근 3일).
// 봇 묶음이 늦게 오는 사이 새 버닝타임을 켜도 예전 버닝 때 통화를 2배로 쳐요.
const HISTORY_MS = 3 * 86_400_000;
export async function burnWindowsForSync(db: D1Database, nowMs = Date.now()): Promise<{ current: BurnWindow | null; all: BurnWindow[] }> {
  const current = await burnWindow(db, nowMs, true);
  const all: BurnWindow[] = current ? [current] : [];
  try {
    const { results } = await db
      .prepare('SELECT started_at, until FROM burning_history WHERE until > ?1')
      .bind(new Date(nowMs - HISTORY_MS).toISOString())
      .all<{ started_at: string; until: string }>();
    for (const r of results ?? []) {
      // 예전 기록의 끝은 지금 버닝 시작을 넘지 않게 잘라요(끝나기 전에 새로 켜고 일찍 끝내도 2배가 이어지지 않게, Codex #313).
      let until = r.until;
      if (current && Date.parse(current.from) > Date.parse(r.started_at) && Date.parse(current.from) < Date.parse(until)) until = current.from;
      if (Date.parse(r.started_at) < Date.parse(until) && !all.some((w) => w.from === r.started_at && w.until === until)) {
        all.push({ from: r.started_at, until });
      }
    }
  } catch {
    // 지난 기록 표가 아직 없으면 지금 것만 봐요
  }
  return { current, all };
}

// 지금 버닝타임이면 끝나는 시각(ISO), 아니면 null
export async function burningUntil(db: D1Database, nowMs = Date.now()): Promise<string | null> {
  const w = await burnWindow(db, nowMs);
  return w && inWindow(w, nowMs) ? w.until : null;
}

export const inWindow = (w: BurnWindow | readonly BurnWindow[] | null | undefined, atMs: number): boolean =>
  Array.isArray(w) ? w.some((x) => inWindow(x, atMs)) : !!w && Date.parse((w as BurnWindow).from) <= atMs && atMs < Date.parse((w as BurnWindow).until);

// 화면에 보여 줄 끝나는 시각(한국 시간 "23:40"). 오늘(한국 날짜)이 아닌 날 끝나면 날짜도 붙여요("11/22 14:00").
export const burnEndText = (until: string, nowMs = Date.now()) => {
  const d = new Date(Date.parse(until) + 9 * 3600_000);
  const today = new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 10);
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return d.toISOString().slice(0, 10) === today ? time : `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${time}`;
};

// 봇에게 알려 줄 값
export const burnReply = (w: BurnWindow | null, nowMs: number) => (w && inWindow(w, nowMs) ? { from: w.from, until: w.until, card_xp: BURN_CARD_XP } : null);
