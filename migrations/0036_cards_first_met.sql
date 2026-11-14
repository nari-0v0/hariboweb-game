-- 빙고 "새 카드" 칸과 시즌 "새 카드" 집계가 멤버 카드 전부를 읽지 않고, 그 주(시즌)에 처음 만난 카드만 읽게 해요.
CREATE INDEX cards_owner_first_met ON cards (owner_id, first_met);
