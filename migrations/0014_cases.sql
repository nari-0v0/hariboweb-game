-- 하리보 사건파일

-- 사건 하나. 조사한 장소 번호(looked)만 적고, 사건 내용은 씨앗으로 다시 계산해요.
CREATE TABLE case_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  suspects TEXT NOT NULL,          -- 시작할 때 정한 용의자 4명(JSON)
  looked TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'going', -- going | done | quit
  answer TEXT,                     -- 고른 범인·방법·동기(JSON)
  grade TEXT,                      -- S A B C F
  day TEXT,                        -- 끝난 한국 날짜(하루 보상 횟수를 세요)
  xp INTEGER NOT NULL DEFAULT 0,
  jelly INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX case_runs_user ON case_runs (user_id, status);
CREATE INDEX case_runs_day ON case_runs (user_id, day);
