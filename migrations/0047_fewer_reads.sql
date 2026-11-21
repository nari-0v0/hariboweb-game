-- 원정대 기록(가장 높이 간 레벨, 대장 깬 횟수, 장마다 다시 돈 판 수)을 강화 주머니 줄에 모아 둬요.
-- 전에는 원정대 화면을 열 때마다 그 사람의 지난 판을 전부 읽어서 무료 DB 읽기 한도(하루 500만 줄)를 넘겼어요(2026-11-17).
ALTER TABLE journey_bank ADD COLUMN best INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journey_bank ADD COLUMN clears INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journey_bank ADD COLUMN farmed TEXT NOT NULL DEFAULT '{}';

-- 대장을 깬 가장 높은 장 / 마지막으로 돈 판을 몇 줄만 읽고 찾게
CREATE INDEX journey_top ON journey_runs (user_id, status, cleared, chapter);
CREATE INDEX journey_started ON journey_runs (user_id, started_at);

-- 봇이 칭호 목록을 받아 갈 때마다 하는 "목록에서 빠진 칭호 비우기"가 profiles 전체를 훑지 않고 칭호 고른 사람만 보게
CREATE INDEX profiles_titled ON profiles (title_id) WHERE title_id IS NOT NULL;

-- 지금까지의 판으로 채워요(scripts/journey-stats-refresh.sql과 같은 내용. 배포 뒤 한 번 더 돌려도 돼요).
INSERT INTO journey_bank (user_id, updated_at)
  SELECT DISTINCT user_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM journey_runs WHERE status = 'done'
  ON CONFLICT (user_id) DO NOTHING;
UPDATE journey_bank SET
  best = (SELECT COALESCE(MAX((chapter - 1) * 20 + day), 0) FROM journey_runs r WHERE r.user_id = journey_bank.user_id AND r.status = 'done'),
  clears = (SELECT COALESCE(SUM(cleared), 0) FROM journey_runs r WHERE r.user_id = journey_bank.user_id AND r.status = 'done'),
  farmed = COALESCE((SELECT json_group_object(chapter, n) FROM (
    SELECT chapter, COUNT(*) AS n FROM journey_runs r
    WHERE r.user_id = journey_bank.user_id AND r.status = 'done' AND json_extract(r.state, '$.farm') = 1 GROUP BY chapter)), '{}');
