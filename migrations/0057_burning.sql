-- 버닝타임(나리 2026-11-20): 나리가 "버닝타임 시작해줘" 하면 Claude가 started_at·until을 적어서 켜요(docs/burning.md).
CREATE TABLE IF NOT EXISTS burning (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TEXT,
  until TEXT
);
INSERT OR IGNORE INTO burning (id) VALUES (1);
