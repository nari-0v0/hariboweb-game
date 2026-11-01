import type { Member } from './env';
import type { LoginProfile } from './discord';
import { type CharacterPool, pickCharacter, poolOf, shouldRepick } from './character';

export type Profile = {
  user_id: string;
  solo_xp: number;
  intro: string;
  theme_id: string;
  character_id: string | null;
  deco_id: string | null;
  jelly: number | null;
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
};

const now = () => new Date().toISOString();

export function getMember(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM members WHERE user_id = ?').bind(id).first<Member>();
}

// 로그인할 때 디스코드에서 확인한 정보로 멤버를 바로 등록해요. 봇 동기화를 기다리지 않아도 돼요.
export async function upsertLoginMember(db: D1Database, p: LoginProfile) {
  await db
    .prepare(
      `INSERT INTO members (user_id, display_name, avatar_url, joined_at, is_newbie, active, updated_at)
       VALUES (?1, ?2, ?3, ?4, 0, 1, ?5)
       ON CONFLICT (user_id) DO UPDATE SET display_name = ?2, avatar_url = ?3,
         joined_at = COALESCE(?4, joined_at), active = 1, updated_at = ?5`,
    )
    .bind(p.id, p.name, p.avatar_url, p.joined_at, now())
    .run();
  await assignCharacters(db, [p.id]);
}

export async function getProfile(db: D1Database, id: string): Promise<Profile> {
  const row = await db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(id).first<Profile>();
  return row ?? { user_id: id, solo_xp: 0, intro: '', theme_id: 'basic', character_id: null, deco_id: null, jelly: null };
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
              p.theme_id, p.intro, p.character_id, p.deco_id
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
export async function assignCharacters(db: D1Database, userIds: string[]) {
  if (userIds.length === 0) return;
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
          `INSERT INTO profiles (user_id, character_id, character_sig, updated_at) VALUES (?1, ?2, ?3, ?4)
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
  const { results: rows } = await db
    .prepare('SELECT user_id, character_id, character_sig FROM profiles WHERE character_sig IS NOT NULL OR user_id = ?')
    .bind(userId)
    .all<{ user_id: string; character_id: string | null; character_sig: string | null }>();
  const before = rows.find((r) => r.user_id === userId)?.character_id ?? null;
  if (poolOf(before) === pool) return before;
  const taken = new Set(rows.flatMap((r) => (r.character_sig ? [r.character_sig] : [])));
  const character = pickCharacter(userId, taken, pool);
  const sig = taken.has(character) ? null : character;
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

export async function listMyPurchases(db: D1Database, userId: string, limit = 10): Promise<Purchase[]> {
  const { results } = await db
    .prepare('SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, limit)
    .all<Purchase>();
  return results;
}

// 결제 요청을 남겨요. 같은 물건을 이미 기다리는 중이면 false.
export async function requestPurchase(db: D1Database, userId: string, itemId: string, price: number): Promise<boolean> {
  try {
    await db
      .prepare('INSERT INTO purchases (id, user_id, item_id, price, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, itemId, price, 'pending', now())
      .run();
    return true;
  } catch (e) {
    if (String(e).includes('UNIQUE')) return false;
    throw e;
  }
}

// 결과 팝업을 한 번 보여 줬으면 다시 띄우지 않아요
export async function markPurchasesSeen(db: D1Database, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const t = now();
  await db.batch(
    ids.map((id) => db.prepare('UPDATE purchases SET seen_at = ? WHERE id = ? AND user_id = ? AND seen_at IS NULL').bind(t, id, userId)),
  );
}

export async function listPendingPurchases(db: D1Database, limit = 50): Promise<Purchase[]> {
  const { results } = await db
    .prepare("SELECT * FROM purchases WHERE status = 'pending' ORDER BY created_at LIMIT ?")
    .bind(limit)
    .all<Purchase>();
  return results;
}

// 봇이 결제 결과를 알려 줘요. 이미 처리된 요청이면 그대로 두고 지금 상태를 돌려줘요.
export async function settlePurchase(
  db: D1Database,
  id: string,
  ok: boolean,
  reason: string | null,
  balance: number | null,
): Promise<Purchase | null> {
  const t = now();
  const current = await db.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<Purchase>();
  if (!current) return null;
  if (current.status !== 'pending') return current;
  const stmts = [
    db
      .prepare("UPDATE purchases SET status = ?, reason = ?, settled_at = ? WHERE id = ? AND status = 'pending'")
      .bind(ok ? 'done' : 'failed', reason, t, id),
  ];
  if (ok)
    stmts.push(
      db
        .prepare('INSERT INTO owned_items (user_id, item_id, acquired_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
        .bind(current.user_id, current.item_id, t),
    );
  if (balance !== null) stmts.push(setJellyStmt(db, current.user_id, balance, t));
  await db.batch(stmts);
  return { ...current, status: ok ? 'done' : 'failed', reason, settled_at: t };
}

function setJellyStmt(db: D1Database, userId: string, jelly: number, t: string) {
  return db
    .prepare(
      `INSERT INTO profiles (user_id, jelly, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET jelly = ?2, updated_at = ?3`,
    )
    .bind(userId, jelly, t);
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
