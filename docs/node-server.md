# Oracle 서버에서 Node로 실행하기

지금 사이트는 기본적으로 예전과 똑같이 Cloudflare Worker에서 전부 실행됩니다. 이 문서는 나중에 무거운 화면만 Oracle 서버로 옮길 때 쓰는 준비 안내입니다. `ORIGIN_URL`을 설정하지 않으면 문지기 모드는 켜지지 않습니다.

## 준비

- Ubuntu 22.04 ARM(aarch64)
- Node.js 22 LTS 최신판 (`node:sqlite`가 들어 있는 버전)
- D1을 옮길 때만 `sqlite3` 명령
- 저장소의 `public/`과 `migrations/` 폴더

저장소에서 설치하고 Node용 한 파일을 만듭니다.

```sh
npm ci
npm run build:node
```

결과는 `dist/server.mjs`입니다. 서버는 시작할 때 `migrations/`를 확인해서 아직 적용하지 않은 파일만 번호 순서대로 적용합니다.

## 환경변수

앱을 실제로 쓰려면 다음 값을 설정합니다.

| 이름 | 설명 |
| --- | --- |
| `DISCORD_CLIENT_ID` | 디스코드 애플리케이션 ID |
| `DISCORD_CLIENT_SECRET` | 디스코드 로그인 비밀 값 |
| `GUILD_ID` | 하리보 디스코드 서버 ID |
| `PUBLIC_URL` | 이용자가 접속하는 공개 HTTPS 주소 |
| `GAMBLE_TESTERS` | 잠긴 겜블장을 시험할 디스코드 ID 목록(선택) |
| `SESSION_SECRET` | 로그인 쿠키 서명용 긴 무작위 값 |
| `BOT_SYNC_SECRET` | 하리보봇 동기화 비밀 값 |
| `GAME_PROGRESS_TOKEN` | 운영 통계 API 토큰(선택) |
| `SCRIM_QUESTS` | 내전 퀘스트를 켤 때만 `1`(선택) |
| `ORIGIN_SECRET` | Cloudflare 문지기와 Node 서버 사이의 긴 무작위 값. 설정하면 이 값이 맞는 요청만 받음 |
| `DB_PATH` | SQLite 파일. 기본값은 `./data/dogam.sqlite` |
| `HOST` | 들을 주소. 기본값은 `127.0.0.1` |
| `PORT` | 들을 포트. 기본값은 `8787` |
| `CF_ACCOUNT_ID` | Workers AI를 Node에서도 쓸 때의 Cloudflare 계정 ID(선택) |
| `CF_AI_TOKEN` | Workers AI 호출 권한만 가진 토큰(선택) |

비밀 값은 저장소나 `.dev.vars`에 넣지 말고 서버의 비밀 환경 파일이나 서비스 관리자에 보관합니다. `CF_ACCOUNT_ID`와 `CF_AI_TOKEN` 중 하나라도 없으면 AI 호출은 하지 않고 기존 규칙 검사만 사용합니다.

## D1 데이터를 SQLite로 옮기기

운영 전환은 꼭 이 순서로 합니다. 순서를 바꾸면 내보낸 뒤에 들어온 기록(봇 활동, 상점 결제)이 사라집니다.

1. Worker 설정에 `MAINTENANCE`를 켭니다. 모든 화면이 점검 중이 되고, 봇 동기화는 503을 받아 나중에 다시 보냅니다.
2. 1~2분 기다려 진행 중이던 쓰기가 끝나게 합니다.
3. 아래처럼 D1을 내보내고 SQLite로 가져옵니다.
4. Node 서버를 켜서(새 마이그레이션 적용) 문지기 비밀로 화면이 열리는지 확인합니다.
5. Worker에 `ORIGIN_URL`·`ORIGIN_SECRET`을 넣습니다.
6. 마지막으로 `MAINTENANCE`를 끕니다.

운영 전환 직전에 D1을 SQL로 내보냅니다.

```sh
npx wrangler d1 export haribo-dogam --remote --output=dump.sql
sqlite3 dogam.sqlite < dump.sql
```

이 파일을 그대로 쓸 때는 `DB_PATH=./dogam.sqlite`로 설정합니다. 기본 경로를 쓰고 싶으면 `data/dogam.sqlite`에 가져와도 됩니다. D1이 쓰는 `d1_migrations` 표도 같은 이름과 열로 이어서 사용합니다. 가져온 뒤 Node 서버가 시작되면 새로 추가된 마이그레이션만 적용합니다. 이번 변경만으로는 운영 D1이나 Worker 설정이 바뀌지 않습니다.

## 실행

환경변수를 준비한 다음 저장소 루트에서 실행합니다.

```sh
npm run start:node
```

기본 주소는 `http://127.0.0.1:8787`입니다. 외부에 포트를 바로 열기보다 Cloudflare Tunnel이나 서버의 HTTPS 프록시를 사용합니다. `ORIGIN_SECRET`을 설정했다면 직접 접속한 요청은 403이 정상입니다.

나중에 실제 전환할 때만 Worker에 `ORIGIN_URL`과 같은 `ORIGIN_SECRET`을 설정합니다. 그러면 `/char/`, `/case/`, `/journey/` 그림은 Worker가 계속 보호하고, 나머지 요청만 Node 서버로 전달합니다. 전환 전에는 `ORIGIN_URL`을 비워 두면 기존 `wrangler deploy` 동작이 그대로 유지됩니다.
