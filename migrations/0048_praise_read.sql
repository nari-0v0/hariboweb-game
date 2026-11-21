-- 조회와 읽음 저장 사이, 같은 밀리초에 온 칭찬도 안 읽은 상태로 남기도록 건마다 표시해요.
ALTER TABLE praises ADD COLUMN read_at TEXT;
-- 기존에 읽었던 칭찬은 다시 새 칭찬으로 보이지 않게 옮겨요.
UPDATE praises SET read_at = (SELECT praise_seen_at FROM profiles p WHERE p.user_id = praises.to_id)
WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = praises.to_id
  AND p.praise_seen_at IS NOT NULL AND substr(praises.created_at, 1, 24) <= p.praise_seen_at);
