-- 완성 원고 플레이. 기존 seed 재생 판은 그대로 보존합니다.
CREATE TABLE story_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('case', 'expedition')),
  content_id TEXT NOT NULL,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'done', 'quit')),
  day TEXT,
  season_id TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  jelly INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT,
  mutation TEXT NOT NULL
);
CREATE UNIQUE INDEX story_one_active ON story_runs(user_id, kind) WHERE status = 'going';
CREATE INDEX story_daily ON story_runs(user_id, kind, day, status);
CREATE TABLE story_marks (
  user_id TEXT NOT NULL,
  mark TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, mark)
);
-- 금전/경험치 보상은 원고별 최초 성공 한 번. 발견과 분기는 무료 재플레이로 계속 수집할 수 있어요.
CREATE TABLE story_rewards (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY(user_id, kind, content_id)
);
