-- 도감 전용 젤리: 겜블 젤리와 완전히 따로예요. 웹 안에서만 모으고 써요.
-- 하리보봇 겜블 지갑에서 빼던 결제 방식은 없어졌어요.

-- 내 도감 젤리 잔액
ALTER TABLE profiles ADD COLUMN dogam_jelly INTEGER NOT NULL DEFAULT 0;
-- 처음 젤리 선물을 받은 때(계정당 한 번만. 나갔다 다시 들어와도 또 받지 않아요)
ALTER TABLE members ADD COLUMN starter_jelly_at TEXT;

-- 예전에 봇이 알려 주던 겜블 젤리 잔액은 더 이상 쓰지 않아요
UPDATE profiles SET jelly = NULL;

-- 겜블 젤리로 결제를 기다리던 요청은 취소해요(젤리는 빠지지 않았어요)
UPDATE purchases SET status = 'failed', reason = 'shop_changed', settled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'pending';
