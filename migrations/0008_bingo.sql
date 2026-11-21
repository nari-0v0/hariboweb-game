-- 주간 빙고: 한 주(한국 시간 월요일 0시 ~ 다음 월요일 0시)마다 멤버마다 3×3 빙고판이 하나씩 생겨요.
-- 빙고판은 주와 멤버로 정해지는 무작위라 따로 적지 않아요. 칸은 봇이 보내는 1분 통화방 기록·출석과
-- 웹이 아는 칭찬·패널 열기로 저절로 채워져요. 한 줄을 채울 때마다 도감 젤리와 내 카드 경험치를 받아요.
-- week = 그 주 월요일의 한국 날짜(YYYY-MM-DD). 표마다 사람·날마다 모아 둔 숫자만 있어서 작아요.

-- 사람마다 날마다: 다른 사람과 같은 통화방에 있던 분(minutes), 그중 4명 이상 방(crowd), 밤 10시~새벽 2시(night), 출석(attended)
CREATE TABLE bingo_day (
  week TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  crowd INTEGER NOT NULL DEFAULT 0,
  night INTEGER NOT NULL DEFAULT 0,
  attended INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, user_id, day)
);

-- 짝끼리 이번 주에 같이 통화한 분(a < b)
CREATE TABLE bingo_pair (
  week TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (week, a, b)
);
CREATE INDEX bingo_pair_b ON bingo_pair (week, b);

-- 한 번만 하면 되는 칸(panel = 디스코드 패널에서 내 카드 열기, web = 웹 도감에서 내 카드 보기)
CREATE TABLE bingo_flag (
  week TEXT NOT NULL,
  user_id TEXT NOT NULL,
  flag TEXT NOT NULL,
  PRIMARY KEY (week, user_id, flag)
);

-- 보상을 준 줄(0~7 = 가로 3·세로 3·대각선 2, 8 = 9칸 다 채움). 줄마다 딱 한 번만 줘요.
CREATE TABLE bingo_lines (
  week TEXT NOT NULL,
  user_id TEXT NOT NULL,
  line INTEGER NOT NULL,
  mark TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (week, user_id, line)
);
