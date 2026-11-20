-- 웹 겜블장 처음부터 시작하기 (나리 2026-11-16: "시작할 땐 다 초기화").
-- 젤칩 옮기기(scripts/gamble-jelly-moves.mjs) **전에** 한 번 실행해요.
-- 잔액·판 기록·시즌 1등·겜블 칭호를 지워요. 다른 도감 기록은 건드리지 않아요.
-- 젤리를 이미 옮긴 뒤라면 아무것도 지우지 않아요(옮긴 젤칩이 사라지지 않게).
-- 기본 젤칩 1000개는 각자 겜블장에 처음 들어올 때 "오늘의 젤칩"으로 들어와요.
DELETE FROM gamble_rounds
  WHERE NOT EXISTS (SELECT 1 FROM gamble_jelly_moves WHERE moved_at IS NOT NULL);
DELETE FROM gamble_season_winners
  WHERE NOT EXISTS (SELECT 1 FROM gamble_jelly_moves WHERE moved_at IS NOT NULL);
DELETE FROM gamble_accounts
  WHERE NOT EXISTS (SELECT 1 FROM gamble_jelly_moves WHERE moved_at IS NOT NULL);
UPDATE profiles SET title_id = NULL
  WHERE title_id LIKE 'gamble-%'
    AND NOT EXISTS (SELECT 1 FROM gamble_jelly_moves WHERE moved_at IS NOT NULL);
DELETE FROM owned_items
  WHERE item_id LIKE 'title:gamble-%'
    AND NOT EXISTS (SELECT 1 FROM gamble_jelly_moves WHERE moved_at IS NOT NULL);
