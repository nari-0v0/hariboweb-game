# 봇 겜블장 젤리 → 웹 젤칩 옮기기 (2026-11-21)

나리 결정(2026-11-16): 디스코드 봇 겜블장 **지갑 젤리만** 웹 겜블장 젤칩으로 **1:1**로 옮겨요.
예금·적금·주식·알바 금액은 옮기지 않아요(서버 공지에 적혀 있음). 도감 젤리와는 상관없어요.
갚지 않은 대출이 있으면 지갑 젤리에서 먼저 빼고, 0보다 작으면 0으로 해요(계획 문서 #142).
2026-11-16 기준 대출이 남은 사람은 1명(124젤리)이에요.
웹 겜블장은 이미 잠겨 있어요(`src/gamble.ts`의 `GAMBLE_LOCKED = true`). 옮기기를 확인한 뒤에 열어요.

나리가 "해줘"라고 할 때만, 이 순서로 해요.

0. **멈추기 전 확인**(읽기 전용): 웹 `SELECT COUNT(*) FROM purchases WHERE refund = 'pending'`이 0인지 봐요
   (0이 아니면 봇이 겜블 젤리로 돌려주기 전에 꺼지는 거라, 몇 분 기다렸다 다시 봐요).
   봇 DB에 진행 중인 게임 판(`record_type = 'pending_game'`)이 없는지도 봐요(2026-11-16에는 0건).
1. **봇 겜블장 멈추기**: 봇 저장소 `core/gamble_retirement.py`의 `GAMBLE_RETIRED`를 `True`로 바꾸는 PR을 합치고,
   `bot-ops` 작업(restart)으로 pull + 재시작해요. 재시작할 때 통화 보상이 마지막으로 지갑에 들어가니까,
   지갑은 꼭 재시작 **뒤에** 읽어요. 이제 지갑 젤리가 더 바뀌지 않아요.
   옛 겜블 버튼을 누르면 "문을 닫았어요" 안내가 떠요(봇 `cogs/gamble_closed`). 겜블 채널·패널은 나리가 원할 때 지우면 돼요.
2. **지갑 읽기**(읽기 전용): 봇 DB에서 본 서버(guild 1261363193519935550)의 지갑만 읽어요.
   ```sql
   SELECT SUBSTR(record_key, 6) AS user_id,
          GREATEST(0, NVL(JSON_VALUE(payload, '$.jelly' RETURNING NUMBER), 0)
                    - NVL(JSON_VALUE(payload, '$.bank.loan' RETURNING NUMBER), 0)) AS jelly
   FROM HARI_STAGE_APP.gamble_records
   WHERE guild_id = 1261363193519935550 AND record_type = 'acct'
   ```
   (봇이 예전 저장 방식(LEGACY)일 때 기준이에요. 새 원장(PRIMARY)으로 바뀌었으면 이 표 대신 새 원장을 읽어야 해요.)
   결과를 `wallets.json`(`[{"user_id": "...", "jelly": 123}, ...]`)으로 저장해요.
3. **SQL 만들기**: `node scripts/gamble-jelly-moves.mjs wallets.json > gamble-jelly-moves.sql`
4. **웹 DB에 넣기**(배포 스레드): 마이그레이션 0042가 먼저 적용돼 있어야 해요. D1 Time Travel 북마크를 먼저 남겨요.
   먼저 겜블장을 처음부터 시작하게 지우고(나리 2026-11-16: 다 초기화), 그다음 젤칩을 넣어요.
   `npx wrangler d1 execute haribo-dogam --remote --file scripts/gamble-reset.sql`
   `npx wrangler d1 execute haribo-dogam --remote --file gamble-jelly-moves.sql`
   (초기화는 젤리를 옮긴 뒤에 다시 실행해도 아무것도 지우지 않아요.)
5. **확인**: `SELECT COUNT(*), SUM(jelly) FROM gamble_jelly_moves WHERE moved_at IS NOT NULL`
   웹에 없어서 못 받은 사람은 `WHERE moved_at IS NULL`로 보고해요.
6. **웹 겜블장 열기**: 숫자가 맞으면 `GAMBLE_LOCKED`를 `false`로 바꾸는 한 줄 PR → 배포.

- 두 번 실행해도 젤칩은 한 번만 들어가요(`moved_at`이 채워질 때 트리거가 한 번만 더해요).
- 지금 웹 도감에 있는 멤버만 받아요. 떠난 사람 몫은 표에만 남고 넣지 않아요.
- 시작하면 모두 0에서 출발하고, 겜블장에 처음 들어올 때 기본 젤칩 1000개(오늘의 젤칩)가 들어와요. 그래서 각자 **기본 1000 + 옮긴 젤칩**이에요.
  판 기록·순위·시즌 1등·겜블 칭호(테스터가 시험한 것 포함)는 모두 지워져요.
- 타짜 칭호는 5만 젤칩부터예요(나리 2026-11-16, 예전 1만). 2026-11-16 기준 가장 많이 옮기는 사람이 11,380이라 시작하자마자 받는 사람은 없어요.
- 알림은 보내지 않아요.
- 하루 전에 같은 쿼리로 미리 숫자(사람 수, 합계, 웹에 없는 사람)를 확인해 둬요.
