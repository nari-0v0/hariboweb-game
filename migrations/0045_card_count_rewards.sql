-- 도감 카드 장수 보상: 단계마다 한 번만 젤리를 주도록 받은 단계를 적어요(src/card-rewards.ts).
-- batch_id: 어느 동기화 묶음에서 받았는지(그 묶음에서 새로 받은 것만 젤리·알림을 줘요).
CREATE TABLE card_count_rewards (
  user_id TEXT NOT NULL,
  cards INTEGER NOT NULL,
  jelly INTEGER NOT NULL,
  batch_id TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cards)
);
CREATE INDEX card_count_rewards_batch ON card_count_rewards (batch_id, user_id);
