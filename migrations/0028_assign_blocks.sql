-- 같이 배정되지 않기: 멤버가 적은 요청, AI 검토 결과, 하리보봇이 올린 메시지, 나리의 결정.
-- status: pending(대기) / approved(승인) / rejected(반려) / ai_rejected(AI가 장난·내용 없음으로 봐서 봇에 안 넘김)
-- 기간은 없어요. 출시 초기화 때 비워요.
CREATE TABLE assign_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  ai_verdict TEXT,
  ai_summary TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  message_id TEXT,
  posted_at TEXT,
  decided_at TEXT,
  decided_by TEXT
);
CREATE INDEX assign_blocks_status ON assign_blocks (status, message_id);
CREATE INDEX assign_blocks_from ON assign_blocks (from_id, status);
