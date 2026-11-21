-- 탑 순위에서 같은 층이면 그 층에 먼저 오른 사람이 위예요(나리 2026-11-19 버그 찾기).
-- tower_at은 진 도전에도 바뀌어서, 같은 층에서 다시 도전하다 지면 순위가 밀렸어요. 이긴 때만 따로 적어요.
ALTER TABLE journey_bank ADD COLUMN tower_up_at TEXT;
UPDATE journey_bank SET tower_up_at = tower_at WHERE tower > 0;
