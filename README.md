# 하리보 멤버 도감 (웹)

하리보 디스코드 서버 멤버만 들어오는 웹 도감이에요. 같이 통화하고 내전할수록 서로의 카드가 자라요.
Cloudflare Workers + D1로 돌아가요.

## 들어 있는 것

- 디스코드 로그인 (하리보 서버 멤버인지 확인), 처음 들어오면 여자·남자 캐릭터 고르기
- 내 카드와 도감: 같이 논 멤버 카드가 모이고, 아직 못 만난 멤버는 실루엣, 떠난 멤버는 흐리게 보여요. 칭찬함도 내 카드에 있어요.
- 카드 레벨(최대 100)과 카드 모습: 10레벨마다 색이 바뀌고(분홍 → 은색 → 금색 … → 루비 → 전설), 10 은테, 20 금테, 50 반짝이, 70 광택이 얹혀요(`src/levels.ts`)
- 하리보 빙고(3×3, 가운데는 팀 퀘스트), 서버 퀘스트(초록하리보 납치 대소동!), 같이 배정되지 않기 신청
- 상점(도감 젤리): 테마, 꾸밈 캐릭터, 성별 바꾸기, 벌점·경고 지우기, 닉네임 변경권, 칭호
- 광장(통화방 지도), 원정대(`/expedition/go`), 사건파일(`/cases/room`), 겜블장(젤칩)
- 멤버 캐릭터: 나리님이 준 캐릭터 그림(`assets/characters/`, 목록은 `sheets.json`)에서 한 명씩 잘라낸 그림이에요. 기본 캐릭터 100종(`public/char/`)은 서버 안에서 겹치지 않게 멤버마다 자동으로 정해 주고, 멤버가 100명보다 많으면 옷 색만 바꾼 여분을 잠깐 줘요(새 그림을 넣으면 새 디자인으로 옮겨 가요). 꾸밈 캐릭터 101종(`public/char/deco/`)은 상점에서 젤리로 사거나, 판타지 캐릭터는 도감 카드를 모으면 열려요. 그림을 넣는 법: png를 `assets/characters/basic` 또는 `deco`에 두고 `sheets.json`에 이름을 적은 뒤 `python3 scripts/build_characters.py`(numpy, scipy, Pillow 필요).
- 글꼴: 갈무리(Galmuri, SIL OFL 1.1) `public/fonts/`
- 봇과 주고받는 형식: [docs/bot-sync.md](docs/bot-sync.md)
- 사용자용 설명은 웹 `/guide`(사용설명서)에 있어요.

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
