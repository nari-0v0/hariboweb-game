-- 떠난 멤버가 다시 들어오면 개인 기록(빙고 줄, 모둠 완주, 칭찬)으로 칭호를 다시 받지 않도록, 나간 시각을 적어 둬요.
ALTER TABLE members ADD COLUMN reset_at TEXT;
