#!/usr/bin/env bash
# 도감 웹 DB 백업: 서버에 7일치, BACKUP_PAR_URL 이 있으면 Oracle 오브젝트 스토리지에도 올려요.
set -euo pipefail
umask 077
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$HOME/.config/hariboweb.env"
# 비밀값 파일을 셸로 실행하지 않고, 필요한 두 값만 글자 그대로 읽어요(systemd 와 같은 방식)
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
DB_PATH="$(env_value DB_PATH)"
BACKUP_PAR_URL="$(env_value BACKUP_PAR_URL || true)"
[ -n "$DB_PATH" ] || { echo "$(date -Is) DB_PATH 없음"; exit 1; }
# 상대 경로는 서비스처럼 저장소 폴더 기준
case "$DB_PATH" in /*) ;; *) DB_PATH="$APP_DIR/$DB_PATH" ;; esac
DIR="$(dirname "$DB_PATH")/backups"
mkdir -p "$DIR" && chmod 700 "$DIR"
# 새벽 자동 백업과 수동/배포 전 백업이 겹치지 않게 한 번에 하나만
exec 9>"$DIR/.lock"
flock -w 600 9 || { echo "$(date -Is) 다른 백업이 너무 오래 걸려 건너뜀"; exit 1; }
[ -f "$DB_PATH" ] || { echo "$(date -Is) DB 파일 없음, 건너뜀"; exit 0; }
NAME="dogam-$(date -u +%Y%m%d-%H%M%S)-$$.sqlite"
TMP="$DIR/.tmp-$NAME"
trap 'rm -f "$TMP"' EXIT
# 서비스가 켜져 있어도 안전한 SQLite 온라인 백업
sqlite3 "$DB_PATH" ".backup '$TMP'"
sqlite3 "$TMP" 'PRAGMA integrity_check' | grep -qx ok
gzip -c "$TMP" > "$DIR/$NAME.gz"
chmod 600 "$DIR"/dogam-*.sqlite.gz
find "$DIR" -name 'dogam-*.sqlite.gz' -mtime +7 -delete
if [ -n "$BACKUP_PAR_URL" ]; then
  curl -fsS -X PUT --data-binary "@$DIR/$NAME.gz" "${BACKUP_PAR_URL%/}/$NAME.gz" >/dev/null
  echo "$(date -Is) 백업 $NAME.gz (서버 + Oracle 보관함)"
else
  echo "$(date -Is) 백업 $NAME.gz (서버만, BACKUP_PAR_URL 없음)"
fi
