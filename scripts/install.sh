#!/bin/bash
# CynexVM Control Panel - Master Installer Script
# Supported Platforms: Ubuntu, Debian, Rocky Linux, AlmaLinux

set -e

# Colored logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}        CynexVM Control Panel Installer           ${NC}"
echo -e "${GREEN}==================================================${NC}"

# Check root permissions
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this installer script as root.${NC}"
  exit 1
fi

# Detect Package Manager
if [ -f /etc/debian_version ]; then
  PKG_MANAGER="apt"
  echo -e "${YELLOW}[Info] Debian/Ubuntu system detected.${NC}"
elif [ -f /etc/redhat-release ]; then
  PKG_MANAGER="dnf"
  echo -e "${YELLOW}[Info] RHEL/Rocky/AlmaLinux system detected.${NC}"
else
  echo -e "${RED}[ERROR] Unsupported operating system.${NC}"
  exit 1
fi

# 1. Install Dependencies
echo -e "${YELLOW}[1/5] Installing package dependencies...${NC}"
if [ "$PKG_MANAGER" = "apt" ]; then
  apt update -y
  apt install -y curl git redis-server nginx sqlite3 build-essential
elif [ "$PKG_MANAGER" = "dnf" ]; then
  dnf check-update || true
  dnf install -y curl git redis nginx sqlite make gcc-c++
fi

# Verify Node.js v20+
if ! command -v node &> /dev/null || [ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]; then
  echo -e "${YELLOW}[Info] Installing Node.js v20...${NC}"
  if [ "$PKG_MANAGER" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
  elif [ "$PKG_MANAGER" = "dnf" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
  fi
fi

# 2. Setup Workspaces
if [ ! -f "package.json" ]; then
  echo -e "${YELLOW}[Info] package.json not found in current working directory. Cloning repository to /var/www/cynexvm...${NC}"
  rm -rf /var/www/cynexvm
  mkdir -p /var/www
  git clone https://github.com/xAyan55/CynexVM.git /var/www/cynexvm
  cd /var/www/cynexvm
else
  echo -e "${YELLOW}[Info] package.json found. Installing in current directory: $(pwd)${NC}"
fi

echo -e "${YELLOW}[2/5] Restoring npm dependencies...${NC}"
npm install --workspaces --include=dev

# 3. Database migrations and seeding
echo -e "${YELLOW}[3/5] Syncing database schemas...${NC}"

if [ ! -f "backend/.env" ]; then
  echo -e "${YELLOW}[Info] Generating backend security environment config (.env)...${NC}"
  JWT_SEC=$(openssl rand -hex 32)
  JWT_REF_SEC=$(openssl rand -hex 32)
  ENC_KEY=$(openssl rand -hex 32)
  
  cat <<EOF > backend/.env
DATABASE_URL="file:./dev.db"
PORT=5000
NODE_ENV="production"
JWT_SECRET="${JWT_SEC}"
JWT_REFRESH_SECRET="${JWT_REF_SEC}"
ENCRYPTION_KEY="${ENC_KEY}"
EOF
fi

cd backend
npx prisma generate
npx prisma db push
npm run prisma:seed
cd ..

# 4. Building frontend resources
echo -e "${YELLOW}[4/5] Building frontend assets...${NC}"
npm run build

# 5. Configuring Services & Nginx
echo -e "${YELLOW}[5/5] Configuring system processes...${NC}"
# Setup systemd service for CynexVM backend
cat <<EOF > /etc/systemd/system/cynexvm.service
[Unit]
Description=CynexVM Control Panel Service
After=network.target redis.service

[Service]
Type=simple
User=root
WorkingDirectory=$(pwd)/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production PORT=5000 DATABASE_URL=file:./dev.db

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cynexvm
systemctl restart cynexvm

# Setup Nginx Configuration
cat <<EOF > /etc/nginx/sites-available/cynexvm.conf
server {
    listen 80;
    server_name _;

    # Frontend Assets
    location / {
        root $(pwd)/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # API Proxy rules
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Websockets integration
    location /socket.io/ {
        proxy_pass http://localhost:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

if [ "$PKG_MANAGER" = "apt" ]; then
  ln -sf /etc/nginx/sites-available/cynexvm.conf /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default || true
fi
systemctl restart nginx

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   CynexVM successfully installed and active!      ${NC}"
echo -e "${GREEN}   Admin panel accessible on: http://your-ip/      ${NC}"
echo -e "${GREEN}   Default credentials: admin@gmail.com / admin    ${NC}"
echo -e "${GREEN}==================================================${NC}"
EOF
