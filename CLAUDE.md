# hariboweb-game

하리보 멤버 도감 웹. Cloudflare Workers + D1 + Hono(JSX). 주인은 나리님(코드에 익숙하지 않아요, 한국어로 쉽게 설명).

## 명령
- `npm ci` (`.npmrc`에 legacy-peer-deps)
- `npm run typecheck`, `npm test` — PR 전에 둘 다 통과해야 해요 (GitHub Actions도 같은 걸 돌려요)
- `npm run dev` — 로컬 서버(:8787). `.dev.vars`에 `DEV_LOGIN=1`이면 `/auth/dev?id=..&name=..`로 로그인 없이 들어가요
- `npm run db:migrate:local` / `db:migrate:remote` — D1 표 만들기

## 구조
- `src/index.tsx` 라우트, `src/db.ts` D1 쿼리, `src/views/` 화면(JSX), `public/` 정적 파일(styles.css, app.js, 글꼴, 캐릭터)
- `migrations/` D1 표. 이미 배포된 마이그레이션은 고치지 말고 새 파일을 추가해요
- `POST /api/bot/sync` — haribo-bot3가 멤버와 경험치를 보내요. 형식은 `docs/bot-sync.md`. 같은 batch_id는 한 번만 반영
- 레벨: 누적 XP = 30·(L−1)², 최대 50 (`src/levels.ts`)

## 캐릭터 그림
- 원본은 `assets/characters/{basic,deco}/*.png`, 이름 목록은 `assets/characters/sheets.json`
- `python3 scripts/build_characters.py`(numpy, scipy, Pillow)가 잘라서 `public/char/`와 `src/characters.ts`를 만들어요. 생성 파일은 직접 고치지 마세요
- 기본 캐릭터는 멤버마다 서로 다르게 자동 배정(`profiles.character_id`). 이미 있는 id는 바꾸지 마세요
- 나리님은 색만 바꾼 캐릭터, 코드로 그린 캐릭터, 아바타 라이브러리를 싫어해요. 그림은 나리님이 AI로 만들어 줘요

## 규칙
- 비밀 값(Discord client secret, BOT_SYNC_SECRET, Cloudflare 토큰)은 커밋하지 않아요. 로컬은 `.dev.vars`(gitignore), 배포는 `wrangler secret`
- 화면은 휴대폰 너비에서 가로 스크롤이 없어야 해요
- 외부 CDN 대신 직접 호스팅(글꼴 포함)
