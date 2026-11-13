-- 동기화마다(10분) 30일 지난 묶음 번호를 지우는데, 색인이 없어 표 전체(최대 4천여 줄)를 읽었어요.
CREATE INDEX sync_batches_applied ON sync_batches (applied_at);
