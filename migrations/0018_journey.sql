-- 하리보 원정대 (하루 모험판): 내 캐릭터가 하루씩 나아가는 모험. 진행 상태만 저장해요.
CREATE TABLE journey_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'done', 'quit')),
  day INTEGER NOT NULL DEFAULT 0,
  cleared INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  jelly INTEGER NOT NULL DEFAULT 0,
  reward_day TEXT,
  mutation TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE UNIQUE INDEX journey_one_going ON journey_runs (user_id) WHERE status = 'going';
CREATE INDEX journey_user ON journey_runs (user_id, status, reward_day);
