-- 나갔다 다시 들어온 사람의 빙고에서 빼 줄 짝 통화 분(나갈 때까지 쌓인 값).
-- bingo_pair는 상대의 빙고 기록이라 지우지 않고, 다시 들어온 사람 쪽에서만 이 값을 빼고 세요.
CREATE TABLE bingo_pair_reset (
  week TEXT NOT NULL,
  user_id TEXT NOT NULL,
  other TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (week, user_id, other)
);
