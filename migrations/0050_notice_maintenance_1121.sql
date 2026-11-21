-- 11/21 겜블장 이전 점검 공지를 지금 있는 멤버 모두의 🔔 알림함에 한 번씩 넣어요(나리 2026-11-18).
-- ref가 같으면 다시 넣지 않아요. 15일이 지나면 다른 알림처럼 저절로 지워져요.
INSERT OR IGNORE INTO alerts (user_id, ref, title, body, created_at)
SELECT user_id, 'notice:2026-11-21-maintenance', '점검 공지',
  '날짜 : 11/21' || char(10) ||
  '시간 : 시간대 미정 (정신차리면 할거임)' || char(10) || char(10) ||
  '겜블장 이전에 따라 긴 점검이 있을 예정입니다.' || char(10) ||
  '준비는 해두었는데 얼마나 걸릴지 모르겠구요..' || char(10) ||
  '최대한 빨리 할 예정이니 양해부탁드립니다.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM members WHERE active = 1;
