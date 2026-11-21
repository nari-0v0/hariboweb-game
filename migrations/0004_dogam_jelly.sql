-- 도감 전용 젤리: 겜블 젤리와 완전히 따로예요. 웹 안에서만 모으고 써요.
-- 하리보봇 겜블 지갑에서 빼던 결제 방식은 없어졌어요.

-- 내 도감 젤리 잔액
ALTER TABLE profiles ADD COLUMN dogam_jelly INTEGER NOT NULL DEFAULT 0;
-- 처음 젤리 선물을 받은 때(계정당 한 번만. 나갔다 다시 들어와도 또 받지 않아요)
ALTER TABLE members ADD COLUMN starter_jelly_at TEXT;
-- 카드마다 레벨업 젤리를 어느 레벨까지 줬는지. 지금 있는 카드는 지금 레벨까지 준 것으로 쳐요(앞으로 오르는 레벨부터 받아요).
ALTER TABLE cards ADD COLUMN jelly_level INTEGER NOT NULL DEFAULT 1;
UPDATE cards SET jelly_level = (1 + (SELECT COUNT(*) FROM (VALUES (30),(120),(270),(480),(750),(1080),(1470),(1920),(2430),(3000),(3630),(4320),(5070),(5880),(6750),(7680),(8670),(9720),(10830),(12000),(13230),(14520),(15870),(17280),(18750),(20280),(21870),(23520),(25230),(27000),(28830),(30720),(32670),(34680),(36750),(38880),(41070),(43320),(45630),(48000),(50430),(52920),(55470),(58080),(60750),(63480),(66270),(69120),(72030)) WHERE column1 <= xp));

-- 예전에 봇이 알려 주던 겜블 젤리 잔액은 더 이상 쓰지 않아요
UPDATE profiles SET jelly = NULL;

-- 겜블 젤리로 결제를 기다리던 요청은 취소해요(젤리는 빠지지 않았어요)
UPDATE purchases SET status = 'failed', reason = 'shop_changed', settled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'pending';

-- 예전에 겜블 젤리로 이미 산 것은 겜블 젤리를 돌려줘요(산 물건은 그대로 가져요).
-- 봇이 한 건씩 돌려주고 'done'으로 바꿔요. 위에서 취소한 건은 빼고, 결제가 끝난 것만 골라요.
ALTER TABLE purchases ADD COLUMN refund TEXT;
UPDATE purchases SET refund = 'pending' WHERE status = 'done';
