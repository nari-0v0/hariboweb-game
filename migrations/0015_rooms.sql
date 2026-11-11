-- 내 방 꾸미기. 방 하나에 한 줄(벽지, 바닥, 가구 배치 JSON). 가구·벽지·바닥은 owned_items에 furn:/wall:/floor:로 들어가요.
CREATE TABLE rooms (
  user_id TEXT PRIMARY KEY,
  wall TEXT NOT NULL DEFAULT 'sky',
  floor TEXT NOT NULL DEFAULT 'wood',
  layout TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE INDEX rooms_updated ON rooms (updated_at);

-- 방 좋아요: 한 사람이 같은 방에 하루 한 번(day는 한국 날짜)
CREATE TABLE room_likes (
  day TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, from_id, to_id)
);
CREATE INDEX room_likes_to ON room_likes (to_id);
