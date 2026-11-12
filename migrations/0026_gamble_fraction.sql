-- 룰렛에 0.5배·1.5배 칸이 생겨서, 돌려받는 칩은 건 칩 × 배수를 내림한 정수로 계산해요.
DROP TRIGGER gamble_credit;
CREATE TRIGGER gamble_credit AFTER UPDATE OF multiplier ON gamble_rounds
WHEN OLD.multiplier IS NULL AND NEW.multiplier IS NOT NULL
BEGIN
  UPDATE gamble_accounts SET
    chips = chips + CAST(NEW.bet * NEW.multiplier AS INTEGER),
    won = won + MAX(0, CAST(NEW.bet * NEW.multiplier AS INTEGER) - NEW.bet),
    best_win = MAX(best_win, CAST(NEW.bet * NEW.multiplier AS INTEGER) - NEW.bet),
    all_in_wins = all_in_wins + (NEW.all_in = 1 AND NEW.multiplier > 1),
    plays = plays + 1,
    jackpots = jackpots + NEW.jackpot,
    naturals = naturals + NEW.natural
  WHERE user_id = NEW.user_id;
END;
