// 버닝타임(고나님 제안, 나리 2026-11-20): 큰 점검이 끝나면 자동으로 1~2시간 켜져요.
// - 30분 이상 1시간 이하 점검 → 1시간, 1시간 넘는 점검 → 2시간. 30분보다 짧은 점검은 켜지지 않아요.
// - 켜져 있는 동안: 짝 카드 통화 경험치 1.5배(하루 한도도 1.5배, 봇이 세요), 원정대 재료 나올 확률 1.5배(대장은 그대로),
//   깬 장 다시 돌아도 젤코인 최소 50%, 사건파일 힌트 동전 2배, 빙고 통화 시간 2배. 겜블장은 빼요.
// 점검 중에도 봇이 몇 초마다 들어오니까, 점검을 처음·마지막으로 본 시각을 남겨 두고
// 점검이 꺼진 뒤 첫 요청에서 그 길이로 버닝타임을 정해요.

export const BURN_MIN_MAINT_MS = 30 * 60_000;
export const BURN_LONG_MAINT_MS = 60 * 60_000;
export const BURN_SHORT_MS = 60 * 60_000;
export const BURN_LONG_MS = 2 * 60 * 60_000;
export const BURN_CARD_XP = 1.5; // 봇이 써요(docs/bot-sync.md)
export const BURN_DROP = 1.5;
export const BURN_FARM_MIN = 50;
export const BURN_HINT_COINS = 2;
export const BURN_BINGO_VOICE = 2;

// 점검 길이 → 버닝타임 길이(밀리초, 0이면 안 켜요)
export const burnLength = (maintMs: number) => (maintMs > BURN_LONG_MAINT_MS ? BURN_LONG_MS : maintMs >= BURN_MIN_MAINT_MS ? BURN_SHORT_MS : 0);

type Row = { maint_from: string | null; maint_last: string | null; until: string | null; started_at: string | null };
export type BurnWindow = { from: string; until: string };
const CACHE_MS = 60_000;
let cache: { at: number; row: Row } | null = null;
let lastMark = 0;
// 테스트용
export const resetBurningCache = () => {
  cache = null;
  lastMark = 0;
};

// 점검 중인 요청마다 부르지만, DB에는 1분에 한 번만 적어요.
export async function markMaintenance(db: D1Database, nowMs = Date.now()) {
  if (nowMs - lastMark < CACHE_MS) return;
  lastMark = nowMs;
  const now = new Date(nowMs).toISOString();
  try {
    await db.prepare('UPDATE burning SET maint_from = COALESCE(maint_from, ?1), maint_last = ?1 WHERE id = 1').bind(now).run();
    cache = null;
  } catch {
    // DB 한도 등으로 못 적어도 점검 화면은 그대로 보여요
  }
}

async function readRow(db: D1Database, nowMs: number): Promise<Row | null> {
  if (cache && nowMs - cache.at < CACHE_MS) return cache.row;
  const row = await db.prepare('SELECT maint_from, maint_last, until, started_at FROM burning WHERE id = 1').first<Row>();
  if (!row) return null;
  cache = { at: nowMs, row };
  return row;
}

// 가장 최근 버닝타임(이미 끝났을 수도 있어요). 점검이 막 끝났으면 여기서 버닝타임을 켜요.
// 봇 묶음은 조금 늦게 오니까, 통화 기록은 지금이 아니라 그 시각이 이 안에 있는지로 봐요.
export async function burnWindow(db: D1Database, nowMs = Date.now()): Promise<BurnWindow | null> {
  let row: Row | null;
  try {
    row = await readRow(db, nowMs);
  } catch {
    return null; // 버닝타임 표가 아직 없거나 DB 오류면 그냥 꺼진 것으로 봐요
  }
  if (!row) return null;
  if (row.maint_from && row.maint_last) {
    const len = burnLength(Date.parse(row.maint_last) - Date.parse(row.maint_from));
    const until = len > 0 ? new Date(nowMs + len).toISOString() : row.until;
    const from = len > 0 ? new Date(nowMs).toISOString() : row.started_at;
    try {
      // 여러 요청이 동시에 와도 한 번만 켜지게, 내가 본 점검 기록일 때만 바꿔요
      const res = await db
        .prepare(
          `UPDATE burning SET maint_from = NULL, maint_last = NULL, until = ?1, started_at = CASE WHEN ?2 THEN ?3 ELSE started_at END
           WHERE id = 1 AND maint_from = ?4 AND maint_last = ?5`,
        )
        .bind(until, len > 0 ? 1 : 0, from, row.maint_from, row.maint_last)
        .run();
      cache = null;
      if (!res.meta.changes) row = await readRow(db, nowMs);
      else row = { maint_from: null, maint_last: null, until, started_at: from };
      if (!row) return null;
    } catch {
      return null;
    }
  }
  return row.until && row.started_at ? { from: row.started_at, until: row.until } : null;
}

// 지금 버닝타임이면 끝나는 시각(ISO), 아니면 null
export async function burningUntil(db: D1Database, nowMs = Date.now()): Promise<string | null> {
  const w = await burnWindow(db, nowMs);
  return w && inWindow(w, nowMs) ? w.until : null;
}

export const inWindow = (w: BurnWindow | null | undefined, atMs: number) => !!w && Date.parse(w.from) <= atMs && atMs < Date.parse(w.until);


// 화면에 보여 줄 끝나는 시각(한국 시간 "23:40")
export const burnEndText = (until: string) => {
  const d = new Date(Date.parse(until) + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
