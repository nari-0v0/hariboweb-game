-- 도감 칭호: 고른 칭호(title_id)와 하리보봇이 닉네임에 마지막으로 붙인 칭호(title_applied, ''는 칭호 없음)
-- 얻은 칭호와 산 칭호는 owned_items에 'title:<id>'로 남아요.
ALTER TABLE profiles ADD COLUMN title_id TEXT;
ALTER TABLE profiles ADD COLUMN title_applied TEXT;
-- 봇이 못 붙인 이유(too_long, forbidden). 잘 붙으면 비워요.
ALTER TABLE profiles ADD COLUMN title_note TEXT;
-- 봇이 30초마다 "바꿀 칭호"만 찾아요. 표 전체를 읽지 않게 바꿀 줄만 담은 색인이에요.
CREATE INDEX profiles_title_pending ON profiles (user_id) WHERE COALESCE(title_id, '') != COALESCE(title_applied, '');
