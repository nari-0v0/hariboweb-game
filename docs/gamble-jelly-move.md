# 봇 겜블장 젤리 → 웹 젤칩 옮기기 (2026-11-21)

나리 결정(2026-11-16): 디스코드 봇 겜블장 **지갑 젤리만** 웹 겜블장 젤칩으로 **1:1**로 옮겨요.
예금·적금·주식·알바 금액은 옮기지 않아요(서버 공지에 적혀 있음). 도감 젤리와는 상관없어요.

나리가 "해줘"라고 할 때만, 이 순서로 해요.

1. **봇 겜블장 멈추기**: 봇 저장소 `core/gamble_retirement.py`의 `GAMBLE_RETIRED`를 `True`로 바꾸는 PR을 합치고,
   나리가 서버에서 `git pull` 후 `sudo systemctl restart bot3`. 이제 지갑 젤리가 더 바뀌지 않아요.
2. **지갑 읽기**(읽기 전용): 봇 DB에서 본 서버(guild 1261363193519935550)의 지갑만 읽어요.
   ```sql
   SELECT SUBSTR(record_key, 6) AS user_id, JSON_VALUE(payload, '$.jelly' RETURNING NUMBER) AS jelly
   FROM HARI_STAGE_APP.gamble_records
   WHERE guild_id = 1261363193519935550 AND record_type = 'acct'
   ```
   결과를 `wallets.json`(`[{"user_id": "...", "jelly": 123}, ...]`)으로 저장해요.
3. **SQL 만들기**: `node scripts/gamble-jelly-moves.mjs wallets.json > gamble-jelly-moves.sql`
4. **웹 DB에 넣기**(배포 스레드): 마이그레이션 0042가 먼저 적용돼 있어야 해요.
   `npx wrangler d1 execute haribo-dogam --remote --file gamble-jelly-moves.sql`
5. **확인**: `SELECT COUNT(*), SUM(jelly) FROM gamble_jelly_moves WHERE moved_at IS NOT NULL`

- 두 번 실행해도 젤칩은 한 번만 들어가요(`moved_at`이 채워질 때 트리거가 한 번만 더해요).
- 지금 웹 도감에 있는 멤버만 받아요. 떠난 사람 몫은 표에만 남고 넣지 않아요.
- 겜블 순위(딴 젤칩 `won`)는 바뀌지 않아요. 잔액(`chips`)만 늘어요.
- 알림은 보내지 않아요.
