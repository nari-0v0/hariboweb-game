# 웹을 봇 서버(Oracle)에 설치하기

웹을 Cloudflare 유료 요금제 없이 돌리려고, 웹 본체를 봇이 도는 Oracle 서버로 옮깁니다.
주소(`https://hariboweb-game.haribobot.workers.dev`)와 디스코드 로그인 설정은 그대로입니다.
Cloudflare 워커는 그림·파일만 직접 주고, 나머지는 서버로 넘기는 "문지기"가 됩니다(자세한 구조는 `docs/node-server.md`).

설치를 해도 **옮기는 날 전까지는 아무것도 바뀌지 않아요.** 웹 서비스는 꺼진 채로 준비만 됩니다.

## 1. 서버에서 한 번 실행 (나리)

봇 서버에 접속해서 아래를 그대로 붙여 넣습니다.

```bash
cd ~ && git clone https://github.com/nari-0v0/hariboweb-game.git hariboweb 2>/dev/null; cd ~/hariboweb && git pull && bash deploy/setup-server.sh
```

(관리자 권한이 필요한 단계는 스크립트가 알아서 sudo로 실행해요. `sudo bash`로 실행하지 마세요.)

하는 일:

1. Node 22를 `/opt/node22`에 따로 설치 (봇과 기존 Node 20은 건드리지 않음)
2. 웹 빌드, 비밀값 파일 `~/.config/hariboweb.env` 만들기 (봇의 동기화 비밀값은 봇 `.env`에서 복사)
3. `hariboweb` 서비스 등록 (아직 켜지 않고, 재부팅해도 저절로 켜지지 않음. 메모리 1GB 상한)
4. Caddy로 HTTPS 주소(`<서버IP>.sslip.io`) 준비, 포트 80/443 열기
5. 매일 새벽 4시 DB 백업 (서버 안 7일치 + 설정하면 Oracle 저장소로도)
6. GitHub Actions 전용 열쇠 (배포·켜기·상태·로그·백업만 가능)

끝나면 화면에 할 일이 출력됩니다.

## 2. Oracle 화면에서 포트 열기 (나리)

인스턴스 > 서브넷 > 보안 목록 > 수신 규칙 추가: 소스 `0.0.0.0/0`, TCP, 포트 `80`과 `443`.

## 3. GitHub 비밀값 넣기 (나리)

hariboweb-game 저장소 > Settings > Secrets and variables > Actions 에
설치 화면에 나온 `WEB_SSH_HOST`, `WEB_SSH_USER`, `WEB_SSH_HOST_KEY`, `WEB_SSH_KEY` 4개를 넣습니다.
그다음부터 Claude가 Actions의 **server-ops**로 배포·상태 확인을 할 수 있어요.

## 4. 직접 넣어야 하는 값

`~/.config/hariboweb.env` 에서 비어 있는 값:

- `DISCORD_CLIENT_SECRET`: 디스코드 개발자 화면의 앱 > OAuth2 > Client Secret. Cloudflare에서는 다시 읽을 수 없어서 직접 넣어야 해요.
- `CF_ACCOUNT_ID`, `CF_AI_TOKEN`: AI 검토(칭찬 한마디, 같이 배정되지 않기)를 서버에서도 쓰려면 Workers AI 권한이 있는 Cloudflare 토큰. 비워 두면 AI 검토만 "AI 답 없음"으로 넘어가요.
- `BACKUP_PAR_URL`: Oracle Object Storage 버킷의 "미리 인증된 요청(쓰기 전용)" 주소. 넣으면 매일 백업이 서버 밖에도 저장돼요.

비밀값은 이 파일에만 두고 저장소에 올리지 않습니다.

## 5. 옮기는 날 (나리 OK 후 Claude가 안내)

`docs/node-server.md`의 순서대로: 점검 켜기 → D1 내보내기 → 서버로 가져오기 → 서비스 켜기(server-ops `start`) → 워커에 `ORIGIN_URL`/`ORIGIN_SECRET` 넣기 → 점검 끄기.
새 `SESSION_SECRET`을 쓰므로 멤버는 한 번 다시 로그인합니다.
되돌리기: 워커에서 `ORIGIN_URL`만 지우면 바로 예전(Cloudflare D1)으로 돌아가요. 단 옮긴 뒤 쌓인 기록은 서버 DB에만 있어요.

서버가 멈추면 워커가 "오류가 생겼어요!" 화면을 대신 보여 줍니다.
