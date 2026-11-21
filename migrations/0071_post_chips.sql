-- 구인구직·디스타그램에 글을 쓰면 겜블장 젤칩 100개(나리 2026-11-21). 두 곳 합쳐 도감 하루(아침 6시 기준) 4번까지.
-- 글 하나(디스코드 메시지·글 번호)당 한 줄이라 봇이 같은 글을 다시 보내도 한 번만 받아요.
-- 줄이 생기는 순간 트리거가 젤칩을 넣어요. 겜블장에 아직 안 와 본 사람은 계정을 만들어 두고(free_day 비어 있음),
-- 처음 오면 시작 젤칩 1000개가 그 위에 더해져요.
-- 글이 지워지면 revoked_at을 채우고 트리거가 준 젤칩을 다시 빼요(나리 2026-11-21 "지워지면 마이너스").
-- 젤칩이 모자라도 다 빼요: 모자란 만큼은 빚(gamble_accounts.debt)으로 남고, 화면에는 젤칩 = chips - debt(마이너스)로 보여요.
-- 빚이 있으면 다음에 들어오는 젤칩(충전·글 젤칩·보상)에서 먼저 갚아요. 도박으로는 마이너스가 되지 않아요(걸 때 chips >= 건 수).
-- 지운 글도 하루 4번에는 그대로 세요(올리고 지우기를 되풀이해서 받지 않게).
CREATE TABLE post_chips (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('recruit', 'distagram')),
  day TEXT NOT NULL,
  chips INTEGER NOT NULL CHECK (chips > 0),
  posted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  taken INTEGER
);
CREATE INDEX post_chips_user_day ON post_chips(user_id, day);

CREATE TRIGGER post_chips_credit AFTER INSERT ON post_chips
BEGIN
  INSERT OR IGNORE INTO gamble_accounts (user_id, chips) VALUES (NEW.user_id, 0);
  UPDATE gamble_accounts SET chips = chips + NEW.chips WHERE user_id = NEW.user_id;
END;

-- 시스템이 빼야 하는데 젤칩이 모자란 만큼(빚). chips(걸 수 있는 젤칩)는 그대로 0 이상이에요.
ALTER TABLE gamble_accounts ADD COLUMN debt INTEGER NOT NULL DEFAULT 0 CHECK (debt >= 0);

-- 빚과 젤칩이 함께 남지 않게: 젤칩이 들어오거나 빚이 생기면 그 자리에서 갚아요(둘 중 하나는 늘 0).
CREATE TRIGGER gamble_debt_settle AFTER UPDATE OF chips, debt ON gamble_accounts
WHEN NEW.debt > 0 AND NEW.chips > 0
BEGIN
  UPDATE gamble_accounts SET chips = chips - MIN(chips, debt), debt = debt - MIN(chips, debt) WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER post_chips_revoke AFTER UPDATE OF revoked_at ON post_chips
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  UPDATE post_chips SET taken = CASE WHEN EXISTS (SELECT 1 FROM gamble_accounts WHERE user_id = NEW.user_id) THEN NEW.chips ELSE 0 END WHERE id = NEW.id;
  UPDATE gamble_accounts SET debt = debt + NEW.chips WHERE user_id = NEW.user_id;
END;
