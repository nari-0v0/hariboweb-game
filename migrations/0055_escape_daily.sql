-- 오늘의 사건(나리 2026-11-19): 하루에 한 번, 해결한 사건 하나를 새로 섞어 다시 풀어요. 하루에 한 줄.
-- 시작하면 줄이 생기고(그날 기회를 씀), 해결하면 solved·secs·flawless를 채워요. 보상은 없어요.
-- 새 표만 만들어서, 스위치(DAILY_OPEN)가 꺼진 채 배포돼도 아무 일도 안 생겨요.
CREATE TABLE IF NOT EXISTS escape_daily (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  case_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  solved INTEGER NOT NULL DEFAULT 0,
  secs INTEGER,
  flawless INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
