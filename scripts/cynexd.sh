#!/bin/bash
# CynexD v3 - Remote Node Agent Installer
# Usage: bash cynexd.sh --panel-url wss://panel.example.com/ws/node --node-id UUID --token SECRET

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}      CynexD Node Agent v3.0.0 Installer          ${NC}"
echo -e "${GREEN}==================================================${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Run as root${NC}"; exit 1
fi

PANEL_URL=""; NODE_ID=""; TOKEN=""; SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel-url) PANEL_URL="$2"; shift 2 ;;
    --node-id) NODE_ID="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --auto) PANEL_URL="${PANEL_URL:-http://localhost:5000/ws/node}"; shift ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

DAEMON_DIR="/opt/cynexd"
CONFIG_DIR="/etc/cynexd"
LOG_DIR="/var/log/cynexd"

echo -e "${YELLOW}[1/5] Installing dependencies...${NC}"
apt-get update -qq
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
if ! command -v lxc &>/dev/null; then
  snap install lxd
  lxd init --auto || true
fi
echo -e "${GREEN}  OK${NC}"

echo -e "${YELLOW}[2/5] Installing daemon files...${NC}"
rm -rf "$DAEMON_DIR"
mkdir -p "$DAEMON_DIR/services"

if [ -d "$SCRIPTS_DIR/cynexd" ]; then
  cp -r "$SCRIPTS_DIR/cynexd/"* "$DAEMON_DIR/"
else
  echo -e "${RED}[ERROR] scripts/cynexd/ not found alongside this installer${NC}"
  echo -e "${YELLOW}  Clone the repo or copy the scripts/cynexd/ directory${NC}"
  exit 1
fi

cd "$DAEMON_DIR"
npm install --production --no-audit --no-fund
echo -e "${GREEN}  OK${NC}"

echo -e "${YELLOW}[3/5] Creating config...${NC}"
mkdir -p "$CONFIG_DIR" "$LOG_DIR"
cat > "$CONFIG_DIR/config.json" <<CONFEOF
{
  "panelUrl": "${PANEL_URL:-ws://localhost:5000/ws/node}",
  "nodeId": "${NODE_ID}",
  "token": "${TOKEN}",
  "reconnect": true,
  "maxRetries": -1,
  "heartbeatInterval": 15000,
  "reconnectBaseDelay": 1000,
  "reconnectMaxDelay": 60000,
  "logDir": "${LOG_DIR}"
}
CONFEOF
echo -e "${GREEN}  OK${NC}"

echo -e "${YELLOW}[4/5] Creating systemd service...${NC}"
cat > /etc/systemd/system/cynexd.service <<SERVICEEOF
[Unit]
Description=CynexD Node Agent
After=network.target lxd.service
Wants=lxd.service

[Service]
Type=simple
WorkingDirectory=${DAEMON_DIR}
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
User=root
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable cynexd
systemctl restart cynexd
echo -e "${GREEN}  OK${NC}"

echo -e "${YELLOW}[5/5] Verifying...${NC}"
sleep 2
if systemctl is-active --quiet cynexd; then
  echo -e "${GREEN}  CynexD is running${NC}"
else
  echo -e "${RED}  CynexD failed to start. Check: journalctl -u cynexd -f${NC}"
fi

echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}  CynexD Agent installed successfully              ${NC}"
echo -e "${GREEN}  Config: ${CONFIG_DIR}/config.json                 ${NC}"
echo -e "${GREEN}  Logs:   ${LOG_DIR}/daemon.log                    ${NC}"
echo -e "${GREEN}  Status: systemctl status cynexd                  ${NC}"
echo -e "${GREEN}==================================================${NC}"
