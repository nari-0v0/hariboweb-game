-- 사건파일 젤칩 보상(멍쑤님 제안, 나리 2026-11-21 결정). 둘 다 답을 1번까지만 틀리고 해결해야 해요(힌트 없는 판이라 S·A 기준).
-- daily: 오늘의 사건, 하루(도감 날짜, 아침 6시 기준)에 한 번. ref = 날짜.
-- re:    재수사, 사건마다 처음 한 번만. ref = 사건 id. 게임 기록 초기화를 해도 지우지 않아서 다시 받지 않아요.
-- 줄이 생기는 순간 트리거가 젤칩을 넣어요. 겜블장에 아직 안 와 본 사람은 계정을 만들어 두고(free_day 비어 있음),
-- 처음 오면 시작 젤칩 1000개가 그 위에 더해져요(0042·글 젤칩과 같은 방식).
-- 번호 0071은 열려 있는 글 젤칩 PR(#332)이 써서 0072를 써요.
CREATE TABLE escape_chips (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('daily', 're')),
  ref TEXT NOT NULL,
  run_id TEXT NOT NULL,
  chips INTEGER NOT NULL CHECK (chips > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, ref)
);

CREATE TRIGGER escape_chips_credit AFTER INSERT ON escape_chips
BEGIN
  INSERT OR IGNORE INTO gamble_accounts (user_id, chips) VALUES (NEW.user_id, 0);
  UPDATE gamble_accounts SET chips = chips + NEW.chips WHERE user_id = NEW.user_id;
END;
