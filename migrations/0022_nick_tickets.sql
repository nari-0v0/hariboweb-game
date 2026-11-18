-- 도감 닉네임 변경권: 겜블장 변경권과 따로예요. 산 장수(svc:nickname 완료 구매) - 쓴 장수(아래 표, 실패는 빼고)가 남은 장수예요.
-- 쓰면 하리보봇이 가져가 디스코드 닉네임을 바꾸고 결과를 알려요. 실패하면 변경권은 그대로 남아요.
CREATE TABLE nick_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  front TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TEXT NOT NULL,
  settled_at TEXT
);
CREATE INDEX idx_nick_jobs_status ON nick_jobs (status, created_at);
CREATE INDEX idx_nick_jobs_user ON nick_jobs (user_id, created_at);
