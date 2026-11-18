#!/usr/bin/env bash
# GitHub Actions "server-ops" 가 서버에 접속하면 이 파일만 실행돼요(authorized_keys 의 command= 로 묶임).
# deploy(최신 코드 받고 빌드 후 재시작) / status / logs / backup
set -uo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE=/opt/node22/bin
REQUEST="${SSH_ORIGINAL_COMMAND:-${1:-}}"
logs() { sudo -n /usr/bin/journalctl -u hariboweb -n "$1" --no-pager -o short-iso 2>&1 | sed -E 's/(SECRET|TOKEN|secret|token)[^ ]*/\1=***/g'; }
case "$REQUEST" in
  deploy)
    cd "$APP_DIR" || exit 1
    echo "== 지금: $(git log -1 --format='%h %s')"
    git pull --ff-only || { echo "== git pull 실패"; exit 1; }
    echo "== 받은: $(git log -1 --format='%h %s')"
    PATH="$NODE:$PATH" npm ci --no-audit --no-fund --silent || { echo "== npm ci 실패"; exit 1; }
    PATH="$NODE:$PATH" npm run build:node --silent || { echo "== 빌드 실패: 재시작 안 함"; exit 1; }
    if ! systemctl is-active --quiet hariboweb; then
      echo "== 빌드만 했어요. 웹 서비스는 아직 꺼져 있어요(옮기는 날 켜요)"; exit 0
    fi
    "$APP_DIR/deploy/backup.sh" || echo "== (배포 전 백업 실패, 계속)"
    sudo -n /usr/bin/systemctl restart hariboweb || exit 1
    sleep 5
    if systemctl is-active --quiet hariboweb && curl -fsS -o /dev/null -H "X-Origin-Secret: $(grep '^ORIGIN_SECRET=' "$HOME/.config/hariboweb.env" | cut -d= -f2-)" http://127.0.0.1:8787/; then
      echo "== 웹이 켜졌어요"; logs 20
    else
      echo "== 웹이 안 켜졌어요"; logs 100; exit 1
    fi ;;
  status)
    cd "$APP_DIR" && echo "== 코드: $(git log -1 --format='%h %s')"
    systemctl status hariboweb --no-pager 2>&1 | head -12
    ls -lh "$HOME/hariboweb-data" "$HOME/hariboweb-data/backups" 2>/dev/null | tail -12 ;;
  logs) logs 300 ;;
  backup) "$APP_DIR/deploy/backup.sh" ;;
  *) echo "허용되지 않은 명령이에요 (deploy, status, logs, backup)"; exit 2 ;;
esac
