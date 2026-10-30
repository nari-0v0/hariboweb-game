# 하리보 멤버 도감 (웹)

하리보 디스코드 서버 멤버만 들어오는 웹 도감이에요. 같이 통화하고 내전할수록 서로의 카드가 자라요.
Cloudflare Workers + D1로 돌아가요.

## 1단계에 들어 있는 것

- 디스코드 로그인 (하리보 서버 멤버인지 확인)
- 내 카드: 한 줄 소개, 테마 (상점이 생기기 전까지는 기본 테마만)
- 도감: 같이 논 멤버 카드, 아직 못 만난 멤버는 실루엣, 떠난 멤버는 흐리게
- 친구 도감 구경, 카드 상세 (처음 만난 날, 함께한 시간, 내전 횟수)
- 레벨 꾸미기: Lv.5 은테, Lv.10 금테, Lv.20 반짝이, Lv.30 홀로그램, Lv.50 전설
- 봇이 경험치를 보내는 통로: [docs/bot-sync.md](docs/bot-sync.md)

## 처음 배포하기

1. Cloudflare에 로그인: `npx wrangler login`
2. DB 만들기: `npx wrangler d1 create haribo-dogam` → 나온 `database_id`를 `wrangler.jsonc`에 넣어요.
3. DB 표 만들기: `npm run db:migrate:remote`
4. `wrangler.jsonc`의 `vars` 채우기: `DISCORD_CLIENT_ID`, `GUILD_ID`, `PUBLIC_URL`
5. 비밀 값 넣기 (각각 물어보면 붙여 넣어요)
   ```
   npx wrangler secret put DISCORD_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET     # 아무 긴 무작위 문자열
   npx wrangler secret put BOT_SYNC_SECRET    # 봇 .env에도 같은 값
   ```
6. 디스코드 개발자 포털 → 애플리케이션 → OAuth2 → Redirects에 `{PUBLIC_URL}/auth/callback` 추가
7. 배포: `npm run deploy`

## 로컬에서 실행

```
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

`DEV_LOGIN=1`이면 첫 화면의 개발용 로그인으로 디스코드 없이 들어갈 수 있어요. 배포 환경에는 넣지 마세요.

## 확인

```
npm run typecheck
npm test
```
