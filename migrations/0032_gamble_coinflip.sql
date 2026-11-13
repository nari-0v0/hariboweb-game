-- 겜블장 동전 던지기(coinflip) 추가. SQLite는 CHECK를 바꿀 수 없어서 gamble_rounds를 새로 만들어 옮겨요.
-- 표를 지우면 그 표의 트리거·색인도 같이 지워져서, 지금 쓰는 정의(0031까지)로 다시 만들어요.
PRAGMA defer_foreign_keys = true;

CREATE TABLE gamble_rounds_new (
  user_id TEXT NOT NULL REFERENCES gamble_accounts(user_id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('slot', 'roulette', 'cards', 'coinflip')),
  bet INTEGER NOT NULL CHECK (bet >= 1),
  all_in INTEGER NOT NULL CHECK (all_in IN (0, 1)),
  state TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  multiplier INTEGER CHECK (multiplier BETWEEN 0 AND 10),
  settled_at TEXT,
  jackpot INTEGER NOT NULL DEFAULT 0,
  natural INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, token),
  CHECK ((multiplier IS NULL) = (settled_at IS NULL))
);
INSERT INTO gamble_rounds_new (user_id, token, game, bet, all_in, state, expires_at, revision, multiplier, settled_at, jackpot, natural)
  SELECT user_id, token, game, bet, all_in, state, expires_at, revision, multiplier, settled_at, jackpot, natural FROM gamble_rounds;
DROP TABLE gamble_rounds;
ALTER TABLE gamble_rounds_new RENAME TO gamble_rounds;

CREATE UNIQUE INDEX gamble_one_card_hand ON gamble_rounds(user_id)
  WHERE game = 'cards' AND settled_at IS NULL;
CREATE INDEX gamble_expiring ON gamble_rounds(expires_at)
  WHERE game = 'cards' AND settled_at IS NULL;
CREATE INDEX gamble_settled ON gamble_rounds(settled_at, user_id);

CREATE TRIGGER gamble_debit AFTER INSERT ON gamble_rounds
BEGIN
  UPDATE gamble_accounts SET chips = chips - NEW.bet
    WHERE user_id = NEW.user_id AND chips >= NEW.bet;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'insufficient chips') END;
END;

CREATE TRIGGER gamble_credit AFTER UPDATE OF multiplier ON gamble_rounds
WHEN OLD.multiplier IS NULL AND NEW.multiplier IS NOT NULL
BEGIN
  UPDATE gamble_accounts SET
    chips = chips + (NEW.bet * CAST(ROUND(NEW.multiplier * 100) AS INTEGER) / 100),
    won = won + MAX(0, (NEW.bet * CAST(ROUND(NEW.multiplier * 100) AS INTEGER) / 100) - NEW.bet),
    best_win = MAX(best_win, (NEW.bet * CAST(ROUND(NEW.multiplier * 100) AS INTEGER) / 100) - NEW.bet),
    all_in_wins = all_in_wins + (NEW.all_in = 1 AND (NEW.bet * CAST(ROUND(NEW.multiplier * 100) AS INTEGER) / 100) > NEW.bet),
    plays = plays + 1,
    jackpots = jackpots + NEW.jackpot,
    naturals = naturals + NEW.natural
  WHERE user_id = NEW.user_id;
END;
