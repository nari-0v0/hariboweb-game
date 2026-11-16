-- 나갔다 다시 들어온 사람의 빙고에서 빼 줄 짝 통화 분(나갈 때까지 쌓인 값).
-- bingo_pair는 상대의 빙고 기록이라 지우지 않고, 다시 들어온 사람 쪽에서만 이 값을 빼고 세요.
CREATE TABLE bingo_pair_reset (
  week TEXT NOT NULL,
  user_id TEXT NOT NULL,
  other TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (week, user_id, other)
);

-- 짝 통화 기록(bingo_pair)이 지워지면(정식 시작 초기화 등) 빼 줄 값도 같이 지워요.
-- 안 그러면 초기화 뒤 새로 쌓인 통화에서 예전 값을 계속 빼게 돼요.
CREATE TRIGGER bingo_pair_reset_follow_delete AFTER DELETE ON bingo_pair
BEGIN
  DELETE FROM bingo_pair_reset
  WHERE week = OLD.week
    AND ((user_id = OLD.a AND other = OLD.b) OR (user_id = OLD.b AND other = OLD.a));
END;
