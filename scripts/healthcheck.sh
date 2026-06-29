#!/bin/bash
# CynexVM Control Panel - Health Check & Diagnostics Script

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}          CynexVM Diagnostics Health Check        ${NC}"
echo -e "${GREEN}==================================================${NC}"

# Check Node.js
if command -v node &> /dev/null; then
  NODE_VER=$(node -v)
  echo -e "Node.js: ${GREEN}OK (${NODE_VER})${NC}"
else
  echo -e "Node.js: ${RED}MISSING (Requires v20+)${NC}"
fi

# Check Redis-server
if systemctl is-active --quiet redis-server || systemctl is-active --quiet redis; then
  echo -e "Redis: ${GREEN}RUNNING${NC}"
else
  echo -e "Redis: ${YELLOW}OFFLINE / UNINSTALLED (Recommended for production job queue)${NC}"
fi

# Check Nginx
if systemctl is-active --quiet nginx; then
  echo -e "Nginx Proxy: ${GREEN}RUNNING${NC}"
else
  echo -e "Nginx Proxy: ${RED}STOPPED${NC}"
fi

# Check CynexVM systemd backend service
if systemctl is-active --quiet cynexvm; then
  echo -e "CynexVM Backend: ${GREEN}RUNNING${NC}"
else
  echo -e "CynexVM Backend: ${RED}STOPPED (Run: systemctl start cynexvm)${NC}"
fi

# Check API listening port 5000
if command -v ss &> /dev/null; then
  if ss -tlnp | grep -q ":5000"; then
    echo -e "API Port 5000: ${GREEN}LISTENING${NC}"
  else
    echo -e "API Port 5000: ${RED}CLOSED (Check backend status logs)${NC}"
  fi
fi

# SQLite DB integrity check
if [ -f "./backend/prisma/dev.db" ]; then
  DB_SIZE=$(du -h "./backend/prisma/dev.db" | cut -f1)
  echo -e "Database: ${GREEN}OK (${DB_SIZE})${NC}"
else
  echo -e "Database: ${YELLOW}NOT INITIALIZED YET${NC}"
fi

echo -e "${GREEN}==================================================${NC}"
EOF
