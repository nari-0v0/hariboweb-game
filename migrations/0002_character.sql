-- 멤버 캐릭터: 서버 안에서 겹치지 않게 고른 씨앗과 그림 지문
ALTER TABLE profiles ADD COLUMN character_sig TEXT;
CREATE UNIQUE INDEX profiles_character_sig ON profiles (character_sig);
