-- 오늘(한국 날짜) 같이 통화한 짝. 디스코드 패널 칭찬하기가 "오늘 같이 논 사람"을 고를 때 써요.
-- 봇은 오늘 기록을 메모리에만 들고 있어서 재시작하면 비어요. 그래서 웹에도 하루치를 남겨요.
-- 동기화 때마다 3일 지난 줄은 지워서 아주 작게 유지해요.
CREATE TABLE pair_day (
  day TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  PRIMARY KEY (day, a, b)
);
CREATE INDEX pair_day_b ON pair_day (day, b);
