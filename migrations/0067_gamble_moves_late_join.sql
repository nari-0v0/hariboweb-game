-- 디스코드 겜블장 젤리 이전(0042) 때 웹 도감에 없던 사람(아직 안 들어옴·떠나 있음)도 나중에 들어오면 받게 해요(2026-11-21 점검).
-- 멤버가 새로 들어오거나(active = 1로 추가) 다시 들어오면(active 0 → 1) 아직 안 옮긴 줄의 moved_at을 채워요.
-- 그러면 0042의 gamble_jelly_move_credit 트리거가 젤칩을 넣어요. 이미 옮긴 줄(moved_at이 있음)은 건드리지 않아서
-- 옮겨 받은 뒤 떠났다가 다시 들어와도 두 번 받지 않아요.
CREATE TRIGGER gamble_jelly_move_on_join AFTER INSERT ON members
WHEN NEW.active = 1
BEGIN
  UPDATE gamble_jelly_moves SET moved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE user_id = NEW.user_id AND moved_at IS NULL;
END;

CREATE TRIGGER gamble_jelly_move_on_rejoin AFTER UPDATE OF active ON members
WHEN OLD.active = 0 AND NEW.active = 1
BEGIN
  UPDATE gamble_jelly_moves SET moved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE user_id = NEW.user_id AND moved_at IS NULL;
END;
