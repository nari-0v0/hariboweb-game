-- 구인구직·디스타그램에 글을 쓰면 겜블장 젤칩 100개(나리 2026-11-21). 두 곳 합쳐 도감 하루(아침 6시 기준) 4번까지.
-- 글 하나(디스코드 메시지·글 번호)당 한 줄이라 봇이 같은 글을 다시 보내도 한 번만 받아요.
-- 줄이 생기는 순간 트리거가 젤칩을 넣어요. 겜블장에 아직 안 와 본 사람은 계정을 만들어 두고(free_day 비어 있음),
-- 처음 오면 시작 젤칩 1000개가 그 위에 더해져요.
CREATE TABLE post_chips (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('recruit', 'distagram')),
  day TEXT NOT NULL,
  chips INTEGER NOT NULL CHECK (chips > 0),
  posted_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX post_chips_user_day ON post_chips(user_id, day);

CREATE TRIGGER post_chips_credit AFTER INSERT ON post_chips
BEGIN
  INSERT OR IGNORE INTO gamble_accounts (user_id, chips) VALUES (NEW.user_id, 0);
  UPDATE gamble_accounts SET chips = chips + NEW.chips WHERE user_id = NEW.user_id;
END;
