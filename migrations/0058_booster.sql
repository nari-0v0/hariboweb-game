-- 디스코드 서버 부스터 혜택(나리 2026-11-21). 봇이 동기화 members[].booster로 보내요.
-- booster: 지금 부스트 중이면 1. 「부스터」 칭호와 이름 옆 💎는 이 값이 1일 때만 보여요.
-- booster_gift_month: 감사 젤리를 마지막으로 준 한국 달(YYYY-MM). 나갔다 와도 같은 달에 두 번 받지 않게 members에 둬요.
ALTER TABLE members ADD COLUMN booster INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN booster_gift_month TEXT;
-- booster_since: 부스트를 시작한 시각(디스코드 premium_since). 봇이 빼고 보내도 결제일을 잃지 않게 적어 둬요.
ALTER TABLE members ADD COLUMN booster_since TEXT;
