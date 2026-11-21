-- 하루 원정 100판(나리 2026-11-21): 게임 기록 초기화권으로 원정 기록을 지워도 그날 이미 떠난 판 수는 이어서 세요(Codex #303).
-- xp_day(초기화한 도감 날짜)가 오늘이면 runs_used만큼 오늘 판 수에 더해요.
ALTER TABLE game_resets ADD COLUMN runs_used INTEGER NOT NULL DEFAULT 0;
