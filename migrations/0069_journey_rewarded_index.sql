-- 원정대 하루 보상 판 수(reward_day, xp > 0)를 셀 때 그 사람의 모든 판을 읽지 않게 하는 색인이에요(2026-11-21 점검, D1 읽기 줄이기).
CREATE INDEX IF NOT EXISTS journey_rewarded ON journey_runs(user_id, reward_day) WHERE xp > 0;
