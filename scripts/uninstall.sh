#!/bin/bash
# CynexVM Control Panel - Uninstaller Script

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}==================================================${NC}"
echo -e "${RED}        CynexVM Control Panel Uninstaller         ${NC}"
echo -e "${RED}==================================================${NC}"

# Check root permissions
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this uninstaller script as root.${NC}"
  exit 1
fi

read -p "Are you absolutely sure you want to uninstall CynexVM? (y/N) " confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo -e "${YELLOW}Uninstall cancelled.${NC}"
    exit 0
fi

# 1. Stop and remove systemd service
echo -e "${YELLOW}Stopping CynexVM services...${NC}"
systemctl stop cynexvm || true
systemctl disable cynexvm || true
rm -f /etc/systemd/system/cynexvm.service
systemctl daemon-reload

# 2. Remove Nginx site
echo -e "${YELLOW}Removing Nginx configurations...${NC}"
rm -f /etc/nginx/sites-enabled/cynexvm.conf || true
rm -f /etc/nginx/sites-available/cynexvm.conf || true
systemctl restart nginx || true

# 3. Clean files
echo -e "${YELLOW}Cleaning panel files...${NC}"
read -p "Do you want to delete the database and backups stored in storage/ too? (y/N) " delStorage
if [[ "$delStorage" =~ ^[yY]$ ]]; then
  echo -e "${YELLOW}Removing entire CynexVM panel directory...${NC}"
  # Go up and delete the parent folder (if it is CynexVM)
  cd ..
  rm -rf CynexVM || echo -e "${RED}Could not auto-remove directory. Please delete the CynexVM workspace manually.${NC}"
else
  echo -e "${YELLOW}Backups and database left intact.${NC}"
fi

echo -e "${GREEN}CynexVM has been uninstalled successfully.${NC}"
EOF
