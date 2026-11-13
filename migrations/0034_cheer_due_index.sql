-- 도감 축하 목록(봇이 1분마다 물어봐요)이 카드 표 전체를 읽지 않게, 축하할 차례인 카드만 담는 부분 색인.
-- 조건은 src/db.ts listCheers의 WHERE와 글자 그대로 같아야 쓰여요(XP_SCALE 4.5, 다음 축하 레벨 - 1).
CREATE INDEX cards_cheer_due ON cards (updated_at)
  WHERE owner_id < target_id AND cheer_level < 100 AND xp >= 4.5 * ((cheer_level / 10) * 10 + 9) * ((cheer_level / 10) * 10 + 9);
