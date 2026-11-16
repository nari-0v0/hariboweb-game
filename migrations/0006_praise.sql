-- 디스코드 고정 패널의 칭찬하기. 오늘 같이 통화하거나 내전을 뛴 사람에게 하루 3번, 같은 사람에게는 하루 1번 줄 수 있어요.
-- day는 한국 날짜(YYYY-MM-DD)예요. 한 줄이 아주 작아서 지우지 않고 남겨요(나중에 시즌 팀 점수에 써요).
CREATE TABLE praises (
  day TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  -- 받은 사람에게 젤리를 줬는지(하루에 받는 칭찬 젤리는 3개까지)
  jelly INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, from_id, to_id)
);

CREATE INDEX praises_to ON praises (day, to_id);
