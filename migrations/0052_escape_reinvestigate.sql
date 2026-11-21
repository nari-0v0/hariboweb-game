-- 재수사(나리 2026-11-19): 해결한 사건을 힌트 없이 다시 푼 기록. 사건마다 한 줄.
-- clears: 재수사로 해결한 횟수, best_secs: 가장 빨리 푼 시간(초), flawless: 한 번도 안 틀리고 푼 적 있음(무결점 도장)
CREATE TABLE IF NOT EXISTS escape_re (
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  clears INTEGER NOT NULL DEFAULT 0,
  best_secs INTEGER,
  flawless INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, case_id)
);
