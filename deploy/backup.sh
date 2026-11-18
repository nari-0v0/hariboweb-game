#!/usr/bin/env bash
# 도감 웹 DB 백업: 서버에 7일치, BACKUP_PAR_URL 이 있으면 Oracle 오브젝트 스토리지에도 올려요.
set -euo pipefail
set -a; . "$HOME/.config/hariboweb.env"; set +a
DIR="$(dirname "$DB_PATH")/backups"
mkdir -p "$DIR"
[ -f "$DB_PATH" ] || { echo "$(date -Is) DB 파일 없음, 건너뜀"; exit 0; }
NAME="dogam-$(date -u +%Y%m%d-%H%M).sqlite"
# 서비스가 켜져 있어도 안전한 SQLite 온라인 백업
sqlite3 "$DB_PATH" ".backup '$DIR/$NAME'"
sqlite3 "$DIR/$NAME" 'PRAGMA integrity_check' | grep -qx ok
gzip -f "$DIR/$NAME"
find "$DIR" -name 'dogam-*.sqlite.gz' -mtime +7 -delete
if [ -n "${BACKUP_PAR_URL:-}" ]; then
  curl -fsS -X PUT --data-binary "@$DIR/$NAME.gz" "${BACKUP_PAR_URL%/}/$NAME.gz" >/dev/null
  echo "$(date -Is) 백업 $NAME.gz (서버 + Oracle 보관함)"
else
  echo "$(date -Is) 백업 $NAME.gz (서버만, BACKUP_PAR_URL 없음)"
fi
