-- 도감 축하: 두 사람 카드가 10레벨마다(10, 20 … 100) 하리보봇이 디스코드에 축하를 올려요.
-- 마지막으로 축하한 레벨을 적어 둬요. 지금 있는 카드는 이미 지난 레벨을 다시 축하하지 않게 지금 레벨로 맞춰요.
ALTER TABLE cards ADD COLUMN cheer_level INTEGER NOT NULL DEFAULT 0;
UPDATE cards SET cheer_level = jelly_level;
