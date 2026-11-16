-- 하리보 원정대 1구역(안개숲)

-- 원정대에서 내 카드가 맡는 역할(비어 있으면 ID로 정해진 기본 역할)
ALTER TABLE profiles ADD COLUMN exp_role TEXT;

-- 원정 한 판. 고른 번호(choices)만 적고, 상태는 씨앗과 번호로 다시 계산해요.
CREATE TABLE exp_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  crew TEXT NOT NULL,             -- 시작할 때 고른 대원 3명(JSON)
  choices TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'going', -- going | done | quit
  ending TEXT,
  day TEXT,                       -- 끝난 한국 날짜(하루 보상 횟수를 세요)
  xp INTEGER NOT NULL DEFAULT 0,  -- 받은 보상
  jelly INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX exp_runs_user ON exp_runs (user_id, status);
CREATE INDEX exp_runs_day ON exp_runs (user_id, day);

-- 모은 발견품
CREATE TABLE exp_finds (
  user_id TEXT NOT NULL,
  find_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL,
  PRIMARY KEY (user_id, find_id)
);
