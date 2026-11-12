-- 칭찬 한마디와 칭찬함
-- note: 칭찬과 같이 보낸 한마디(100자까지). 비꼬기·욕이면 저장하지 않고 칭찬만 전해요.
-- note_hidden: 받은 사람이 칭찬함에서 한마디를 숨겼는지
ALTER TABLE praises ADD COLUMN note TEXT;
ALTER TABLE praises ADD COLUMN note_hidden INTEGER NOT NULL DEFAULT 0;
-- 칭찬함을 마지막으로 본 때(안 읽은 칭찬 개수를 세요)
ALTER TABLE profiles ADD COLUMN praise_seen_at TEXT;
