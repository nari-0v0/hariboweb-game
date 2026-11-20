-- 11/21 점검 공지를 한 번 더 🔔 알림함에 넣어요(나리 2026-11-21 02:54, 6시 배포 뒤). 0050과 ref가 달라서 새로 떠요.
-- ref가 같으면 다시 넣지 않아요. 15일이 지나면 다른 알림처럼 저절로 지워져요.
INSERT OR IGNORE INTO alerts (user_id, ref, title, body, created_at)
SELECT user_id, 'notice:2026-11-21-maintenance-2', '점검 공지(다시 알려 드려요)',
  '날짜 : 11/21' || char(10) ||
  '시간 : 시간대 미정' || char(10) || char(10) ||
  '겜블장 이전에 따라 긴 점검이 있을 예정입니다.' || char(10) ||
  '최대한 빨리 할 예정이니 양해부탁드립니다.' || char(10) || char(10) ||
  '🔥 점검 종료 후 2시간동안 버닝타임 예정입니다.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM members WHERE active = 1;
