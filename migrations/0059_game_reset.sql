-- 상점 「게임 기록 초기화권」(나리 2026-11-20): 겜블장·원정대·사건파일을 처음부터. 도감·캐릭터·산 물건은 그대로.
-- 처음 깼을 때 주는 도감 젤리는 초기화 뒤 다시 깨도 또 주지 않아요. 그래서 이미 받은 것을 따로 적어 둬요.
CREATE TABLE IF NOT EXISTS game_resets (
  user_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL,
  journey_jelly_top INTEGER NOT NULL DEFAULT 0 -- 원정대 장 젤리를 이 장까지 이미 받았어요
);
-- 사건마다 첫 해결 보상(경험치·젤리)을 이미 받은 기록. 초기화로 escape_rewards를 지워도 여기 남아요.
CREATE TABLE IF NOT EXISTS escape_paid (
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  PRIMARY KEY (user_id, case_id)
);
