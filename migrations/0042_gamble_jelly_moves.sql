-- 디스코드 봇 겜블장 지갑 젤리를 웹 겜블장 젤칩으로 1:1 옮겨요(나리 2026-11-16 결정, 21일에 실행).
-- 예금·적금·주식·알바 금액은 옮기지 않아요. 도감 젤리와는 상관없어요.
-- 한 사람당 한 줄. moved_at이 비어 있다가 채워지는 순간 트리거가 젤칩을 넣어서,
-- 같은 파일을 두 번 실행해도 두 번 넣지 않아요.
CREATE TABLE gamble_jelly_moves (
  user_id TEXT PRIMARY KEY,
  jelly INTEGER NOT NULL CHECK (jelly > 0),
  loaded_at TEXT NOT NULL,
  moved_at TEXT
);

CREATE TRIGGER gamble_jelly_move_credit AFTER UPDATE OF moved_at ON gamble_jelly_moves
WHEN OLD.moved_at IS NULL AND NEW.moved_at IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO gamble_accounts (user_id, chips) VALUES (NEW.user_id, 0);
  UPDATE gamble_accounts SET chips = chips + NEW.jelly WHERE user_id = NEW.user_id;
END;
