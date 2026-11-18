-- 성별을 바꿔도 예전 캐릭터는 그 사람 것으로 남겨 둬요(나리 2026-11-17).
-- 다시 그 성별로 돌아오면 이 캐릭터를 그대로 돌려받고, 그동안 다른 사람에게 주지 않아요.
CREATE TABLE IF NOT EXISTS character_keep (
  user_id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  character_sig TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS character_keep_sig ON character_keep (character_sig);
