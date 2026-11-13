import { XP_SCALE, levelFromXp } from './levels';
import type { Member } from './env';
import { stripTitle } from './titles';
import type { LoginProfile } from './discord';
import { type CharacterPool, pickCharacter, poolOf, shouldRepick } from './character';

export type Profile = {
  user_id: string;
  solo_xp: number;
  intro: string;
  theme_id: string;
  character_id: string | null;
  deco_id: string | null;
  dogam_jelly: number;
  title_id?: string | null;
};

export type DogamEntry = {
  user_id: string;
  display_name: string;
  joined_at: string | null;
  active: number;
  is_newbie: number;
  owned: number;
  xp: number;
  voice_seconds: number;
  scrims: number;
  first_met: string | null;
  theme_id: string | null;
  intro: string | null;
  character_id: string | null;
  deco_id: string | null;
  title_id: string | null;
};

const now = () => new Date().toISOString();

export function getMember(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM members WHERE user_id = ?').bind(id).first<Member>();
}

// 로그인한 채로 다시 들어와도 '들어온 때'를 남겨요(세션이 시즌보다 길어서). 한 시간에 한 번만 써요.
export const VISIT_TOUCH_MS = 60 * 60 * 1000;
export async function touchVisit(db: D1Database, member: Member, nowMs: number) {
  const last = Date.parse(member.last_login_at ?? '');
  if (Number.isFinite(last) && nowMs - last < VISIT_TOUCH_MS) return;
  await db.prepare('UPDATE members SET last_login_at = ? WHERE user_id = ?').bind(new Date(nowMs).toISOString(), member.user_id).run();
}

// 로그인할 때 디스코드에서 확인한 정보로 멤버를 바로 등록해요. 봇 동기화를 기다리지 않아도 돼요.
export async function upsertLoginMember(db: D1Database, p: LoginProfile) {
  await db
    .prepare(
      `INSERT INTO members (user_id, display_name, avatar_url, joined_at, is_newbie, active, updated_at, last_login_at)
       VALUES (?1, ?2, ?3, ?4, 0, 1, ?5, ?5)
       ON CONFLICT (user_id) DO UPDATE SET display_name = ?2, avatar_url = ?3,
         joined_at = COALESCE(?4, joined_at), active = 1, updated_at = ?5, last_login_at = ?5`,
    )
    .bind(p.id, stripTitle(p.name) || p.name, p.avatar_url, p.joined_at, now())
    .run();
  await assignCharacters(db, [p.id]);
  await giveStarterJelly(db, [p.id]);
}

export async function getProfile(db: D1Database, id: string): Promise<Profile> {
  const row = await db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(id).first<Profile>();
  return row ?? { user_id: id, solo_xp: 0, intro: '', theme_id: 'basic', character_id: null, deco_id: null, dogam_jelly: 0 };
}

export async function saveProfile(db: D1Database, id: string, intro: string, theme: string) {
  await db
    .prepare(
      `INSERT INTO profiles (user_id, intro, theme_id, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id) DO UPDATE SET intro = ?2, theme_id = ?3, updated_at = ?4`,
    )
    .bind(id, intro, theme, now())
    .run();
}

const DOGAM_SELECT = `SELECT m.user_id, m.display_name, m.joined_at, m.active, m.is_newbie,
              (c.owner_id IS NOT NULL) AS owned,
              COALESCE(c.xp, 0) AS xp, COALESCE(c.voice_seconds, 0) AS voice_seconds,
              COALESCE(c.scrims, 0) AS scrims, c.first_met,
              p.theme_id, p.intro, p.character_id, p.deco_id, p.title_id
       FROM members m
       LEFT JOIN cards c ON c.owner_id = ?1 AND c.target_id = m.user_id
       LEFT JOIN profiles p ON p.user_id = m.user_id`;

// owner의 도감: 지금 있는 멤버 전부 + 떠났지만 owner가 카드를 가진 멤버
export async function listDogam(db: D1Database, ownerId: string): Promise<DogamEntry[]> {
  const { results } = await db
    .prepare(
      `${DOGAM_SELECT}
       WHERE m.user_id != ?1 AND (m.active = 1 OR c.owner_id IS NOT NULL)
       ORDER BY owned DESC, m.active DESC, xp DESC, m.display_name`,
    )
    .bind(ownerId)
    .all<DogamEntry>();
  return results;
}

// owner가 가진 target 카드 한 장 (없으면 null)
export function getOwnedCard(db: D1Database, ownerId: string, targetId: string) {
  return db
    .prepare(`${DOGAM_SELECT} WHERE m.user_id = ?2 AND c.owner_id IS NOT NULL`)
    .bind(ownerId, targetId)
    .first<DogamEntry>();
}

export function completion(entries: DogamEntry[]) {
  const current = entries.filter((e) => e.active);
  return { owned: current.filter((e) => e.owned).length, total: current.length };
}

// 캐릭터가 아직 없는 멤버에게 서버 안에서 겹치지 않는 캐릭터를 정해 줘요.
// 여분 색을 받았던 멤버는 새 디자인이 생기면 그쪽으로 옮겨 줘요.
// 두 사람이 동시에 같은 캐릭터를 고르면 겹침 검사(유니크 인덱스)에 한쪽이 막혀요. 그때는 다시 읽고 다시 골라요.
function isSigConflict(e: unknown): boolean {
  const text = String(e);
  return text.includes('UNIQUE') && text.includes('character_sig');
}

async function retrySigConflict<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (!isSigConflict(e) || attempt >= 5) throw e;
    }
  }
}

export async function assignCharacters(db: D1Database, userIds: string[]) {
  if (userIds.length === 0) return;
  await retrySigConflict(() => assignCharactersOnce(db, userIds));
}

async function assignCharactersOnce(db: D1Database, userIds: string[]) {
  const { results: rows } = await db
    .prepare('SELECT user_id, character_id, character_sig FROM profiles WHERE character_sig IS NOT NULL OR user_id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(userIds))
    .all<{ user_id: string; character_id: string | null; character_sig: string | null }>();
  const taken = new Set(rows.flatMap((r) => (r.character_sig ? [r.character_sig] : [])));
  const current = new Map(rows.map((r) => [r.user_id, r.character_id]));
  const stmts: D1PreparedStatement[] = [];
  const t = now();
  for (const id of new Set(userIds)) {
    const before = current.get(id) ?? null;
    if (before && !shouldRepick(before, taken)) continue;
    // 소녀/소년을 골라 둔 멤버는 그 묶음 안에서만 바꿔요
    const character = pickCharacter(id, taken, poolOf(before));
    // 전부 차서 겹치는 캐릭터를 받으면 겹침 검사(sig)는 비워 둬요
    const sig = taken.has(character) ? null : character;
    taken.add(character);
    stmts.push(
      db
        .prepare(
          // 지금 있는 멤버에게만 줘요(같은 묶음에서 나간 사람은 프로필을 다시 만들지 않아요)
          `INSERT INTO profiles (user_id, character_id, character_sig, updated_at)
           SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
           ON CONFLICT (user_id) DO UPDATE SET character_id = ?2, character_sig = ?3, updated_at = ?4
           WHERE profiles.character_id IS ?5`,
        )
        .bind(id, character, sig, t, before),
    );
  }
  if (stmts.length) await db.batch(stmts);
}

// 멤버가 소녀/소년 캐릭터를 골랐을 때: 이미 그 묶음이면 그대로, 아니면 그 묶음에서 안 쓰는 캐릭터로 바꿔요.
export async function chooseCharacterPool(db: D1Database, userId: string, pool: CharacterPool): Promise<string | null> {
  return retrySigConflict(() => chooseCharacterPoolOnce(db, userId, pool));
}

// 이 묶음(소녀/소년)을 고르면 받을 캐릭터. 이미 그 묶음이면 지금 캐릭터 그대로예요.
export async function planCharacterPool(
  db: D1Database,
  userId: string,
  pool: CharacterPool,
): Promise<{ before: string | null; character: string; sig: string | null; same: boolean }> {
  const { results: rows } = await db
    .prepare('SELECT user_id, character_id, character_sig FROM profiles WHERE character_sig IS NOT NULL OR user_id = ?')
    .bind(userId)
    .all<{ user_id: string; character_id: string | null; character_sig: string | null }>();
  const before = rows.find((r) => r.user_id === userId)?.character_id ?? null;
  if (before && poolOf(before) === pool) return { before, character: before, sig: null, same: true };
  const taken = new Set(rows.flatMap((r) => (r.character_sig ? [r.character_sig] : [])));
  const character = pickCharacter(userId, taken, pool);
  return { before, character, sig: taken.has(character) ? null : character, same: false };
}

async function chooseCharacterPoolOnce(db: D1Database, userId: string, pool: CharacterPool): Promise<string | null> {
  const { before, character, sig, same } = await planCharacterPool(db, userId, pool);
  if (same) return before;
  const res = await db
    .prepare(
      `INSERT INTO profiles (user_id, character_id, character_sig, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id) DO UPDATE SET character_id = ?2, character_sig = ?3, updated_at = ?4
       WHERE profiles.character_id IS ?5`,
    )
    .bind(userId, character, sig, now(), before)
    .run();
  return res.meta.changes ? character : before;
}

// 처음 성별 고르기: 캐릭터를 그 묶음으로 정하고 "골랐어요" 표시. 이미 골랐으면 바꾸지 않아요.
// 표시와 캐릭터 바꾸기를 한 번에 해서, 동시에 두 번 눌러도 먼저 저장된 쪽만 남아요.
export async function chooseFirstGender(db: D1Database, userId: string, pool: CharacterPool): Promise<boolean> {
  const member = await db.prepare('SELECT gender_chosen_at FROM members WHERE user_id = ?').bind(userId).first<{ gender_chosen_at: string | null }>();
  if (!member || member.gender_chosen_at) return false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await retrySigConflict(() => chooseFirstGenderOnce(db, userId, pool));
    if (r !== 'retry') return r;
  }
  return false;
}

async function chooseFirstGenderOnce(db: D1Database, userId: string, pool: CharacterPool): Promise<boolean | 'retry'> {
  {
    const plan = await planCharacterPool(db, userId, pool);
    const mark = `${now()}#${crypto.randomUUID()}`;
    const claim = db
      .prepare(
        `UPDATE members SET gender_chosen_at = ?1 WHERE user_id = ?2 AND gender_chosen_at IS NULL
           AND (SELECT character_id FROM profiles WHERE user_id = ?2) IS ?3`,
      )
      .bind(mark, userId, plan.before);
    const steps = [claim];
    if (!plan.same) {
      steps.push(
        db
          .prepare(
            `INSERT INTO profiles (user_id, character_id, character_sig, updated_at)
             SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND gender_chosen_at = ?5)
             ON CONFLICT (user_id) DO UPDATE SET character_id = ?2, character_sig = ?3, updated_at = ?4`,
          )
          .bind(userId, plan.character, plan.sig, now(), mark),
      );
    }
    await db.batch(steps);
    const after = await db.prepare('SELECT gender_chosen_at FROM members WHERE user_id = ?').bind(userId).first<{ gender_chosen_at: string | null }>();
    if (after?.gender_chosen_at === mark) return true;
    if (after?.gender_chosen_at) return false;
    // 그 사이 캐릭터가 바뀌었어요(새 캐릭터 배정 등). 다시 계획해요.
    return 'retry';
  }
}

// 상점 "성별 바꾸기": 도감 젤리를 빼고 반대 묶음 캐릭터로 한 번에 바꿔요.
export const GENDER_ITEM_ID = 'change:gender';
export async function buyGenderChange(
  db: D1Database,
  userId: string,
  pool: CharacterPool,
  price: number,
  shown?: string, // 확인 화면에서 보여 준 캐릭터. 그 사이 바뀌었으면 사지 않고 새 미리보기를 보여 줘요.
): Promise<'done' | 'same' | 'not_enough_jelly' | 'changed'> {
  return retrySigConflict(async () => {
    const plan = await planCharacterPool(db, userId, pool);
    if (plan.same) return 'same';
    if (shown !== undefined && plan.character !== shown) return 'changed';
    const id = crypto.randomUUID();
    const t = now();
    const won = 'EXISTS (SELECT 1 FROM purchases WHERE id = ?1)';
    await db.batch([
      db
        .prepare(
          `INSERT INTO purchases (id, user_id, item_id, price, status, created_at, settled_at)
           SELECT ?1, ?2, ?3, ?4, 'done', ?5, ?5
           WHERE EXISTS (SELECT 1 FROM profiles WHERE user_id = ?2 AND dogam_jelly >= ?4 AND character_id IS ?6)
             AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1 AND gender_chosen_at IS NOT NULL)`,
        )
        .bind(id, userId, GENDER_ITEM_ID, price, t, plan.before),
      db
        .prepare(`UPDATE profiles SET dogam_jelly = dogam_jelly - ?3, character_id = ?4, character_sig = ?5, updated_at = ?6 WHERE user_id = ?2 AND ${won}`)
        .bind(id, userId, price, plan.character, plan.sig, t),
    ]);
    if (await db.prepare('SELECT 1 FROM purchases WHERE id = ?').bind(id).first()) return 'done';
    // 그 사이 다른 탭에서 먼저 캐릭터가 바뀌어 못 샀으면 잔액 부족이 아니라고 알려요.
    const cur = await db.prepare('SELECT character_id FROM profiles WHERE user_id = ?').bind(userId).first<{ character_id: string | null }>();
    return (cur?.character_id ?? null) !== plan.before ? 'changed' : 'not_enough_jelly';
  });
}

// ── 젤리 상점 ─────────────────────────────────────────────

export type Purchase = {
  id: string;
  user_id: string;
  item_id: string;
  price: number;
  status: 'pending' | 'done' | 'failed';
  reason: string | null;
  created_at: string;
  settled_at: string | null;
  seen_at: string | null;
};

export async function getOwnedItems(db: D1Database, userId: string): Promise<Set<string>> {
  const { results } = await db.prepare('SELECT item_id FROM owned_items WHERE user_id = ?').bind(userId).all<{ item_id: string }>();
  return new Set(results.map((r) => r.item_id));
}

// 아직 결과 팝업을 안 본 결제(최근 3개)
export async function listUnseenPurchases(db: D1Database, userId: string): Promise<Purchase[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM purchases WHERE user_id = ? AND status != 'pending' AND seen_at IS NULL
       ORDER BY created_at DESC LIMIT 3`,
    )
    .bind(userId)
    .all<Purchase>();
  return results;
}

// 예전에 겜블 젤리로 산 결제 중 아직 겜블 젤리를 돌려주지 않은 것(봇이 가져가서 돌려줘요)
export type Refund = { id: string; user_id: string; item_id: string; price: number };

export async function listPendingRefunds(db: D1Database, limit = 50): Promise<Refund[]> {
  const { results } = await db
    .prepare(`SELECT id, user_id, item_id, price FROM purchases WHERE refund = 'pending' ORDER BY created_at LIMIT ?`)
    .bind(limit)
    .all<Refund>();
  return results;
}

// 봇이 겜블 젤리를 돌려준 뒤 부르면 다시 돌려주지 않게 표시해요. 이미 표시된 건은 그대로예요.
export async function markRefunded(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare(`UPDATE purchases SET refund = 'done' WHERE id = ? AND refund = 'pending'`).bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

// 도감 젤리로 바로 사요. 잔액 확인, 젤리 빼기, 물건 주기를 한 번에(트랜잭션) 해서
// 동시에 여러 번 눌러도 잔액보다 많이 쓰거나 같은 물건을 두 번 사지 않아요.
export async function buyWithJelly(
  db: D1Database,
  userId: string,
  itemId: string,
  price: number,
): Promise<'done' | 'owned' | 'not_enough_jelly'> {
  const id = crypto.randomUUID();
  const t = now();
  const won = 'EXISTS (SELECT 1 FROM purchases WHERE id = ?1)';
  await db.batch([
    db
      .prepare(
        `INSERT INTO purchases (id, user_id, item_id, price, status, created_at, settled_at)
         SELECT ?1, ?2, ?3, ?4, 'done', ?5, ?5
         WHERE EXISTS (SELECT 1 FROM profiles WHERE user_id = ?2 AND dogam_jelly >= ?4)
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)
           AND NOT EXISTS (SELECT 1 FROM owned_items WHERE user_id = ?2 AND item_id = ?3)`,
      )
      .bind(id, userId, itemId, price, t),
    db
      .prepare(`UPDATE profiles SET dogam_jelly = dogam_jelly - ?3, updated_at = ?4 WHERE user_id = ?2 AND ${won}`)
      .bind(id, userId, price, t),
    db
      .prepare(
        `INSERT INTO owned_items (user_id, item_id, acquired_at) SELECT ?2, ?3, ?4 WHERE ${won}
         ON CONFLICT DO NOTHING`,
      )
      .bind(id, userId, itemId, t),
  ]);
  if (await db.prepare('SELECT 1 FROM purchases WHERE id = ?').bind(id).first()) return 'done';
  const owned = await db.prepare('SELECT 1 FROM owned_items WHERE user_id = ? AND item_id = ?').bind(userId, itemId).first();
  return owned ? 'owned' : 'not_enough_jelly';
}

// ── 디스코드에 적용되는 물건 ─────────────────────────────

// 내가 산 횟수(완료만)와 아직 봇이 적용 중인 것
export async function serviceState(db: D1Database, userId: string): Promise<{ bought: Map<string, number>; pending: Set<string> }> {
  const { results } = await db
    .prepare(
      `SELECT item_id, status, COUNT(*) AS n FROM purchases
       WHERE user_id = ? AND item_id LIKE 'svc:%' AND status IN ('done', 'pending') GROUP BY item_id, status`,
    )
    .bind(userId)
    .all<{ item_id: string; status: string; n: number }>();
  const bought = new Map<string, number>();
  const pending = new Set<string>();
  for (const r of results) {
    if (r.status === 'done') bought.set(r.item_id, r.n);
    else pending.add(r.item_id);
  }
  return { bought, pending };
}

// 도감 젤리를 먼저 빼고 봇에게 맡겨요. 같은 물건은 하나가 끝나야 또 살 수 있어요.
export async function requestService(
  db: D1Database,
  userId: string,
  itemId: string,
  price: number,
  bought: number,
  instant = false, // 도감 안에서 끝나는 물건(닉네임 변경권)은 봇 없이 바로 완료
): Promise<'pending' | 'done' | 'busy' | 'not_enough_jelly' | 'changed'> {
  const id = crypto.randomUUID();
  const t = now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO purchases (id, user_id, item_id, price, status, created_at, settled_at)
         SELECT ?1, ?2, ?3, ?4, ?7, ?5, CASE WHEN ?7 = 'done' THEN ?5 END
         WHERE EXISTS (SELECT 1 FROM profiles WHERE user_id = ?2 AND dogam_jelly >= ?4)
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)
           AND NOT EXISTS (SELECT 1 FROM purchases WHERE user_id = ?2 AND item_id = ?3 AND status = 'pending')
           AND (SELECT COUNT(*) FROM purchases WHERE user_id = ?2 AND item_id = ?3 AND status = 'done') = ?6`,
      )
      .bind(id, userId, itemId, price, t, bought, instant ? 'done' : 'pending'),
    db
      .prepare('UPDATE profiles SET dogam_jelly = dogam_jelly - ?3, updated_at = ?4 WHERE user_id = ?2 AND EXISTS (SELECT 1 FROM purchases WHERE id = ?1)')
      .bind(id, userId, price, t),
  ]);
  if (await db.prepare('SELECT 1 FROM purchases WHERE id = ?').bind(id).first()) return instant ? 'done' : 'pending';
  const busy = await db.prepare("SELECT 1 FROM purchases WHERE user_id = ? AND item_id = ? AND status = 'pending'").bind(userId, itemId).first();
  if (busy) return 'busy';
  // 값을 계산한 뒤에 봇이 앞 구매를 끝냈으면 값이 올랐어요. 새 값으로 다시 계산하게 알려요.
  const done = await db
    .prepare("SELECT COUNT(*) AS n FROM purchases WHERE user_id = ? AND item_id = ? AND status = 'done'")
    .bind(userId, itemId)
    .first<{ n: number }>();
  return (done?.n ?? 0) !== bought ? 'changed' : 'not_enough_jelly';
}

export async function listPendingServices(db: D1Database, limit = 20): Promise<{ id: string; user_id: string; item_id: string }[]> {
  const { results } = await db
    .prepare(`SELECT id, user_id, item_id FROM purchases WHERE status = 'pending' AND item_id LIKE 'svc:%' AND item_id != 'svc:nickname' ORDER BY created_at LIMIT ?`)
    .bind(limit)
    .all<{ id: string; user_id: string; item_id: string }>();
  return results;
}

export const SERVICE_FAIL_REASONS = ['no_penalty', 'no_warning'] as const;

// 봇이 적용한 결과. 실패면 뺀 젤리를 돌려줘요. 이미 끝난 결제는 그대로(두 번 돌려주지 않아요).
export async function settleService(db: D1Database, id: string, ok: boolean, reason: string | null): Promise<boolean> {
  const mark = `${now()}#${crypto.randomUUID()}`;
  if (ok) {
    const r = await db.prepare("UPDATE purchases SET status = 'done', settled_at = ? WHERE id = ? AND status = 'pending' AND item_id LIKE 'svc:%'").bind(mark, id).run();
    return (r.meta.changes ?? 0) > 0;
  }
  await db.batch([
    db
      .prepare("UPDATE purchases SET status = 'failed', reason = ?3, settled_at = ?2 WHERE id = ?1 AND status = 'pending' AND item_id LIKE 'svc:%'")
      .bind(id, mark, reason),
    db
      .prepare(
        `UPDATE profiles SET dogam_jelly = dogam_jelly + (SELECT price FROM purchases WHERE id = ?1 AND settled_at = ?2), updated_at = ?3
         WHERE user_id = (SELECT user_id FROM purchases WHERE id = ?1 AND settled_at = ?2)`,
      )
      .bind(id, mark, now()),
  ]);
  return !!(await db.prepare('SELECT 1 FROM purchases WHERE id = ? AND settled_at = ?').bind(id, mark).first());
}

// ── 도감 닉네임 변경권(겜블장 변경권과 따로) ─────────────
const NICK_LEFT = `(SELECT COUNT(*) FROM purchases WHERE user_id = ?1 AND item_id = 'svc:nickname' AND status = 'done')
  - (SELECT COUNT(*) FROM nick_jobs WHERE user_id = ?1 AND status IN ('pending', 'done'))`;
export type NickJob = { id: string; user_id: string; front: string; status: string; reason: string | null; created_at: string };
export async function nickState(db: D1Database, userId: string): Promise<{ left: number; last: NickJob | null }> {
  const [left, last] = await Promise.all([
    db.prepare(`SELECT ${NICK_LEFT} AS n`).bind(userId).first<{ n: number }>(),
    db.prepare('SELECT * FROM nick_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId).first<NickJob>(),
  ]);
  return { left: Math.max(0, left?.n ?? 0), last: last ?? null };
}
// 쓰기: 남은 장수가 있고 하리보봇이 앞의 것을 적용 중이 아닐 때만
export async function useNickTicket(db: D1Database, userId: string, front: string): Promise<boolean> {
  const id = crypto.randomUUID();
  const r = await db
    .prepare(
      `INSERT INTO nick_jobs (id, user_id, front, status, created_at)
       SELECT ?2, ?1, ?3, 'pending', ?4
       WHERE ${NICK_LEFT} > 0
         AND NOT EXISTS (SELECT 1 FROM nick_jobs WHERE user_id = ?1 AND status = 'pending')
         AND EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)`,
    )
    .bind(userId, id, front, now())
    .run();
  return (r.meta.changes ?? 0) > 0;
}
export async function listNickJobs(db: D1Database, limit = 20): Promise<NickJob[]> {
  const { results } = await db.prepare("SELECT * FROM nick_jobs WHERE status = 'pending' ORDER BY created_at LIMIT ?").bind(limit).all<NickJob>();
  return results;
}
export const NICK_FAIL_REASONS = ['invalid', 'banned', 'forbidden', 'left'] as const;
// 실패하면 'failed'가 되어 남은 장수에서 빠지지 않아요(변경권이 그대로 남아요).
export async function settleNickJob(db: D1Database, id: string, ok: boolean, reason: string | null): Promise<boolean> {
  const r = await db
    .prepare("UPDATE nick_jobs SET status = ?2, reason = ?3, settled_at = ?4 WHERE id = ?1 AND status = 'pending'")
    .bind(id, ok ? 'done' : 'failed', reason, now())
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// ── 도감 축하(두 사람 카드가 10레벨마다) ─────────────
// 두 사람 카드는 양쪽에 하나씩 있어서, 작은 ID 쪽 카드 한 장만 봐요. 둘 다 지금 멤버일 때만.
export type Cheer = { a: string; b: string; level: number };
export async function listCheers(db: D1Database, limit = 10): Promise<Cheer[]> {
  const next = '((cheer_level / 10) * 10 + 9)'; // 다음 축하 레벨 - 1
  const { results } = await db
    .prepare(
      `SELECT c.owner_id AS a, c.target_id AS b, c.xp, c.cheer_level FROM cards c
       JOIN members ma ON ma.user_id = c.owner_id AND ma.active = 1
       JOIN members mb ON mb.user_id = c.target_id AND mb.active = 1
       WHERE c.owner_id < c.target_id AND c.cheer_level < 100 AND c.xp >= ${XP_SCALE} * ${next} * ${next}
       ORDER BY c.updated_at LIMIT ?`,
    )
    .bind(limit)
    .all<{ a: string; b: string; xp: number; cheer_level: number }>();
  return results
    .map((r) => ({ a: r.a, b: r.b, level: Math.floor(levelFromXp(r.xp) / 10) * 10, was: r.cheer_level }))
    .filter((r) => r.level > r.was && r.level >= 10)
    .map(({ a, b, level }) => ({ a, b, level }));
}
export async function markCheer(db: D1Database, a: string, b: string, level: number): Promise<boolean> {
  const r = await db.prepare('UPDATE cards SET cheer_level = ?3 WHERE owner_id = ?1 AND target_id = ?2 AND cheer_level < ?3').bind(a, b, level).run();
  return (r.meta.changes ?? 0) > 0;
}

// 처음 젤리 선물(계정당 한 번). 이번 호출이 표시를 직접 남겼을 때만 젤리를 더해요.
export const STARTER_JELLY = 5;
export async function giveStarterJelly(db: D1Database, userIds: string[]) {
  const stmts: D1PreparedStatement[] = [];
  for (const userId of userIds) {
    const mark = `${now()}#${crypto.randomUUID()}`;
    stmts.push(
      db
        .prepare('UPDATE members SET starter_jelly_at = ?2 WHERE user_id = ?1 AND active = 1 AND starter_jelly_at IS NULL')
        .bind(userId, mark),
      db
        .prepare(
          `INSERT INTO profiles (user_id, dogam_jelly, updated_at)
           SELECT ?1, ?3, ?4 WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND starter_jelly_at = ?2)
           ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + excluded.dogam_jelly, updated_at = excluded.updated_at`,
        )
        .bind(userId, mark, STARTER_JELLY, now()),
    );
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
}

// 결과 팝업을 한 번 보여 줬으면 다시 띄우지 않아요
export async function markPurchasesSeen(db: D1Database, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const t = now();
  await db.batch(
    ids.map((id) => db.prepare('UPDATE purchases SET seen_at = ? WHERE id = ? AND user_id = ? AND seen_at IS NULL').bind(t, id, userId)),
  );
}

export async function setTheme(db: D1Database, userId: string, theme: string) {
  await db
    .prepare(
      `INSERT INTO profiles (user_id, theme_id, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET theme_id = ?2, updated_at = ?3`,
    )
    .bind(userId, theme, now())
    .run();
}

export async function setDeco(db: D1Database, userId: string, decoId: string | null) {
  await db
    .prepare(
      `INSERT INTO profiles (user_id, deco_id, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET deco_id = ?2, updated_at = ?3`,
    )
    .bind(userId, decoId, now())
    .run();
}

// 지금 서버에 있는 멤버 수(떠난 멤버 빼고). 판타지 캐릭터 보상 기준에 써요.
export async function countActiveMembers(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM members WHERE active = 1').first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countOwnedCards(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM cards c JOIN members m ON m.user_id = c.target_id
       WHERE c.owner_id = ? AND m.active = 1`,
    )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ── 디스코드 고정 패널 ─────────────────────────────────────

// 한국 날짜(YYYY-MM-DD). 칭찬 횟수는 이 날짜로 세요.
export function kstDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export const PRAISE_PER_DAY = 3;
export const PRAISE_JELLY_PER_DAY = 3;

// 내가 가진 카드 중 레벨이 제일 높은 카드(지금 있는 멤버만)
export function getBestCard(db: D1Database, ownerId: string) {
  return db
    .prepare(
      `SELECT m.user_id, m.display_name, c.xp FROM cards c JOIN members m ON m.user_id = c.target_id
       WHERE c.owner_id = ? AND m.active = 1 ORDER BY c.xp DESC, c.first_met LIMIT 1`,
    )
    .bind(ownerId)
    .first<{ user_id: string; display_name: string; xp: number }>();
}

export async function praiseToday(db: D1Database, userId: string, day = kstDay()) {
  const { results } = await db
    .prepare('SELECT to_id FROM praises WHERE day = ? AND from_id = ?')
    .bind(day, userId)
    .all<{ to_id: string }>();
  const given = results.map((r) => r.to_id);
  return { given, left: Math.max(0, PRAISE_PER_DAY - given.length) };
}

export type PraiseResult = 'done' | 'already' | 'limit' | 'self' | 'not_member';

// 칭찬 한 번. 하루 3번, 같은 사람에게 하루 1번. 받은 사람은 하루 3개까지 도감 젤리 1개씩 받아요.
// 확인과 기록, 젤리 주기를 한 번에(트랜잭션) 해서 동시에 눌러도 한도를 넘지 않아요.
export async function givePraise(
  db: D1Database,
  fromId: string,
  toId: string,
  day = kstDay(),
  note: string | null = null,
): Promise<{ result: PraiseResult; jelly: boolean; left: number }> {
  if (fromId === toId) return { result: 'self', jelly: false, left: (await praiseToday(db, fromId, day)).left };
  const mark = `${now()}#${crypto.randomUUID()}`;
  const mine = 'EXISTS (SELECT 1 FROM praises WHERE day = ?1 AND from_id = ?2 AND to_id = ?3 AND created_at = ?4 AND jelly = 1)';
  await db.batch([
    db
      .prepare(
        `INSERT INTO praises (day, from_id, to_id, jelly, created_at, note)
         SELECT ?1, ?2, ?3,
                (SELECT COUNT(*) FROM praises WHERE day = ?1 AND to_id = ?3 AND jelly = 1) < ?6,
                ?4, ?7
         WHERE (SELECT COUNT(*) FROM praises WHERE day = ?1 AND from_id = ?2) < ?5
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?2 AND active = 1)
           AND EXISTS (SELECT 1 FROM members WHERE user_id = ?3 AND active = 1)
         ON CONFLICT DO NOTHING`,
      )
      .bind(day, fromId, toId, mark, PRAISE_PER_DAY, PRAISE_JELLY_PER_DAY, note),
    db
      .prepare(
        `INSERT INTO profiles (user_id, dogam_jelly, updated_at) SELECT ?3, 1, ?5 WHERE ${mine}
         ON CONFLICT (user_id) DO UPDATE SET dogam_jelly = dogam_jelly + 1, updated_at = excluded.updated_at`,
      )
      .bind(day, fromId, toId, mark, now()),
  ]);
  const row = await db
    .prepare('SELECT jelly, created_at FROM praises WHERE day = ? AND from_id = ? AND to_id = ?')
    .bind(day, fromId, toId)
    .first<{ jelly: number; created_at: string }>();
  const { left } = await praiseToday(db, fromId, day);
  if (row?.created_at === mark) return { result: 'done', jelly: row.jelly === 1, left };
  if (row) return { result: 'already', jelly: false, left };
  if (left === 0) return { result: 'limit', jelly: false, left };
  return { result: 'not_member', jelly: false, left };
}
