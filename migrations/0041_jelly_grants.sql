-- 나리가 디스코드 /도감젤리지급 으로 준(또는 뺀) 도감 젤리 기록
-- id = 봇이 정한 지급 번호(디스코드 명령 번호). 같은 번호는 한 번만 반영돼요.
CREATE TABLE jelly_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT
);
CREATE INDEX jelly_grants_user ON jelly_grants (user_id, created_at);
