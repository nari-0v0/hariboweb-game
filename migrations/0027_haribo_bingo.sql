-- 하리보 빙고: 빙고 가운데 칸 "팀 퀘스트", 서버 퀘스트 "초록하리보 납치 대소동!", 젤리피 기록, 통화 시간대.
-- 기존 모둠 퀘스트 8개는 새 시즌부터 만들지 않아요(진행 중인 시즌 것은 그대로 둬요).

-- 팀 퀘스트 짝: 시즌 시작 때 정해요. 같은 팀 + 게임 역할이 겹침(역할 없으면 누구나)
-- + 시즌 시작 전 2주 동안 같은 통화방에 함께한 시간이 10분 미만. 두 사람 다 그 2주에 통화방에 나왔어야 해요(a < b).
CREATE TABLE team_pairs (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  PRIMARY KEY (season_id, a, b)
);
CREATE INDEX team_pairs_group ON team_pairs (season_id, group_no);

-- 서버 퀘스트(초록하리보 납치 대소동!): 시즌 시작 때 초록하리보 수와 목표(납치할 초록하리보 수)
CREATE TABLE server_quest (
  season_id TEXT PRIMARY KEY,
  newbies INTEGER NOT NULL,
  target INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- 초록하리보와 같은 통화방에 있던 분(서버 전체, 팀 상관없음)
CREATE TABLE kidnap_min (
  season_id TEXT NOT NULL,
  newbie_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (season_id, newbie_id, user_id)
);

-- 시즌 끝 보상(팀 퀘스트 kind='team', 서버 퀘스트 kind='server')을 한 번만 주려고 적어 둬요
CREATE TABLE season_settle (
  season_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  mark TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (season_id, kind)
);

-- 젤리피: 쓸 수 없는 기록. source = line/full/team/server, ref = 같은 보상을 두 번 적지 않게 하는 열쇠
CREATE TABLE jellypi (
  user_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  source TEXT NOT NULL,
  ref TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, source, ref)
);
CREATE INDEX jellypi_season ON jellypi (season_id);

-- 멤버마다 날마다 통화한 시간대(팀을 짤 때 주로 노는 시간대가 겹치게). slot = day/eve/night/dawn
CREATE TABLE member_voice_slot (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  slot TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, slot)
);
