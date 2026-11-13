-- 올인 승리는 내림해서 실제로 돌려받은 칩이 건 칩보다 많을 때만 세요(1젤칩 × 1.5배 = 본전은 승리가 아니에요).
DROP TRIGGER gamble_credit;
CREATE TRIGGER gamble_credit AFTER UPDATE OF multiplier ON gamble_rounds
WHEN OLD.multiplier IS NULL AND NEW.multiplier IS NOT NULL
BEGIN
  UPDATE gamble_accounts SET
    chips = chips + CAST(NEW.bet * NEW.multiplier AS INTEGER),
    won = won + MAX(0, CAST(NEW.bet * NEW.multiplier AS INTEGER) - NEW.bet),
    best_win = MAX(best_win, CAST(NEW.bet * NEW.multiplier AS INTEGER) - NEW.bet),
    all_in_wins = all_in_wins + (NEW.all_in = 1 AND CAST(NEW.bet * NEW.multiplier AS INTEGER) > NEW.bet),
    plays = plays + 1,
    jackpots = jackpots + NEW.jackpot,
    naturals = naturals + NEW.natural
  WHERE user_id = NEW.user_id;
END;
