-- 탑 층 보상을 10층마다 1개부터 다시 세는 방식으로 바꿨어요(나리 2026-11-19).
-- tower_new = 새 방식으로 보상을 받은 층 수(새 코드가 이길 때마다 1씩 올려요). 0으로 시작해요.
-- 옛 방식(절반)으로 받은 층은 언제나 1 ~ (tower - tower_new)층이라서, 배포 뒤 아무 때나 한 번 돌리는 조정 SQL이
-- 배포 사이에 오른 층까지 정확히 셀 수 있어요(조정 SQL은 PR #268 본문).
ALTER TABLE journey_bank ADD COLUMN tower_new INTEGER NOT NULL DEFAULT 0;
