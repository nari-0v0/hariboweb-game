-- 버닝 지난 기록 끝 자르기(Codex #313): 버닝이 끝나기 전에 새 버닝을 시작하면, 예전 버닝의 예정 끝 시각이
-- 그대로 남아서 새 버닝을 일찍 끝내도 빙고 통화가 계속 2배로 쳐졌어요. 예전 기록의 끝은 새 시작 시각을 넘지 않게 남겨요.
DROP TRIGGER IF EXISTS burning_keep_history;
CREATE TRIGGER IF NOT EXISTS burning_keep_history
AFTER UPDATE ON burning
WHEN OLD.started_at IS NOT NULL AND OLD.until IS NOT NULL
  AND NEW.started_at IS NOT OLD.started_at
BEGIN
  INSERT OR REPLACE INTO burning_history (started_at, until)
  VALUES (
    OLD.started_at,
    CASE WHEN NEW.started_at IS NOT NULL AND NEW.started_at > OLD.started_at AND NEW.started_at < OLD.until
      THEN NEW.started_at ELSE OLD.until END
  );
END;
-- 이미 남은 기록도 다음 버닝 시작 시각에서 잘라요.
UPDATE burning_history
SET until = (SELECT b.started_at FROM burning b WHERE b.id = 1)
WHERE EXISTS (
  SELECT 1 FROM burning b
  WHERE b.id = 1 AND b.started_at IS NOT NULL
    AND b.started_at > burning_history.started_at AND b.started_at < burning_history.until
);
