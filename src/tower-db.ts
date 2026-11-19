// 끝없는 탑 도전과 펫 상점·키우기를 DB에 반영해요. 모두 원정 준비소 줄(journey_bank) 하나만 바꿔요.
import { bankPet, journeyBank, journeyTop, matPath } from './journey-db';
import { hasMats } from './journey';
import { PETS, anyMatChapter, petCap, petNeed, type PetId } from './pets';
import { TOWER_GAP_MS, TOWER_OPEN, boostCost, towerCoins, towerFight, towerMat, type BoostId, type TowerFight } from './tower';

// 화면에 한 번 보여 줄 마지막 도전 결과(journey_bank.tower_last)
export type TowerLast = { floor: number; won: boolean; fight: Pick<TowerFight, 'fx' | 'maxHp' | 'atk' | 'def'>; foe: { key: string; name: string }; boosts: BoostId[]; cost: number; coins: number; mat: { ch: number; n: number } | null; at: string };
export function parseTowerLast(raw: string | null | undefined): TowerLast | null {
  try {
    const v = JSON.parse(raw || 'null') as TowerLast | null;
    return v && Number.isSafeInteger(v.floor) && typeof v.won === 'boolean' && v.fight?.fx && Array.isArray(v.fight.fx.hits) ? v : null;
  } catch {
    return null;
  }
}

export type TowerResult = 'ok' | 'locked' | 'stale' | 'fast' | 'nocoins';
// 한 층 도전. seen = 화면에 보이던 층(옛 화면·두 번 누르기로 다른 층에 젤코인을 쓰지 않게).
// seenAt = 화면을 그릴 때의 마지막 도전 시각(tower_at). 진 뒤 옛 화면·늦게 온 재전송으로 물약 값이 두 번 나가지 않게
// 지금 값과 같을 때만 도전해요(undefined면 확인하지 않아요: 배포 전에 열어 둔 화면).
export async function towerAttempt(db: D1Database, user: string, seen: number, boosts: BoostId[], now = new Date(), seenAt?: string): Promise<TowerResult> {
  const [bank, top] = await Promise.all([journeyBank(db, user), journeyTop(db, user)]);
  if (top < TOWER_OPEN) return 'locked';
  const floor = bank.tower + 1;
  if (seen !== floor || (seenAt !== undefined && seenAt !== (bank.towerAt ?? ''))) return 'stale';
  if (bank.towerAt && now.getTime() - Date.parse(bank.towerAt) < TOWER_GAP_MS) return 'fast';
  const cost = boostCost(boosts, floor);
  if (cost > 0 && bank.coins < cost) return 'nocoins'; // 빚(마이너스)이 있어도 물약 없이는 도전할 수 있어요
  const f = towerFight(user, floor, bank, bank, bankPet(bank), boosts);
  const gain = f.won ? towerCoins(floor) : 0;
  const mat = f.won ? towerMat(floor, top) : null;
  const t = now.toISOString();
  const last: TowerLast = { floor, won: f.won, fight: { fx: f.fx, maxHp: f.maxHp, atk: f.atk, def: f.def }, foe: { key: f.foe.key, name: f.foe.name }, boosts, cost, coins: gain, mat, at: t };
  const gapFrom = new Date(now.getTime() - TOWER_GAP_MS).toISOString();
  const r = await db
    .prepare(
      `UPDATE journey_bank SET coins = coins - ?3 + ?4, tower = tower + ?5, tower_at = ?6, tower_last = ?7, updated_at = ?6,
         tower_up_at = CASE WHEN ?5 > 0 THEN ?6 ELSE tower_up_at END,
         mats = CASE WHEN ?8 > 0 THEN json_set(mats, ?9, COALESCE(json_extract(mats, ?9), 0) + ?8) ELSE mats END
       WHERE user_id = ?1 AND tower = ?2 AND (?3 = 0 OR coins >= ?3) AND (tower_at IS NULL OR tower_at <= ?10) AND (?11 IS NULL OR COALESCE(tower_at, '') = ?11)
         AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)`,
    )
    .bind(user, floor - 1, cost, gain, f.won ? 1 : 0, t, JSON.stringify(last), mat?.n ?? 0, matPath(mat?.ch ?? 1), gapFrom, seenAt ?? null)
    .run();
  return (r.meta.changes ?? 0) > 0 ? 'ok' : 'stale';
}

export type TowerRank = { user_id: string; display_name: string; tower: number };
export async function towerRanking(db: D1Database, limit = 10): Promise<TowerRank[]> {
  const { results } = await db
    .prepare(
      `SELECT b.user_id, m.display_name, b.tower FROM journey_bank b JOIN members m ON m.user_id = b.user_id AND m.active = 1
       WHERE b.tower > 0 ORDER BY b.tower DESC, b.tower_up_at ASC LIMIT ?`,
    )
    .bind(limit)
    .all<TowerRank>();
  return results;
}

const petPath = (id: PetId) => `$.${id}`;

// 펫 사기: 그 펫이 나오는 장을 깼고, 젤코인이 넉넉하고, 아직 없을 때만. 처음 산 펫은 바로 데려가요.
export async function buyPet(db: D1Database, user: string, id: PetId, now = new Date()): Promise<boolean> {
  const top = await journeyTop(db, user);
  const pet = PETS[id];
  if (top < pet.ch) return false;
  const r = await db
    .prepare(
      `UPDATE journey_bank SET coins = coins - ?2, pets = json_set(pets, ?3, 1), pet = COALESCE(pet, ?4), updated_at = ?5
       WHERE user_id = ?1 AND coins >= ?2 AND json_extract(pets, ?3) IS NULL
         AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)`,
    )
    .bind(user, pet.price, petPath(id), id, now.toISOString())
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// 펫 한 레벨. seen = 화면에 보이던 레벨. 최고 레벨(깬 장 × 5)이거나 재료·젤코인이 모자라면 false.
export async function levelPet(db: D1Database, user: string, id: PetId, seen?: number, now = new Date()): Promise<boolean> {
  const [bank, top] = await Promise.all([journeyBank(db, user), journeyTop(db, user)]);
  const lv = bank.pets[id];
  if (!lv || (seen !== undefined && seen !== lv) || lv + 1 > petCap(top)) return false;
  const need = petNeed(lv + 1);
  const cost = need.any ? (() => {
    const ch = anyMatChapter(bank.mats, need.any);
    return ch ? [{ ch, n: need.any }] : null;
  })() : need.cost;
  if (!cost || !hasMats(bank.mats, cost) || bank.coins < need.coins) return false;
  const sets: string[] = [];
  const checks: string[] = [];
  const binds: unknown[] = [user, lv, need.coins, now.toISOString(), petPath(id)];
  for (const c of cost) {
    const p = binds.push(matPath(c.ch));
    const n = binds.push(c.n);
    sets.push(`?${p}, COALESCE(json_extract(mats, ?${p}), 0) - ?${n}`);
    checks.push(`COALESCE(json_extract(mats, ?${p}), 0) >= ?${n}`);
  }
  const r = await db
    .prepare(
      `UPDATE journey_bank SET coins = coins - ?3, pets = json_set(pets, ?5, ?2 + 1), mats = json_set(mats, ${sets.join(', ')}), updated_at = ?4
       WHERE user_id = ?1 AND json_extract(pets, ?5) = ?2 AND coins >= ?3 AND ${checks.join(' AND ')}
         AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)`,
    )
    .bind(...binds)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// 데려갈 펫 고르기(null = 두고 가기). 가진 펫만.
export async function equipPet(db: D1Database, user: string, id: PetId | null, now = new Date()): Promise<boolean> {
  const r = id
    ? await db.prepare('UPDATE journey_bank SET pet = ?2, updated_at = ?3 WHERE user_id = ?1 AND json_extract(pets, ?4) IS NOT NULL').bind(user, id, now.toISOString(), petPath(id)).run()
    : await db.prepare('UPDATE journey_bank SET pet = NULL, updated_at = ?2 WHERE user_id = ?1').bind(user, now.toISOString()).run();
  return (r.meta.changes ?? 0) > 0;
}
