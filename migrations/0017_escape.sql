-- 하리보 사건파일 (방탈출판): 물건을 눌러 찾고 퍼즐을 풀어요. 사건 내용은 코드에 있고 진행 상태만 저장해요.
CREATE TABLE escape_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  state TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'done', 'quit')),
  grade TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  jelly INTEGER NOT NULL DEFAULT 0,
  mutation TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE UNIQUE INDEX escape_one_going ON escape_runs (user_id) WHERE status = 'going';
CREATE INDEX escape_user ON escape_runs (user_id, case_id, status);
-- 사건마다 처음 해결했을 때 한 번만 보상
CREATE TABLE escape_rewards (
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, case_id)
);
