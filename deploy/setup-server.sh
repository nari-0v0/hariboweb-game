#!/usr/bin/env bash
# 도감 웹을 봇 서버(Oracle, Ubuntu ARM)에서 돌리기 위한 1회 설정. 나리가 서버에서 한 번 실행해요.
#   git clone https://github.com/nari-0v0/hariboweb-game ~/hariboweb   (처음 한 번)
#   cd ~/hariboweb && bash deploy/setup-server.sh
#
# 하는 일 (봇 bot3 는 건드리지 않아요)
# 1. Node 22 를 /opt/node22 에 따로 설치(봇이나 다른 프로그램이 쓰는 기존 node 는 그대로)
# 2. 웹 빌드, 비밀값 파일(~/.config/hariboweb.env, 나만 읽기) 만들기
# 3. systemd 서비스 hariboweb (서버가 켜지면 자동 시작, 죽으면 자동 재시작)
# 4. Caddy(HTTPS 문지기 앞단, <IP>.sslip.io 주소로 무료 인증서) + 80/443 포트 열기
# 5. 매일 새벽 4시 DB 백업(서버 7일치 + Oracle 오브젝트 스토리지 주소가 있으면 거기도)
# 6. GitHub Actions "server-ops" 전용 열쇠(배포·상태·로그·백업만 가능)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ME="$(whoami)"
NODE_DIR=/opt/node22
NODE_VERSION="${NODE_VERSION:-v22.21.1}"
ENV_FILE="$HOME/.config/hariboweb.env"
DATA_DIR="$HOME/hariboweb-data"
KEY="$HOME/.ssh/hariboweb_github_ops"
OPS="$APP_DIR/deploy/remote-ops.sh"

echo "== 1. Node 22 설치 ($NODE_DIR)"
if [ ! -x "$NODE_DIR/bin/node" ] || ! "$NODE_DIR/bin/node" --version | grep -q '^v22\.'; then
  ARCH="$(uname -m)"; case "$ARCH" in aarch64) NA=arm64 ;; x86_64) NA=x64 ;; *) echo "모르는 CPU: $ARCH"; exit 1 ;; esac
  TMP="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$NA.tar.xz" -o "$TMP/node.tar.xz"
  sudo mkdir -p "$NODE_DIR" && sudo tar -xJf "$TMP/node.tar.xz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$TMP"
fi
"$NODE_DIR/bin/node" --version
command -v sqlite3 >/dev/null || sudo apt-get install -y sqlite3

echo "== 2. 빌드와 비밀값 파일"
cd "$APP_DIR"
PATH="$NODE_DIR/bin:$PATH" npm ci --no-audit --no-fund
PATH="$NODE_DIR/bin:$PATH" npm run build:node
mkdir -p "$DATA_DIR/backups" "$(dirname "$ENV_FILE")"
PUBLIC_IP="$(curl -fsS https://api.ipify.org)"
ORIGIN_HOST="$(echo "$PUBLIC_IP" | tr . -).sslip.io"
if [ ! -f "$ENV_FILE" ]; then
  # 봇 .env 에 이미 있는 동기화 비밀값은 그대로 가져와요(웹 BOT_SYNC_SECRET = 봇 DOGAM_SYNC_SECRET)
  SYNC="$(grep -E '^DOGAM_SYNC_SECRET=' "$HOME/bot3/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
  umask 077
  cat > "$ENV_FILE" <<ENV
# 도감 웹 비밀값. 이 파일은 나만 읽을 수 있어요. 저장소에 올리지 마세요.
DISCORD_CLIENT_ID=1420027662830669925
DISCORD_CLIENT_SECRET=
GUILD_ID=1261363193519935550
PUBLIC_URL=https://hariboweb-game.haribobot.workers.dev
GAMBLE_TESTERS=323412514224209921
SESSION_SECRET=$(openssl rand -hex 32)
BOT_SYNC_SECRET=$SYNC
ORIGIN_SECRET=$(openssl rand -hex 32)
DB_PATH=$DATA_DIR/dogam.sqlite
HOST=127.0.0.1
PORT=8787
CF_ACCOUNT_ID=
CF_AI_TOKEN=
# 매일 백업을 올릴 Oracle 오브젝트 스토리지 "미리 인증된 요청(PAR)" 주소(쓰기 허용, 끝이 / 로 끝나는 것)
BACKUP_PAR_URL=
ENV
fi
chmod 600 "$ENV_FILE"

echo "== 3. systemd 서비스 hariboweb"
sudo tee /etc/systemd/system/hariboweb.service >/dev/null <<UNIT
[Unit]
Description=Haribo dogam web (Node)
After=network-online.target
Wants=network-online.target

[Service]
User=$ME
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_DIR/bin/node --disable-warning=ExperimentalWarning $APP_DIR/dist/server.mjs
Restart=always
RestartSec=3
MemoryMax=1G

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable hariboweb >/dev/null

echo "== 4. Caddy (HTTPS) + 포트 80/443"
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update && sudo apt-get install -y caddy
fi
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$ORIGIN_HOST {
  encode gzip
  reverse_proxy 127.0.0.1:8787
}
CADDY
# Oracle Ubuntu 이미지는 서버 방화벽(iptables)이 22번만 열어 둬요. 80(인증서 발급)·443(HTTPS)을 열어요.
for P in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $P -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport $P -j ACCEPT
done
command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save >/dev/null || true
sudo systemctl reload caddy || sudo systemctl restart caddy

echo "== 5. 매일 백업 (새벽 4시)"
chmod +x "$APP_DIR/deploy/backup.sh" "$OPS"
( crontab -l 2>/dev/null | grep -v 'hariboweb/deploy/backup.sh' ; echo "0 4 * * * $APP_DIR/deploy/backup.sh >> $DATA_DIR/backups/backup.log 2>&1" ) | crontab -

echo "== 6. GitHub Actions 전용 열쇠"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "github-actions-hariboweb-ops" -f "$KEY"
PUB="$(cat "$KEY.pub")"
touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"
grep -qF "$PUB" "$HOME/.ssh/authorized_keys" || printf 'command="%s",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty %s\n' "$OPS" "$PUB" >> "$HOME/.ssh/authorized_keys"
SUDOERS=/etc/sudoers.d/hariboweb-ops
TMP="$(mktemp)"
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart hariboweb, /usr/bin/systemctl stop hariboweb, /usr/bin/systemctl start hariboweb, /usr/bin/journalctl -u hariboweb *\n' "$ME" > "$TMP"
sudo visudo -cf "$TMP" >/dev/null && sudo install -m 440 -o root -g root "$TMP" "$SUDOERS"; rm -f "$TMP"

echo
echo "================ 여기까지 끝 ================"
echo "아직 웹 서비스는 켜지 않았어요(DB를 옮기는 날 켜요)."
echo
echo "[Oracle 화면에서 할 일] 인스턴스 > 서브넷 > 보안 목록 > 수신 규칙 추가: 0.0.0.0/0, TCP, 포트 80 과 443"
echo
echo "[GitHub hariboweb-game 저장소 > Settings > Secrets and variables > Actions 에 넣을 값]"
echo "WEB_SSH_HOST: $PUBLIC_IP"
echo "WEB_SSH_USER: $ME"
echo "WEB_SSH_HOST_KEY: $(awk '{print $1" "$2}' /etc/ssh/ssh_host_ed25519_key.pub)"
echo "WEB_SSH_KEY: (아래 BEGIN 줄부터 END 줄까지 전부)"
cat "$KEY"
echo
echo "[Cloudflare 워커에 나중에 넣을 값] ORIGIN_URL = https://$ORIGIN_HOST"
echo "ORIGIN_SECRET 은 $ENV_FILE 안에 있어요. 옮기는 날 Claude 가 순서대로 알려 드려요."
echo "=========================================="
