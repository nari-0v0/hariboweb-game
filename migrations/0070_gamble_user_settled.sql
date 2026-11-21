-- 겜블장 "내 이번 시즌 순이익"(2026-11-21 3차 점검): 한 사람의 시즌 판만 읽게 해요.
CREATE INDEX IF NOT EXISTS gamble_user_settled ON gamble_rounds(user_id, settled_at);
