-- 버닝타임 지난 기록(점검 2026-11-21): 봇 통화 기록이 늦게 와도, 그 사이 새 버닝타임을 켜서
-- burning 표가 바뀌었으면 예전 버닝 때 통화가 빙고에서 2배로 안 쳐졌어요. 새 버닝을 시작할 때(started_at이 바뀔 때)만 바뀌기 전 값을 남겨 둬요.
-- 같은 버닝을 일찍 끝내거나 늘리면(until만 바꾸면) 남기지 않아요. 그래야 일찍 끝낸 뒤 통화가 2배로 쳐지지 않아요.
CREATE TABLE IF NOT EXISTS burning_history (
  started_at TEXT PRIMARY KEY,
  until TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS burning_keep_history
AFTER UPDATE ON burning
WHEN OLD.started_at IS NOT NULL AND OLD.until IS NOT NULL
  AND NEW.started_at IS NOT OLD.started_at
BEGIN
  INSERT OR REPLACE INTO burning_history (started_at, until) VALUES (OLD.started_at, OLD.until);
END;
