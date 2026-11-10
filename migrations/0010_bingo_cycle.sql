-- 빙고판 기간을 생명력(커뮤니티) 주기에 맞춰요. 봇이 동기화 때 보내는 주기(season, 2주)를 반으로 나눠 "이번 주" 두 개로 적어 둬요.
-- 빙고 표들의 week 칸에는 이제 그 절반이 시작하는 날의 한국 날짜가 들어가요. 주기를 아직 모를 때만 월요일 기준 주를 써요.
CREATE TABLE bingo_periods (
  id TEXT PRIMARY KEY,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);
CREATE INDEX bingo_periods_end ON bingo_periods (ends_at);
