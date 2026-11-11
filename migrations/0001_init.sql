-- 하리보 멤버 도감 1단계: 멤버, 내 카드, 함께한 카드, 봇 동기화 기록

-- 봇이 보내주는 서버 멤버 목록. 서버를 나가면 active = 0이 돼요.
CREATE TABLE members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  joined_at TEXT,
  is_newbie INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- 내 카드: 혼자 한 활동 경험치와 꾸미기 설정
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY,
  solo_xp INTEGER NOT NULL DEFAULT 0,
  intro TEXT NOT NULL DEFAULT '',
  theme_id TEXT NOT NULL DEFAULT 'basic',
  character_id TEXT,
  updated_at TEXT NOT NULL
);

-- owner의 도감에 있는 target 카드. 같이 놀면 양쪽 방향 줄이 함께 올라가요.
CREATE TABLE cards (
  owner_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  voice_seconds INTEGER NOT NULL DEFAULT 0,
  scrims INTEGER NOT NULL DEFAULT 0,
  first_met TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, target_id)
);

CREATE INDEX cards_target ON cards (target_id);

-- 같은 묶음을 두 번 받아도 한 번만 반영하려고 남겨요.
CREATE TABLE sync_batches (
  batch_id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
