import { kstDay } from './db';
import { MAX_CHAPTER } from './journey-chapters';
import { dogamProgress, journeyOpenTo } from './unlock';
import { DAILY_REWARD_JOURNEYS, FIRST_CLEAR_BONUS, GEAR_MAX, NO_GEAR, gearNeed, type Gear, type GearId, NO_PERKS, PERKS, perkMax, actJourney, bankRate, decodeJourney, journeyJelly, journeyXp, perkCost, startJourney, kitCost, type KitId, type JourneyAction, type JourneyState, type PerkId, type Perks } from './journey';

export type JourneyRow = { id: string; user_id: string; state: string; rev: number; status: string; day: number; cleared: number; xp: number; jelly: number; reward_day: string | null };
export type JourneyRun = { row: JourneyRow; state: JourneyState };

function decode(row: JourneyRow | null): JourneyRun | null {
  const state = row && decodeJourney(row.state);
  return row && state ? { row, state } : null;
}

export async function activeJourney(db: D1Database, user: string): Promise<JourneyRun | null> {
  return decode(await db.prepare("SELECT * FROM journey_runs WHERE user_id = ? AND status = 'going'").bind(user).first<JourneyRow>());
}
export async function getJourney(db: D1Database, user: string, id: string): Promise<JourneyRun | null> {
  return decode(await db.prepare('SELECT * FROM journey_runs WHERE user_id = ? AND id = ?').bind(user, id).first<JourneyRow>());
}

export type JourneyRecord = { best: number; clears: number; rewardedToday: number; farmed: Record<number, number>; unlocked: number }; // farmed: 장마다 이미 깬 뒤 다시 돈 판 수(평생) // unlocked = 대장을 깨서 열린 가장 높은 장
export async function journeyRecord(db: D1Database, user: string, day = kstDay()): Promise<JourneyRecord> {
  const r = await db
    .prepare(
      `SELECT COALESCE(MAX((chapter - 1) * 20 + day), 0) AS best, COALESCE(SUM(cleared), 0) AS clears,
         COALESCE(MAX(CASE WHEN cleared = 1 THEN chapter ELSE 0 END), 0) AS top,
         COALESCE(SUM(CASE WHEN reward_day = ?2 AND xp > 0 THEN 1 ELSE 0 END), 0) AS today
       FROM journey_runs WHERE user_id = ?1 AND status = 'done'`,
    )
    .bind(user, day)
    .first<{ best: number; clears: number; today: number; top: number }>();
  return { best: r?.best ?? 0, clears: r?.clears ?? 0, rewardedToday: r?.today ?? 0, farmed: await farmedByChapter(db, user), unlocked: Math.min(MAX_CHAPTER, (r?.top ?? 0) + 1) };
}

// 장마다 이미 깬 뒤 다시 돈 판 수(날짜와 상관없이 전부)
export async function farmedByChapter(db: D1Database, user: string): Promise<Record<number, number>> {
  const rows = await db
    .prepare("SELECT chapter, COUNT(*) AS n FROM journey_runs WHERE user_id = ?1 AND status = 'done' AND json_extract(state, '$.farm') = 1 GROUP BY chapter")
    .bind(user)
    .all<{ chapter: number; n: number }>();
  return Object.fromEntries((rows.results ?? []).map((x) => [x.chapter, x.n]));
}

// 강화 주머니(모은 동전 + 훈련 단계 + 장비 단계 + 장마다 모은 재료)
export type JourneyBank = Perks & Gear & { coins: number; mats: Record<number, number> };
export async function journeyBank(db: D1Database, user: string): Promise<JourneyBank> {
  const r = await db
    .prepare('SELECT coins, atk, hp, def, weapon, armor, charm, mats FROM journey_bank WHERE user_id = ?')
    .bind(user)
    .first<Perks & Gear & { coins: number; mats: string }>();
  if (!r) return { coins: 0, ...NO_PERKS, ...NO_GEAR, mats: {} };
  let mats: Record<number, number> = {};
  try {
    const raw = JSON.parse(r.mats || '{}') as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) if (Number.isSafeInteger(Number(k)) && typeof v === 'number' && v > 0) mats[Number(k)] = v;
  } catch {
    mats = {};
  }
  return { ...r, mats };
}
const matPath = (ch: number) => `$."${ch}"`;

// 장비 한 단계. +N에는 N장 재료와 젤코인이 들어요. 모자라거나 끝까지 올렸거나 다른 화면에서 먼저 했으면 false.
export async function upgradeGear(db: D1Database, user: string, id: GearId, now = new Date()): Promise<boolean> {
  const bank = await journeyBank(db, user);
  const lv = bank[id];
  if (lv >= GEAR_MAX) return false;
  const need = gearNeed(lv + 1);
  if ((bank.mats[need.ch] ?? 0) < need.mats || bank.coins < need.coins) return false;
  const r = await db
    .prepare(
      `UPDATE journey_bank SET coins = coins - ?3, ${id} = ${id} + 1,
         mats = json_set(mats, ?4, COALESCE(json_extract(mats, ?4), 0) - ?5), updated_at = ?6
       WHERE user_id = ?1 AND ${id} = ?2 AND coins >= ?3 AND COALESCE(json_extract(mats, ?4), 0) >= ?5`,
    )
    .bind(user, lv, need.coins, matPath(need.ch), need.mats, now.toISOString())
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// 강화 한 단계. 동전이 모자라거나 끝까지 올렸거나 다른 화면에서 먼저 샀으면 false.
export async function buyPerk(db: D1Database, user: string, id: PerkId, now = new Date()): Promise<boolean> {
  const [bank, record, dogam] = await Promise.all([journeyBank(db, user), journeyRecord(db, user), dogamProgress(db, user)]);
  const lv = bank[id];
  const cost = perkCost(lv);
  const max = perkMax(id, Math.min(record.unlocked, journeyOpenTo(dogam)));
  if (lv >= max || bank.coins < cost) return false;
  const r = await db
    .prepare(`UPDATE journey_bank SET coins = coins - ?3, ${id} = ${id} + 1, updated_at = ?5 WHERE user_id = ?1 AND ${id} = ?2 AND coins >= ?3 AND ${id} < ?4`)
    .bind(user, lv, cost, max, now.toISOString())
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// 새 원정. 하던 원정이 있으면 그걸 이어가요. 지금 있는 멤버만 떠날 수 있어요.
// 출발 준비물이 있으면 그 값을 강화 주머니에서 빼고 떠나요(젤코인이 모자라면 NO_COINS).
export const NO_COINS = 'nocoins';
export async function beginJourney(db: D1Database, user: string, chapter = 1, now = new Date(), kit: KitId[] = []): Promise<string | null> {
  const going = await activeJourney(db, user);
  if (going) return going.row.id;
  // 앞 장을 깼고(unlocked), 도감 조건도 채운 장까지만 떠날 수 있어요.
  const [record, dogam] = await Promise.all([journeyRecord(db, user), dogamProgress(db, user)]);
  const level = Math.min(record.unlocked, journeyOpenTo(dogam));
  const ch = Math.min(chapter, level);
  if (!Number.isSafeInteger(ch) || ch < 1) return null;
  const id = crypto.randomUUID();
  const t = now.toISOString();
  const bank = await journeyBank(db, user);
  const cost = kitCost(kit, level);
  if (cost > bank.coins) return NO_COINS;
  const state = startJourney(id, bank, ch, bank, kit);
  // 이미 깬 장(재료가 덜 나와요). 마지막 장을 깨도 unlocked는 더 올라가지 않아요.
  state.farm = ch < record.unlocked || (ch === MAX_CHAPTER && !!await db
    .prepare("SELECT 1 FROM journey_runs WHERE user_id = ? AND chapter = ? AND status = 'done' AND cleared = 1 LIMIT 1")
    .bind(user, ch)
    .first());
  const insert = (paid: string) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO journey_runs (id, user_id, state, started_at, updated_at, chapter)
         SELECT ?1, ?2, ?3, ?4, ?4, ?5 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)${paid}`,
      )
      .bind(id, user, JSON.stringify(state), t, ch);
  if (cost > 0) {
    // 젤코인이 넉넉할 때만 판을 만들고, 만들어진 판이 있을 때만 젤코인을 빼요(한 번에 처리).
    await db.batch([
      insert(` AND (SELECT coins FROM journey_bank WHERE user_id = ?2) >= ${cost}`),
      db
        .prepare(`UPDATE journey_bank SET coins = coins - ?2, updated_at = ?3 WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM journey_runs WHERE id = ?4 AND user_id = ?1)`)
        .bind(user, cost, t, id),
    ]);
  } else await insert('').run();
  const now2 = await activeJourney(db, user);
  if (!now2 && cost > 0) return NO_COINS;
  return now2?.row.id ?? null;
}

export async function quitJourney(db: D1Database, user: string, id: string): Promise<boolean> {
  const t = new Date().toISOString();
  const r = await db.prepare("UPDATE journey_runs SET status = 'quit', updated_at = ?3, ended_at = ?3 WHERE id = ?1 AND user_id = ?2 AND status = 'going'").bind(id, user, t).run();
  return (r.meta.changes ?? 0) > 0;
}

// 행동 하나. rev = 화면에 보이던 판의 순번(옛 화면·두 번 누르기 막기).
// 원정이 끝나면 한국 날짜로 하루 첫 몇 판만 경험치·젤리를 주고, 판 저장과 보상은 한 번에 반영해요.
export async function actJourneyRun(db: D1Database, user: string, id: string, rev: number, act: JourneyAction, now = new Date()): Promise<'ok' | 'stale' | 'bad'> {
  const run = await getJourney(db, user, id);
  if (!run || run.row.status !== 'going' || run.row.rev !== rev) return 'stale';
  const s = actJourney(run.state, act);
  if (!s) return 'bad';
  let top = 0;
  if (s.done) {
    // 아직 못 깬 장(도전 중)은 죽든 이기든 젤코인이 다 모여요.
    // 이미 대장을 깬 장을 다시 도는 판(파밍)만 그 장을 다시 돈 판 수(날짜와 상관없이)에 따라 줄어요.
    const r = await db
      .prepare(
        `SELECT COALESCE(MAX(CASE WHEN cleared = 1 THEN chapter ELSE 0 END), 0) AS top,
           COALESCE(SUM(CASE WHEN chapter = ?2 AND json_extract(state, '$.farm') = 1 THEN 1 ELSE 0 END), 0) AS farmed
         FROM journey_runs WHERE user_id = ?1 AND status = 'done'`,
      )
      .bind(user, s.ch ?? 1)
      .first<{ top: number; farmed: number }>();
    top = r?.top ?? 0;
    s.farm = (s.ch ?? 1) <= top;
    s.bankPct = s.farm ? bankRate(r?.farmed ?? 0) : 100;
    s.banked = Math.floor((s.coins * s.bankPct) / 100);
    // 재료: 젤코인과 달리 깬 장을 몇 판 돌아도 그대로 모여요(다음 장을 기다리는 동안 장비를 채우게, 나리 2026-11-13). 처음 대장을 깨면 2개 더.
    s.matsBanked = (s.mats ?? 0) + (s.cleared && !s.farm ? FIRST_CLEAR_BONUS : 0);
  }
  const t = now.toISOString();
  const token = crypto.randomUUID();
  const day = kstDay(now);
  const room = `(SELECT COUNT(*) FROM journey_runs WHERE user_id = ?2 AND reward_day = ?7 AND xp > 0) < ${DAILY_REWARD_JOURNEYS}`;
  const stmts = [
    db
      .prepare(
        `UPDATE journey_runs SET state = ?4, rev = rev + 1, mutation = ?3, updated_at = ?5, day = ?10, cleared = ?11,
           status = CASE WHEN ?6 THEN 'done' ELSE 'going' END, ended_at = CASE WHEN ?6 THEN ?5 ELSE NULL END,
           reward_day = CASE WHEN ?6 THEN ?7 ELSE NULL END,
           xp = CASE WHEN ?6 AND ${room} THEN ?8 ELSE 0 END,
           jelly = CASE WHEN ?6 THEN ?9 ELSE 0 END
         WHERE id = ?1 AND user_id = ?2 AND rev = ?12 AND status = 'going'
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
      )
      .bind(id, user, token, JSON.stringify(s), t, s.done ? 1 : 0, day, journeyXp(s.day, s.cleared, s.ch ?? 1), journeyJelly(s.cleared, s.ch ?? 1, top), s.day, s.cleared ? 1 : 0, rev),
  ];
  if (s.done) {
    // 남은 동전(같은 장을 또 하면 줄어든 만큼)은 보상 횟수와 상관없이 강화 주머니로 (이번 저장이 성공했을 때만)
    stmts.push(
      db
        .prepare(
          `INSERT INTO journey_bank (user_id, coins, mats, updated_at)
           SELECT user_id, ?3, json_set('{}', ?5, ?6), ?4 FROM journey_runs WHERE id = ?1 AND mutation = ?2 AND status = 'done'
           ON CONFLICT (user_id) DO UPDATE SET coins = journey_bank.coins + excluded.coins,
             mats = json_set(journey_bank.mats, ?5, COALESCE(json_extract(journey_bank.mats, ?5), 0) + ?6), updated_at = excluded.updated_at`,
        )
        .bind(id, token, s.banked ?? s.coins, t, matPath(s.ch ?? 1), s.matsBanked ?? 0),
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO profiles (user_id, solo_xp, dogam_jelly, updated_at)
           SELECT user_id, xp, jelly, ?3 FROM journey_runs WHERE id = ?1 AND mutation = ?2 AND (xp > 0 OR jelly > 0)
           ON CONFLICT (user_id) DO UPDATE SET solo_xp = COALESCE(profiles.solo_xp, 0) + excluded.solo_xp,
             dogam_jelly = COALESCE(profiles.dogam_jelly, 0) + excluded.dogam_jelly, updated_at = excluded.updated_at`,
        )
        .bind(id, token, t),
    );
  }
  const r = await db.batch(stmts);
  return (r[0]?.meta.changes ?? 0) === 1 ? 'ok' : 'stale';
}
