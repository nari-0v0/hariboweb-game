-- 시즌 모둠 퀘스트: 시즌(서바이벌 주기 2주)마다 게임 역할이 겹치는 사람끼리 10명 안팎으로 랜덤 모둠을 만들고,
-- 모둠마다 퀘스트 8개를 뽑아요. 진행도는 봇이 보내는 1분 통화방 기록, 내전, 출석으로 세요.
-- 표마다 시즌·모둠별로 모아 둔 숫자만 있어서 작아요.

-- 봇이 보내는 게임 역할 이름(JSON 배열)과 웹 도감에 마지막으로 들어온 때
ALTER TABLE members ADD COLUMN games TEXT NOT NULL DEFAULT '[]';
ALTER TABLE members ADD COLUMN last_login_at TEXT;

CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 누가 어느 모둠인지. start_member = 시즌 시작 때 모둠원(1) / 중간에 들어온 사람(0). 나가면 left_at.
CREATE TABLE season_members (
  season_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  start_member INTEGER NOT NULL,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (season_id, user_id)
);
CREATE INDEX season_members_group ON season_members (season_id, group_no);

-- 모둠마다 뽑힌 퀘스트(slot 0~7)와 깬 때
CREATE TABLE season_quests (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  quest_id TEXT NOT NULL,
  done_at TEXT,
  PRIMARY KEY (season_id, group_no, slot)
);

-- 시즌 시작(또는 늦게 들어온 때) 카드 경험치. owner_id = target_id면 내 카드.
CREATE TABLE season_snap (
  season_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  xp INTEGER NOT NULL,
  PRIMARY KEY (season_id, owner_id, target_id)
);

-- 8개를 다 깬 모둠원이 받는 시즌 칭호
CREATE TABLE season_titles (
  season_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (season_id, user_id)
);

-- 모둠끼리 통화한 분: 한국 날짜·시간, 같은 방에 있던 모둠원 수(together), 그중 같은 게임 역할 최대 인원(same)
CREATE TABLE gq_voice (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  together INTEGER NOT NULL,
  same INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (season_id, group_no, day, hour, together, same)
);

-- 모둠원마다 날마다 모둠원과 통화한 분
CREATE TABLE gq_member_day (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (season_id, group_no, user_id, day)
);

-- 모둠 안 짝끼리 같이 통화한 분(a < b)
CREATE TABLE gq_pair (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (season_id, group_no, a, b)
);

-- 모둠끼리 통화한 방
CREATE TABLE gq_room (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  PRIMARY KEY (season_id, group_no, room_id)
);

-- 모둠끼리 이어서 통화한 시간(지금 이어지는 분, 가장 길었던 분)
CREATE TABLE gq_run (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  last_minute TEXT NOT NULL,
  current INTEGER NOT NULL,
  best INTEGER NOT NULL,
  PRIMARY KEY (season_id, group_no)
);

-- 모둠원이 참가한 내전(members = 참가한 모둠원 ID JSON, newbies = 그 내전의 신입 수)
CREATE TABLE gq_scrim (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  scrim_id TEXT NOT NULL,
  game TEXT NOT NULL,
  day TEXT NOT NULL,
  members TEXT NOT NULL,
  newbies INTEGER NOT NULL,
  PRIMARY KEY (season_id, group_no, scrim_id)
);

-- 모둠원이 신입과 같이 통화한 분
CREATE TABLE gq_newbie (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  newbie_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (season_id, group_no, newbie_id, user_id)
);

-- 출석한 날
CREATE TABLE gq_attend (
  season_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (season_id, user_id, day)
);

-- 멤버마다 날마다 다른 사람과 같이 통화한 분(모둠을 고르게 섞을 때 최근 활동량으로 써요). 하루 한 줄이라 작아요.
CREATE TABLE member_voice_day (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
