import { kstDay } from './db';
import { MAX_CHAPTER } from './journey-chapters';
import { BURN_FARM_MIN } from './burning';
import { dogamProgress, journeyOpenTo, releasedTop } from './unlock';
import { isPetId, parsePets, type PetBag, type PetId } from './pets';
import { DAILY_REWARD_JOURNEYS, FIRST_CLEAR_BONUS, GEAR_MAX, NO_GEAR, gearNeed, hasMats, canSellMat, matSellLevel, matSellPrice, type Gear, type GearId, NO_PERKS, PERKS, perkMax, actJourney, bankRate, decodeJourney, journeyJelly, journeyXp, perkCost, startJourney, kitCost, type KitId, type JourneyAction, type JourneyState, type PerkId, type Perks } from './journey';

export type JourneyRow = { id: string; user_id: string; state: string; rev: number; status: string; day: number; cleared: number; xp: number; jelly: number; reward_day: string | null };
export type JourneyRun = { row: JourneyRow; state: JourneyState };

function decode(row: JourneyRow | null): JourneyRun | null {
  const state = row && decodeJourney(row.state);
  return row && state ? { row, state } : null;
}

export async function activeJourney(db: D1Database, user: string): Promise<JourneyRun | null> {
  return decode(await db.prepare("SELECT * FROM journey_runs WHERE user_id = ? AND status = 'going'").bind(user).first<JourneyRow>());
}
// 진행 중인 판이 깨져서(옛 형식 등) 읽을 수 없으면 그 판만 그만둔 걸로 해요. 안 그러면 새 판도 못 만들고
// 화면에도 안 보여서 혼자서는 빠져나올 수 없어요(점검 W196). 읽을 수 있는 판은 건드리지 않아요.
async function dropBrokenJourney(db: D1Database, user: string, t: string): Promise<void> {
  const row = await db.prepare("SELECT * FROM journey_runs WHERE user_id = ? AND status = 'going'").bind(user).first<JourneyRow>();
  if (!row || decode(row)) return;
  await db
    .prepare("UPDATE journey_runs SET status = 'quit', updated_at = ?3, ended_at = ?3 WHERE id = ?1 AND user_id = ?2 AND status = 'going' AND rev = ?4")
    .bind(row.id, user, t, row.rev)
    .run();
}
export async function getJourney(db: D1Database, user: string, id: string): Promise<JourneyRun | null> {
  return decode(await db.prepare('SELECT * FROM journey_runs WHERE user_id = ? AND id = ?').bind(user, id).first<JourneyRow>());
}

export type JourneyRecord = { best: number; clears: number; rewardedToday: number; farmed: Record<number, number>; unlocked: number; top: number; last?: number }; // last = 마지막으로 돈(끝낸) 판의 장. 다음 판도 그 장이 먼저 골라져요 // farmed: 장마다 이미 깬 뒤 다시 돈 판 수(평생) // unlocked = 대장을 깨서 열린 가장 높은 장
export async function journeyRecord(db: D1Database, user: string, day = kstDay()): Promise<JourneyRecord> {
  // 가장 높이 간 레벨·대장 횟수·다시 돈 판 수는 판이 끝날 때 강화 주머니 줄에 모아 둬요(0047).
  // 나머지도 색인으로 몇 줄만 읽어요. 지난 판을 전부 훑으면 무료 DB 읽기 한도를 넘겨요(2026-11-17).
  const r = await db
    .prepare(
      `SELECT COALESCE((SELECT chapter FROM journey_runs WHERE user_id = ?1 AND status = 'done' AND cleared = 1 ORDER BY chapter DESC LIMIT 1), 0) AS top,
         (SELECT COUNT(*) FROM journey_runs WHERE user_id = ?1 AND status = 'done' AND reward_day = ?2 AND xp > 0)
           + COALESCE((SELECT xp_used FROM game_resets WHERE user_id = ?1 AND xp_day = ?2), 0) AS today,
         (SELECT chapter FROM journey_runs WHERE user_id = ?1 AND status != 'going' ORDER BY started_at DESC LIMIT 1) AS last,
         b.best, b.clears, b.farmed
       FROM (SELECT 1) LEFT JOIN journey_bank b ON b.user_id = ?1`,
    )
    .bind(user, day)
    .first<{ best: number | null; clears: number | null; today: number; top: number; last: number | null; farmed: string | null }>();
  return { best: r?.best ?? 0, clears: r?.clears ?? 0, rewardedToday: r?.today ?? 0, farmed: parseFarmed(r?.farmed), unlocked: Math.min(MAX_CHAPTER, (r?.top ?? 0) + 1), top: r?.top ?? 0, last: r?.last ?? undefined };
}

// 대장을 깬 가장 높은 장(색인으로 한 줄만 읽어요. MAX를 COALESCE로 감싸면 색인을 끝까지 훑어서 ORDER BY … LIMIT 1로 써요)
export async function journeyTop(db: D1Database, user: string): Promise<number> {
  const r = await db
    .prepare("SELECT COALESCE((SELECT chapter FROM journey_runs WHERE user_id = ?1 AND status = 'done' AND cleared = 1 ORDER BY chapter DESC LIMIT 1), 0) AS top")
    .bind(user)
    .first<{ top: number }>();
  return r?.top ?? 0;
}
export const unlockedFrom = (top: number) => Math.min(MAX_CHAPTER, top + 1);

// 장마다 이미 깬 뒤 다시 돈 판 수(날짜와 상관없이 전부). journey_bank.farmed = {"장": 판 수}
function parseFarmed(raw: string | null | undefined): Record<number, number> {
  const out: Record<number, number> = {};
  try {
    for (const [k, v] of Object.entries(JSON.parse(raw || '{}') as Record<string, unknown>)) {
      if (Number.isSafeInteger(Number(k)) && typeof v === 'number' && v > 0) out[Number(k)] = v;
    }
  } catch {
    /* 비어 있는 걸로 봐요 */
  }
  return out;
}

// 강화 주머니(모은 동전 + 훈련 단계 + 장비 단계 + 장마다 모은 재료)
// pets = 가진 펫과 레벨, pet = 데려가는 펫, tower = 끝없는 탑에서 깬 가장 높은 층(0051)
export type JourneyBank = Perks & Gear & { coins: number; mats: Record<number, number>; pets: PetBag; pet: PetId | null; tower: number; towerAt: string | null; towerLast: string | null };
export async function journeyBank(db: D1Database, user: string): Promise<JourneyBank> {
  const r = await db
    .prepare('SELECT coins, atk, hp, def, weapon, armor, charm, mats, pets, pet, tower, tower_at, tower_last FROM journey_bank WHERE user_id = ?')
    .bind(user)
    .first<Perks & Gear & { coins: number; mats: string; pets: string; pet: string | null; tower: number; tower_at: string | null; tower_last: string | null }>();
  if (!r) return { coins: 0, ...NO_PERKS, ...NO_GEAR, mats: {}, pets: {}, pet: null, tower: 0, towerAt: null, towerLast: null };
  let mats: Record<number, number> = {};
  try {
    const raw = JSON.parse(r.mats || '{}') as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) if (Number.isSafeInteger(Number(k)) && typeof v === 'number' && v > 0) mats[Number(k)] = v;
  } catch {
    mats = {};
  }
  const pets = parsePets(r.pets);
  const pet = isPetId(r.pet) && pets[r.pet] ? r.pet : null;
  return { coins: r.coins, atk: r.atk, hp: r.hp, def: r.def, weapon: r.weapon, armor: r.armor, charm: r.charm, mats, pets, pet, tower: r.tower ?? 0, towerAt: r.tower_at ?? null, towerLast: r.tower_last ?? null };
}
// 데려가는 펫과 그 레벨(없으면 null)
export const bankPet = (bank: JourneyBank) => (bank.pet && bank.pets[bank.pet] ? { id: bank.pet, lv: bank.pets[bank.pet]! } : null);
export const matPath = (ch: number) => `$."${ch}"`;

// 장비 한 단계. +N에는 N장 재료, 바로 앞 장 재료(LOWER_MATS개), 젤코인이 들어요. 모자라거나 끝까지 올렸거나 다른 화면에서 먼저 했으면 false.
// seen = 화면에 보이던 단계(오래된 화면에서 누르면 다음 단계 값을 내지 않게).
export async function upgradeGear(db: D1Database, user: string, id: GearId, now = new Date(), seen?: number): Promise<boolean> {
  const bank = await journeyBank(db, user);
  const lv = bank[id];
  if (lv >= Math.min(GEAR_MAX, releasedTop(MAX_CHAPTER, now)) || (seen !== undefined && seen !== lv)) return false; // 준비 중인 장의 재료 단계는 아직 못 올려요
  const need = gearNeed(lv + 1);
  if (!hasMats(bank.mats, need.cost) || bank.coins < need.coins) return false;
  // 재료는 장마다 따로 빼요. 하나라도 모자라면(다른 화면에서 먼저 썼으면) 아무것도 빼지 않아요.
  const sets: string[] = [];
  const checks: string[] = [];
  const binds: unknown[] = [user, lv, need.coins, now.toISOString()];
  for (const c of need.cost) {
    const p = binds.push(matPath(c.ch));
    const n = binds.push(c.n);
    sets.push(`?${p}, COALESCE(json_extract(mats, ?${p}), 0) - ?${n}`);
    checks.push(`COALESCE(json_extract(mats, ?${p}), 0) >= ?${n}`);
  }
  const r = await db
    .prepare(
      `UPDATE journey_bank SET coins = coins - ?3, ${id} = ${id} + 1, mats = json_set(mats, ${sets.join(', ')}), updated_at = ?4
       WHERE user_id = ?1 AND ${id} = ?2 AND coins >= ?3 AND ${checks.join(' AND ')}`,
    )
    .bind(...binds)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// 남는 재료 팔기: 그 장 재료를 가진 만큼 모두 젤코인으로 바꿔요. seen = 화면에 보이던 개수(다른 화면에서 바뀌었으면 false).
export async function sellMats(db: D1Database, user: string, ch: number, seen: number, now = new Date()): Promise<number> {
  if (!Number.isSafeInteger(ch) || !Number.isSafeInteger(seen) || seen <= 0) return 0;
  const bank = await journeyBank(db, user);
  if (!canSellMat(bank, ch) || (bank.mats[ch] ?? 0) !== seen) return 0;
  const lv = matSellLevel(ch);
  const coins = seen * matSellPrice(ch);
  const r = await db
    .prepare(
      `UPDATE journey_bank SET coins = coins + ?3, mats = json_set(mats, ?2, 0), updated_at = ?5
       WHERE user_id = ?1 AND COALESCE(json_extract(mats, ?2), 0) = ?4 AND weapon >= ?6 AND armor >= ?6 AND charm >= ?6`,
    )
    .bind(user, matPath(ch), coins, seen, now.toISOString(), lv)
    .run();
  return (r.meta.changes ?? 0) > 0 ? coins : 0;
}

// 강화 한 단계. 동전이 모자라거나 끝까지 올렸거나 다른 화면에서 먼저 샀으면 false.
export async function buyPerk(db: D1Database, user: string, id: PerkId, now = new Date(), seen?: number): Promise<boolean> {
  const [bank, top, dogam] = await Promise.all([journeyBank(db, user), journeyTop(db, user), dogamProgress(db, user)]);
  const lv = bank[id];
  if (seen !== undefined && seen !== lv) return false;
  const cost = perkCost(lv);
  const max = perkMax(id, Math.min(unlockedFrom(top), journeyOpenTo(dogam, now)));
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
// 화면을 연 뒤 고른 장이 잠겼거나 준비물 값이 바뀌었으면(STALE) 떠나지 않고 새 화면을 보여 줘요.
export const STALE_PICK = 'stalepick';
const SLIM_AFTER_MS = 3 * 86_400_000;
export async function beginJourney(db: D1Database, user: string, chapter = 1, now = new Date(), kit: KitId[] = [], shownLevel?: number): Promise<string | null> {
  const going = await activeJourney(db, user);
  if (going) return going.row.id;
  await dropBrokenJourney(db, user, now.toISOString());
  // 앞 장을 깼고(unlocked), 도감 조건도 채운 장까지만 떠날 수 있어요.
  const [top, dogam] = await Promise.all([journeyTop(db, user), dogamProgress(db, user)]);
  const unlocked = unlockedFrom(top);
  const level = Math.min(unlocked, journeyOpenTo(dogam, now));
  if (!Number.isSafeInteger(chapter) || chapter < 1) return null;
  if (chapter > level || (kit.length > 0 && shownLevel !== undefined && shownLevel !== level)) return STALE_PICK;
  const ch = chapter;
  const id = crypto.randomUUID();
  const t = now.toISOString();
  // 게임 기록 초기화 횟수(세대). 장비를 읽은 뒤 그 사이 초기화됐으면 옛 장비로 판을 만들지 않아요.
  const gen = Number((await db.prepare('SELECT count FROM game_resets WHERE user_id = ?').bind(user).first<{ count: number }>())?.count ?? 0);
  const bank = await journeyBank(db, user);
  const cost = kitCost(kit, level);
  if (cost > 0 && cost > bank.coins) return NO_COINS; // 빚(마이너스)이 있어도 준비물 없이는 떠날 수 있어요
  // 난수 씨앗은 화면 폼에 보이는 판 번호(id)와 따로 서버에만 둬요(판 번호로 동전 던지기·샘 결과를 미리 계산하지 못하게).
  const state = startJourney(crypto.randomUUID(), bank, ch, bank, kit, bankPet(bank));
  // 서버 부스터면 이번 판 재료 확률이 조금 높아요(떠날 때 정해져요)
  const booster = await db.prepare('SELECT booster FROM members WHERE user_id = ?').bind(user).first<{ booster: number }>();
  if (Number(booster?.booster) === 1) state.bst = true;
  // 이미 깬 장(재료가 덜 나와요). 마지막 장을 깨도 unlocked는 더 올라가지 않아요.
  state.farm = ch < unlocked || (ch === MAX_CHAPTER && !!await db
    .prepare("SELECT 1 FROM journey_runs WHERE user_id = ? AND chapter = ? AND status = 'done' AND cleared = 1 LIMIT 1")
    .bind(user, ch)
    .first());
  const insert = (paid: string) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO journey_runs (id, user_id, state, started_at, updated_at, chapter)
         SELECT ?1, ?2, ?3, ?4, ?4, ?5 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)
           AND COALESCE((SELECT count FROM game_resets WHERE user_id = ?2), 0) = ?6${paid}`,
      )
      .bind(id, user, JSON.stringify(state), t, ch, gen);
  if (cost > 0) {
    // 젤코인이 넉넉할 때만 판을 만들고, 만들어진 판이 있을 때만 젤코인을 빼요(한 번에 처리).
    await db.batch([
      insert(` AND (SELECT coins FROM journey_bank WHERE user_id = ?2) >= ${cost}`),
      db
        .prepare(`UPDATE journey_bank SET coins = coins - ?2, updated_at = ?3 WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM journey_runs WHERE id = ?4 AND user_id = ?1)`)
        .bind(user, cost, t, id),
    ]);
  } else await insert('').run();
  // 끝난 지 3일 넘은 판은 진행 내용을 비워요(한 판 2~3KB라 쌓이면 무료 DB 500MB 한도에 닿아요).
  // 순위·재료 집계는 칸(day, cleared, chapter …)과 farm만 써요. 실패해도 새 판은 그대로예요.
  await db
    .prepare(
      `UPDATE journey_runs SET state = json_object('farm', json_extract(state, '$.farm'))
       WHERE user_id = ?1 AND status != 'going' AND length(state) > 200 AND updated_at < ?2`,
    )
    .bind(user, new Date(now.getTime() - SLIM_AFTER_MS).toISOString())
    .run()
    .catch((e) => console.error('지난 원정 기록 줄이기 실패', e));
  const now2 = await activeJourney(db, user);
  if (!now2 && cost > 0) return NO_COINS;
  return now2?.row.id ?? null;
}

// rev를 주면 화면에 보이던 판 순번과 같을 때만 그만둬요(다른 탭에서 진행한 판을 옛 버튼으로 잃지 않게).
export async function quitJourney(db: D1Database, user: string, id: string, rev?: number): Promise<boolean> {
  const t = new Date().toISOString();
  const r = await db
    .prepare("UPDATE journey_runs SET status = 'quit', updated_at = ?3, ended_at = ?3 WHERE id = ?1 AND user_id = ?2 AND status = 'going' AND (?4 IS NULL OR rev = ?4)")
    .bind(id, user, t, rev ?? null)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// 행동 하나. rev = 화면에 보이던 판의 순번(옛 화면·두 번 누르기 막기).
// 원정이 끝나면 한국 날짜로 하루 첫 몇 판만 경험치·젤리를 주고, 판 저장과 보상은 한 번에 반영해요.
// burn = 지금 버닝타임(재료 나올 확률 1.5배, 깬 장 다시 돌아도 젤코인 최소 50%)
export async function actJourneyRun(db: D1Database, user: string, id: string, rev: number, act: JourneyAction, now = new Date(), burn = false): Promise<'ok' | 'stale' | 'bad'> {
  const run = await getJourney(db, user, id);
  if (!run || run.row.status !== 'going' || run.row.rev !== rev) return 'stale';
  const before = { ...run.state };
  if (burn) before.burn = true;
  else delete before.burn;
  const s = actJourney(before, act);
  if (!s) return 'bad';
  let top = 0;
  let jellyTop = 0;
  if (s.done) {
    // 아직 못 깬 장(도전 중)은 죽든 이기든 젤코인이 다 모여요.
    // 이미 대장을 깬 장을 다시 도는 판(파밍)만 그 장을 다시 돈 판 수(날짜와 상관없이)에 따라 줄어요.
    const r = await db
      .prepare(
        `SELECT COALESCE((SELECT chapter FROM journey_runs WHERE user_id = ?1 AND status = 'done' AND cleared = 1 ORDER BY chapter DESC LIMIT 1), 0) AS top,
           COALESCE((SELECT json_extract(farmed, ?2) FROM journey_bank WHERE user_id = ?1), 0) AS farmed,
           COALESCE((SELECT journey_jelly_top FROM game_resets WHERE user_id = ?1), 0) AS paid`,
      )
      .bind(user, matPath(s.ch ?? 1))
      .first<{ top: number; farmed: number; paid: number }>();
    top = r?.top ?? 0;
    // 게임 기록 초기화 전에 이미 받은 장 젤리는 다시 주지 않아요
    jellyTop = Math.max(top, r?.paid ?? 0);
    s.farm = (s.ch ?? 1) <= top;
    s.bankPct = s.farm ? bankRate(r?.farmed ?? 0) : 100;
    if (burn && s.bankPct < BURN_FARM_MIN) s.bankPct = BURN_FARM_MIN;
    s.banked = Math.floor((s.coins * s.bankPct) / 100);
    // 재료: 젤코인과 달리 깬 장을 몇 판 돌아도 그대로 모여요(다음 장을 기다리는 동안 장비를 채우게, 나리 2026-11-13). 처음 대장을 깨면 2개 더.
    s.matsBanked = (s.mats ?? 0) + (s.cleared && !s.farm ? FIRST_CLEAR_BONUS : 0);
  }
  const t = now.toISOString();
  const token = crypto.randomUUID();
  const day = kstDay(now);
  // 오늘 게임 기록 초기화 전에 받은 판 수(game_resets.xp_used)도 하루 보상 판 수에 세요
  const room = `((SELECT COUNT(*) FROM journey_runs WHERE user_id = ?2 AND reward_day = ?7 AND xp > 0)
    + COALESCE((SELECT xp_used FROM game_resets WHERE user_id = ?2 AND xp_day = ?7), 0)) < ${DAILY_REWARD_JOURNEYS}`;
  // 아직 진행 중인 판은 진행 내용만 저장해요. 상태·보상 칸(색인에 들어 있는 칸)을 건드리지 않아서
  // DB 쓰기가 한 번에 4줄 → 1줄로 줄어요(무료 한도 하루 10만 줄).
  if (!s.done) {
    const r = await db
      .prepare(
        `UPDATE journey_runs SET state = ?4, rev = rev + 1, mutation = ?3, updated_at = ?5, day = ?6
         WHERE id = ?1 AND user_id = ?2 AND rev = ?7 AND status = 'going'
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)`,
      )
      .bind(id, user, token, JSON.stringify(s), t, s.day, rev)
      .run();
    return (r.meta.changes ?? 0) === 1 ? 'ok' : 'stale';
  }
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
      .bind(id, user, token, JSON.stringify(s), t, s.done ? 1 : 0, day, journeyXp(s.day, s.cleared, s.ch ?? 1), journeyJelly(s.cleared, s.ch ?? 1, jellyTop), s.day, s.cleared ? 1 : 0, rev),
  ];
  if (s.done) {
    // 남은 동전(같은 장을 또 하면 줄어든 만큼)은 보상 횟수와 상관없이 강화 주머니로 (이번 저장이 성공했을 때만)
    stmts.push(
      db
        .prepare(
          `INSERT INTO journey_bank (user_id, coins, mats, updated_at, best, clears, farmed)
           SELECT user_id, ?3, json_set('{}', ?5, ?6), ?4, ?7, ?8, CASE WHEN ?9 THEN json_set('{}', ?5, 1) ELSE '{}' END
           FROM journey_runs WHERE id = ?1 AND mutation = ?2 AND status = 'done'
           ON CONFLICT (user_id) DO UPDATE SET coins = journey_bank.coins + excluded.coins,
             mats = json_set(journey_bank.mats, ?5, COALESCE(json_extract(journey_bank.mats, ?5), 0) + ?6), updated_at = excluded.updated_at,
             best = MAX(journey_bank.best, excluded.best), clears = journey_bank.clears + excluded.clears,
             farmed = CASE WHEN ?9 THEN json_set(journey_bank.farmed, ?5, COALESCE(json_extract(journey_bank.farmed, ?5), 0) + 1) ELSE journey_bank.farmed END`,
        )
        // 원정대 기록 모음(0047): 가장 높이 간 레벨, 대장 깬 횟수, 이미 깬 장을 다시 돈 판 수
        .bind(id, token, s.banked ?? s.coins, t, matPath(s.ch ?? 1), s.matsBanked ?? 0, ((s.ch ?? 1) - 1) * 20 + s.day, s.cleared ? 1 : 0, s.farm ? 1 : 0),
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
