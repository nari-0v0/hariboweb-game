-- 원정대 영구 강화: 원정이 끝날 때 남은 동전을 모아 두고, 다음 원정을 조금씩 강하게 만들어요.
CREATE TABLE journey_bank (
  user_id TEXT PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 0,
  atk INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 0,
  def INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
