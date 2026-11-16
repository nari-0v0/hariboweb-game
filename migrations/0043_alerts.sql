-- 웹 알림함(오른쪽 위 🔔). 지난 시즌 퀘스트 결과 같은 걸 넣어요. 15일 지나면 지워요.
-- ref: 같은 알림을 두 번 넣지 않게 하는 이름(예: season:2026-11-03)
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (user_id, ref)
);
CREATE INDEX alerts_user ON alerts (user_id, created_at);
CREATE INDEX alerts_created ON alerts (created_at);
