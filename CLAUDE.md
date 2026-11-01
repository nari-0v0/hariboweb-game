# CLAUDE.md — 하리보 멤버 도감 (웹)

Claude가 이 저장소에서 일할 때 먼저 읽는 안내서입니다.

## 프로젝트 한눈에 보기

- 하리보 디스코드 서버 멤버만 들어오는 웹 도감입니다. 같이 통화하고 내전할수록 서로의 카드 경험치가 오릅니다.
- Cloudflare Workers + D1(SQLite) + Hono JSX, TypeScript. 진입점은 `src/index.tsx`, 화면은 `src/views/`.
- 주요 파일: `src/discord.ts`(로그인·서버 멤버 확인), `src/sync.ts`(봇 동기화 API), `src/levels.ts`(레벨·꾸미기 단계), `src/themes.ts`(카드 테마), `src/character.ts`·`src/characters.ts`(멤버별 캐릭터 배정), `src/db.ts`.
- DB 표 변경은 `migrations/NNNN_<이름>.sql`로 다음 번호를 추가합니다. 이미 배포된 마이그레이션 파일은 고치지 않습니다.
- 봇(haribo-bot3)이 보내는 데이터 형식은 `docs/bot-sync.md`가 기준입니다. 형식을 바꾸면 이 문서와 봇 쪽도 같이 바꿉니다.

## 검사 방법 (PR 올리기 전에 꼭 실행)

```bash
npm ci
npm run typecheck
npm test
```

- 같은 검사가 PR마다 GitHub Actions(`.github/workflows/checks.yml`)로 자동 실행됩니다.
- 화면을 바꾸면 로컬(`npm run dev`, `DEV_LOGIN=1`)에서 데스크톱과 휴대폰 너비 둘 다 확인합니다. 가로 스크롤이 생기면 안 됩니다.

## 배포

- 배포와 Cloudflare·디스코드 설정은 README의 "처음 배포하기" 순서를 따릅니다. Cloudflare 로그인과 비밀 값 입력은 나리가 직접 합니다.
- 비밀 값(`DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `BOT_SYNC_SECRET`)은 `wrangler secret`으로만 넣습니다. `.dev.vars`나 실제 값을 커밋하지 마세요.
- `DEV_LOGIN`은 로컬 전용입니다. 배포 설정에 넣지 마세요.

## 꼭 지킬 디자인·기획 결정

- 카드 = 멤버. 함께한 활동은 두 사람 카드 모두에, 혼자 활동은 자기 카드에 경험치가 쌓입니다. 포인트 제도는 없고 화폐는 젤리 하나입니다.
- 캐릭터 그림은 나리가 AI로 만든 픽셀 캐릭터 시트(`assets/characters/` + `sheets.json`)를 `scripts/build_characters.py`로 잘라 씁니다. 멤버마다 서로 다른 디자인이어야 하고, 색만 바꾼 변형은 디자인이 모자랄 때 임시로만 씁니다.
- 거절된 방식은 다시 제안하지 않습니다: 코드로 만드는 아바타 라이브러리(DiceBear 등), LPC 스프라이트, Claude가 직접 그린 캐릭터, 사탕색 그라데이션 UI, 어두운 세리프 UI.
- 화면 스타일: 파스텔 하늘색 UI, 픽셀 테두리 CSS 카드, 갈무리(Galmuri) 글꼴.
- 떠난 멤버: 본인 데이터는 지우고, 다른 사람 도감 속 카드는 "떠난 멤버"로 흐리게 남깁니다. 완성도는 지금 있는 멤버만 셉니다.
- 운영자 피로 줄이기: 관리자 승인이나 수동 확인 단계는 넣지 않습니다.

## 작업 방식

- 운영자 나리는 한국어를 쓰고 개발자가 아닙니다. 설명은 쉬운 한국어로 짧게 해주세요.
- 흐름: Claude가 만들고 PR을 올림 → ChatGPT Codex가 PR 리뷰 → Claude가 리뷰 반영 → 나리가 합치라고 하면 합침.
- Codex 리뷰는 확인할 주장으로 다룹니다. 맞으면 고치고, 틀리면 이유를 PR 댓글로 남깁니다.

## 아레나 스킬

- `.claude/skills/arena`에 `/arena` 스킬이 있습니다. 사용량이 아주 많이 드므로, 나리가 따로 말하지 않으면 `--quick`(16명)으로 돌립니다.
