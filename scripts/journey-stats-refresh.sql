-- 원정대 기록 모음(journey_bank.best/clears/farmed)을 지난 판에서 다시 계산해요. 0047 마이그레이션과 새 코드 배포가 끝난 뒤에 한 번 돌려요.
-- npx wrangler d1 execute haribo-dogam --remote --file scripts/journey-stats-refresh.sql
INSERT INTO journey_bank (user_id, updated_at)
  SELECT DISTINCT user_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM journey_runs WHERE status = 'done'
  ON CONFLICT (user_id) DO NOTHING;
UPDATE journey_bank SET
  best = (SELECT COALESCE(MAX((chapter - 1) * 20 + day), 0) FROM journey_runs r WHERE r.user_id = journey_bank.user_id AND r.status = 'done'),
  clears = (SELECT COALESCE(SUM(cleared), 0) FROM journey_runs r WHERE r.user_id = journey_bank.user_id AND r.status = 'done'),
  farmed = COALESCE((SELECT json_group_object(chapter, n) FROM (
    SELECT chapter, COUNT(*) AS n FROM journey_runs r
    WHERE r.user_id = journey_bank.user_id AND r.status = 'done' AND json_extract(r.state, '$.farm') = 1 GROUP BY chapter)), '{}');
