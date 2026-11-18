-- 한마디 검사 중 자정을 넘으면 하루 한도 날짜(day)와 저장 시각(created_at)이 달라져요.
-- 빙고·시즌은 day로 거르지 않고 저장 시각만으로 세므로, 시각 조회용 색인을 더해요.
CREATE INDEX praises_created_at ON praises(created_at);
