-- AI 판단 기록(나리 2026-11-16): 칭찬 한마디를 AI가 어떻게 봤는지 남기고, 봇이 비공개 로그 채널에 올려요.
-- 같이 배정되지 않기는 지금처럼 assign_blocks에 남고 같은 채널에 올라가요.
CREATE TABLE ai_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,          -- 'praise'
  from_id TEXT NOT NULL,
  to_id TEXT,
  text TEXT NOT NULL,          -- 멤버가 적은 원래 글(걸러져도 남아요)
  verdict TEXT NOT NULL,       -- 'ok' | 'bad' | 'none'(AI가 답을 못 함: 그대로 보냄)
  created_at TEXT NOT NULL,
  posted_at TEXT
);
CREATE INDEX ai_logs_unposted ON ai_logs (posted_at, id);
