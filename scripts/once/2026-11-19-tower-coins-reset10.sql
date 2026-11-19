-- 한 번 돌리는 조정(코드 배포 뒤 아무 때나, 다시 돌려도 바뀌지 않아요). 나리 2026-11-19: 마이너스(빚)까지 내려가도 돼요.
-- T = 옛 절반 방식으로 받은 층 수(tower - tower_new). 1~T층 절반 합계 ⌊(T+1)²/4⌋ − 새 방식 합계 55·⌊T/10⌋ + r(r+1)/2 (r = T mod 10)만큼 빼요.
-- 다 뺀 뒤 tower_new = tower로 맞춰서 두 번 빼지 않아요.
UPDATE journey_bank
SET coins = coins - (((tower - tower_new + 1) * (tower - tower_new + 1)) / 4
                     - (55 * ((tower - tower_new) / 10) + ((tower - tower_new) % 10) * ((tower - tower_new) % 10 + 1) / 2)),
    tower_new = tower
WHERE tower > tower_new;
