-- 버닝타임(나리 2026-11-20): 큰 점검이 끝나면 1~2시간 자동으로 켜져요.
-- maint_from/maint_last = 지금 이어지고 있는 점검을 처음·마지막으로 본 시각, until = 버닝타임이 끝나는 시각
CREATE TABLE IF NOT EXISTS burning (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  maint_from TEXT,
  maint_last TEXT,
  until TEXT,
  started_at TEXT
);
INSERT OR IGNORE INTO burning (id) VALUES (1);
