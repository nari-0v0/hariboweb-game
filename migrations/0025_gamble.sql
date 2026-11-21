CREATE TABLE gamble_accounts (
  user_id TEXT PRIMARY KEY REFERENCES members(user_id) ON DELETE CASCADE,
  chips INTEGER NOT NULL DEFAULT 0 CHECK (chips >= 0),
  free_day TEXT,
  rescue_day TEXT,
  won INTEGER NOT NULL DEFAULT 0,
  best_win INTEGER NOT NULL DEFAULT 0,
  all_in_wins INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  jackpots INTEGER NOT NULL DEFAULT 0,
  naturals INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE gamble_rounds (
  user_id TEXT NOT NULL REFERENCES gamble_accounts(user_id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('slot', 'roulette', 'cards')),
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
CREATE UNIQUE INDEX gamble_one_card_hand ON gamble_rounds(user_id)
  WHERE game = 'cards' AND settled_at IS NULL;
CREATE INDEX gamble_expiring ON gamble_rounds(expires_at)
  WHERE game = 'cards' AND settled_at IS NULL;
CREATE INDEX gamble_settled ON gamble_rounds(settled_at, user_id);

CREATE TABLE gamble_season_winners (
  season_id TEXT PRIMARY KEY REFERENCES seasons(id),
  user_id TEXT NOT NULL,
  won INTEGER NOT NULL,
  awarded_at TEXT NOT NULL
);

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
    chips = chips + NEW.bet * NEW.multiplier,
    won = won + MAX(0, NEW.bet * (NEW.multiplier - 1)),
    best_win = MAX(best_win, NEW.bet * (NEW.multiplier - 1)),
    all_in_wins = all_in_wins + (NEW.all_in = 1 AND NEW.multiplier > 1),
    plays = plays + 1,
    jackpots = jackpots + NEW.jackpot,
    naturals = naturals + NEW.natural
  WHERE user_id = NEW.user_id;
END;

-- 탈퇴한 멤버의 잔액과 판 기록을 지우고, 끝난 시즌의 확정 기록은 익명으로 남겨요.
CREATE TRIGGER gamble_member_left AFTER UPDATE OF active ON members
WHEN OLD.active = 1 AND NEW.active = 0
BEGIN
  DELETE FROM gamble_accounts WHERE user_id = NEW.user_id;
  UPDATE gamble_season_winners SET user_id = '' WHERE user_id = NEW.user_id;
END;
