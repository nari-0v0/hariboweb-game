import { characterUrl } from './character';
import { buyWithJelly, getOwnedItems, kstDay } from './db';
import { DEFAULT_LAYOUT, checkLayout, ownsFloor, ownsWall, parseLayout, roomItem, type Placed } from './room';

export type Room = {
  userId: string;
  name: string;
  art: string; // 방 주인 캐릭터
  wall: string;
  floor: string;
  layout: Placed[];
  likes: number;
  saved: boolean; // 한 번이라도 꾸며서 저장했는지
};

type RoomRow = { wall: string; floor: string; layout: string; updated_at: string };

// 방 하나 읽기(지금 있는 멤버만). 아직 안 꾸몄으면 기본 방이에요.
export async function getRoom(db: D1Database, userId: string): Promise<Room | null> {
  const [member, row, owned, likes] = await Promise.all([
    db
      .prepare(
        `SELECT m.user_id, m.display_name, p.character_id, p.deco_id FROM members m LEFT JOIN profiles p ON p.user_id = m.user_id
         WHERE m.user_id = ? AND m.active = 1`,
      )
      .bind(userId)
      .first<{ user_id: string; display_name: string; character_id: string | null; deco_id: string | null }>(),
    db.prepare('SELECT wall, floor, layout, updated_at FROM rooms WHERE user_id = ?').bind(userId).first<RoomRow>(),
    getOwnedItems(db, userId),
    db.prepare('SELECT COUNT(*) AS n FROM room_likes WHERE to_id = ?').bind(userId).first<{ n: number }>(),
  ]);
  if (!member) return null;
  return {
    userId,
    name: member.display_name,
    art: characterUrl(member.character_id, member.user_id, member.deco_id),
    wall: row && ownsWall(row.wall, owned) ? row.wall : 'sky',
    floor: row && ownsFloor(row.floor, owned) ? row.floor : 'wood',
    layout: row ? parseLayout(row.layout, owned) : DEFAULT_LAYOUT,
    likes: Number(likes?.n ?? 0),
    saved: !!row,
  };
}

export type SaveResult = 'saved' | 'bad';

// 방 저장. 가진 물건만, 올바른 자리에만 놓을 수 있어요.
export async function saveRoom(db: D1Database, userId: string, wall: string, floor: string, layoutJson: string): Promise<SaveResult> {
  if (layoutJson.length > 4000) return 'bad';
  const owned = await getOwnedItems(db, userId);
  if (!ownsWall(wall, owned) || !ownsFloor(floor, owned)) return 'bad';
  let raw: unknown;
  try {
    raw = JSON.parse(layoutJson);
  } catch {
    return 'bad';
  }
  const layout = checkLayout(raw, owned);
  if (!layout) return 'bad';
  const t = new Date().toISOString();
  const r = await db
    .prepare(
      `INSERT INTO rooms (user_id, wall, floor, layout, updated_at) SELECT ?1, ?2, ?3, ?4, ?5
       WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?1 AND active = 1)
       ON CONFLICT (user_id) DO UPDATE SET wall = excluded.wall, floor = excluded.floor, layout = excluded.layout, updated_at = excluded.updated_at`,
    )
    .bind(userId, wall, floor, JSON.stringify(layout), t)
    .run();
  return (r.meta.changes ?? 0) > 0 ? 'saved' : 'bad';
}

// 가구·벽지·바닥 사기(도감 젤리). 결과는 방 화면 팝업으로 보여 줘서 상점 결과 팝업에는 다시 안 떠요.
export async function buyRoomItem(db: D1Database, userId: string, id: unknown): Promise<'done' | 'owned' | 'not_enough_jelly' | 'not_for_sale'> {
  const item = roomItem(id);
  if (!item) return 'not_for_sale';
  const r = await buyWithJelly(db, userId, item.id, item.price);
  if (r === 'done')
    await db
      .prepare(`UPDATE purchases SET seen_at = ? WHERE user_id = ? AND item_id = ? AND seen_at IS NULL`)
      .bind(new Date().toISOString(), userId, item.id)
      .run();
  return r;
}

// 좋아요: 다른 사람 방에 하루 한 번
export async function likeRoom(db: D1Database, fromId: string, toId: string, now = new Date()): Promise<'liked' | 'already' | 'bad'> {
  if (fromId === toId) return 'bad';
  const r = await db
    .prepare(
      `INSERT INTO room_likes (day, from_id, to_id, created_at) SELECT ?1, ?2, ?3, ?4
       WHERE EXISTS (SELECT 1 FROM members WHERE user_id = ?3 AND active = 1)
       ON CONFLICT DO NOTHING`,
    )
    .bind(kstDay(now), fromId, toId, now.toISOString())
    .run();
  if ((r.meta.changes ?? 0) > 0) return 'liked';
  const exists = await db.prepare('SELECT 1 FROM members WHERE user_id = ? AND active = 1').bind(toId).first();
  return exists ? 'already' : 'bad';
}

export async function likedToday(db: D1Database, fromId: string, toId: string, now = new Date()): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 FROM room_likes WHERE day = ? AND from_id = ? AND to_id = ?').bind(kstDay(now), fromId, toId).first());
}

export type RoomCard = { userId: string; name: string; art: string; likes: number; updatedAt: string };

// 구경 가기: 꾸며서 저장한 방(지금 있는 멤버), 최근에 꾸민 순 / 좋아요 많은 순
export async function listRooms(db: D1Database, order: 'recent' | 'likes', limit = 12): Promise<RoomCard[]> {
  const sort = order === 'likes' ? 'likes DESC, r.updated_at DESC' : 'r.updated_at DESC';
  const { results } = await db
    .prepare(
      `SELECT r.user_id, r.updated_at, m.display_name, p.character_id, p.deco_id,
         (SELECT COUNT(*) FROM room_likes l WHERE l.to_id = r.user_id) AS likes
       FROM rooms r JOIN members m ON m.user_id = r.user_id AND m.active = 1 LEFT JOIN profiles p ON p.user_id = r.user_id
       ORDER BY ${sort} LIMIT ?`,
    )
    .bind(limit)
    .all<{ user_id: string; updated_at: string; display_name: string; character_id: string | null; deco_id: string | null; likes: number }>();
  return results.map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    art: characterUrl(r.character_id, r.user_id, r.deco_id),
    likes: Number(r.likes),
    updatedAt: r.updated_at,
  }));
}
