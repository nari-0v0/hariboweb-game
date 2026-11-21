-- 「오늘의 활약」을 아침 6시 기준 하루로 세려고 따로 쌓아요(나리 2026-11-21).
-- gq_member_day(0시 기준)는 시간대 퀘스트·주말 계산이 그대로 쓰니 건드리지 않아요.
CREATE TABLE gq_member_gameday (
  season_id TEXT NOT NULL,
  group_no INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (season_id, group_no, user_id, day)
);

-- 배포하는 11/21 하루만: 오늘 이미 쌓인 분을 옮겨 둬요(0~6시 분이 섞이지만, 비워 두면 오늘의 활약이 텅 비어요).
INSERT OR IGNORE INTO gq_member_gameday (season_id, group_no, user_id, day, minutes)
  SELECT season_id, group_no, user_id, day, minutes FROM gq_member_day WHERE day = '2026-11-21';
