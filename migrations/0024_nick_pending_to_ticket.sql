-- 0022 이전에 산 닉네임 변경권이 아직 '기다리는 중'이면 봇이 더는 가져가지 않아요.
-- 그런 구매는 도감 변경권 1장으로 바꿔 줘요(매점에서 바로 쓸 수 있게).
UPDATE purchases SET status = 'done' WHERE item_id = 'svc:nickname' AND status = 'pending';
