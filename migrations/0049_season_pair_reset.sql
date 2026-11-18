-- 시즌 중에 서버를 나갔다가 같은 시즌에 다시 들어온 사람의 팀 퀘스트·서버 퀘스트 판정에서 빼 줄 분.
-- 나갈 때까지 쌓인 값을 적어 둬요. gq_pair·kidnap_min은 남은 팀원·초록하리보의 기록이기도 해서 지우지 않고,
-- 다시 들어온 사람 쪽에서만 이 값을 빼고 세요(bingo_pair_reset과 같은 방식).
-- kind: 'team'(gq_pair, other = 팀원) / 'kidnap'(내가 납치한 쪽, other = 초록하리보) / 'kidnapped'(내가 초록하리보, other = 같이 있던 사람)
CREATE TABLE season_pair_reset (
  season_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL,
  other TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (season_id, kind, user_id, other)
);

-- 원래 기록이 지워지면(정식 시작 초기화 등) 빼 줄 값도 같이 지워요.
CREATE TRIGGER season_pair_reset_follow_gq_pair AFTER DELETE ON gq_pair
BEGIN
  DELETE FROM season_pair_reset
  WHERE season_id = OLD.season_id AND kind = 'team'
    AND ((user_id = OLD.a AND other = OLD.b) OR (user_id = OLD.b AND other = OLD.a));
END;

CREATE TRIGGER season_pair_reset_follow_kidnap AFTER DELETE ON kidnap_min
BEGIN
  DELETE FROM season_pair_reset
  WHERE season_id = OLD.season_id
    AND ((kind = 'kidnap' AND user_id = OLD.user_id AND other = OLD.newbie_id)
      OR (kind = 'kidnapped' AND user_id = OLD.newbie_id AND other = OLD.user_id));
END;
