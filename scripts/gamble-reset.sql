-- 웹 겜블장 출시 초기화. 이관 전에만 실행해요.
-- 완료 기록과 삭제를 한 문장으로 처리해서, 지급이 0건이어도 다시 지우지 않아요.
CREATE TABLE IF NOT EXISTS gamble_launch_reset (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS gamble_launch_reset_apply
AFTER INSERT ON gamble_launch_reset
BEGIN
  DELETE FROM gamble_rounds;
  DELETE FROM gamble_season_winners;
  DELETE FROM gamble_accounts;
  UPDATE profiles SET title_id = NULL WHERE title_id LIKE 'gamble-%';
  DELETE FROM owned_items WHERE item_id LIKE 'title:gamble-%';
END;

INSERT INTO gamble_launch_reset (id, completed_at)
SELECT 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM gamble_launch_reset WHERE id = 1)
  AND NOT EXISTS (SELECT 1 FROM gamble_jelly_moves WHERE moved_at IS NOT NULL);
