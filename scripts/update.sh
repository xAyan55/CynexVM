#!/bin/bash
# CynexVM Control Panel - Update Script

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[Update] Starting CynexVM update process...${NC}"

# Check root permissions
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this update script as root.${NC}"
  exit 1
fi

# 1. Backup Database
echo -e "${YELLOW}[Update] Backing up SQLite database...${NC}"
BACKUP_DIR="./storage/backups"
mkdir -p "$BACKUP_DIR"
if [ -f "./backend/prisma/dev.db" ]; then
  cp "./backend/prisma/dev.db" "$BACKUP_DIR/dev.db.bak-$(date +%F-%s)"
  echo -e "${GREEN}[Update] Backup completed.${NC}"
fi

# 2. Fetch Code updates
echo -e "${YELLOW}[Update] Pulling latest git repository updates...${NC}"
git pull || echo -e "${YELLOW}[Warning] Git pull skipped or failed, updating local state.${NC}"

# 3. Reinstall dependencies
echo -e "${YELLOW}[Update] Checking dependencies changes...${NC}"
npm install --workspaces --include=dev

# 4. Migrate database schemas
echo -e "${YELLOW}[Update] Checking migrations...${NC}"
cd backend
npx prisma generate
npx prisma db push --accept-data-loss || npx prisma db push
cd ..

# 5. Build frontend
echo -e "${YELLOW}[Update] Rebuilding production assets...${NC}"
npm run build

# 6. Restart panel service
echo -e "${YELLOW}[Update] Reloading systemd services...${NC}"
systemctl restart cynexvm
systemctl restart nginx

echo -e "${GREEN}[Update] CynexVM panel updated successfully!${NC}"
EOF
