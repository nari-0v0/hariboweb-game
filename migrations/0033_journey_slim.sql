-- 원정대 판 기록이 끝없이 커지지 않게: 끝난 지 오래된 판은 진행 그림(state)을 비우고 집계에 쓰는 farm만 남겨요.
-- 이 부분 색인은 아직 비우지 않은 끝난 판만 담아서, 비울 판을 찾을 때 적은 줄만 읽어요.
CREATE INDEX journey_fat ON journey_runs (user_id, updated_at) WHERE status != 'going' AND length(state) > 200;
