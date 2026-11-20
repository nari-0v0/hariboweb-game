-- 2026-11-14 시즌 서버 퀘스트 목표 바로잡기(나리 2026-11-15).
-- 시즌 시작 때 봇이 예전 신입 역할로 90명을 세서 목표가 45명이 됐어요. 새 신입하리보 역할 기준 35명 → 목표 18명(절반).
-- 처음 값(90/45)일 때만 바꿔요.
UPDATE server_quest SET newbies = 35, target = 18 WHERE season_id = '2026-11-14' AND newbies = 90 AND target = 45;
