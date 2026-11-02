-- 젤리 상점: 산 물건, 결제 요청, 장착한 꾸밈 캐릭터
-- 젤리 통장은 하리보봇 DB에 있어요. 웹은 결제 요청을 남기고, 봇이 젤리를 빼고 결과를 알려 줘요.

ALTER TABLE profiles ADD COLUMN deco_id TEXT;
-- 봇이 마지막으로 알려 준 젤리 잔액(보여 주기용, 실제 결제는 봇이 판단)
ALTER TABLE profiles ADD COLUMN jelly INTEGER;

-- 가진 물건(테마, 꾸밈 캐릭터)
CREATE TABLE owned_items (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

-- 결제 요청. pending → done(샀어요) 또는 failed(젤리 부족 등)
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TEXT NOT NULL,
  settled_at TEXT,
  seen_at TEXT -- 결과 팝업을 본 시각
);

-- 같은 물건을 동시에 두 번 결제 요청하지 못하게
CREATE UNIQUE INDEX purchases_one_pending ON purchases (user_id, item_id) WHERE status = 'pending';
CREATE INDEX purchases_status ON purchases (status, created_at);
