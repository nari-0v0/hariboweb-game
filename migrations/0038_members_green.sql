-- 초록하리보 역할이 있는지(봇이 보내요). NULL = 아직 모름(예전 봇). 시즌 팀은 초록하리보가 있는 사람으로만 짜요(나리 2026-11-15).
ALTER TABLE members ADD COLUMN green INTEGER;
