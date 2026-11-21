# 버닝타임 켜고 끄기

나리가 "버닝타임 시작해줘"(또는 "끝내줘")라고 하면 Claude가 운영 D1에 아래 SQL을 한 번 실행해요. 저절로 켜지지 않아요.
길이를 따로 말하지 않으면 2시간이에요. 웹 화면과 봇은 늦어도 1분 안에 알아채요.

```bash
# 시작(지금부터 2시간). 1시간이면 '+2 hours'를 '+1 hours'로
npx wrangler d1 execute haribo-dogam --remote --command \
  "UPDATE burning SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), until = strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 hours') WHERE id = 1"

# 지금 바로 끝내기
npx wrangler d1 execute haribo-dogam --remote --command \
  "UPDATE burning SET until = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1"

# 확인
npx wrangler d1 execute haribo-dogam --remote --command "SELECT * FROM burning"
```

- 켜져 있는 동안: 짝 카드 통화 경험치 1.5배(하루 한도 180 → 270, 봇이 세요), 원정대 재료 확률 1.5배(대장 제외),
  깬 장 다시 돌아도 젤코인 최소 50%, 사건파일 힌트 동전 하나 찾으면 2개, 빙고 통화 시간 2배. 겜블장은 그대로.
- 끝낼 때 `until`만 지금으로 바꾸고 `started_at`은 남겨 둬요(늦게 오는 봇 기록을 그 기간으로 세요).
