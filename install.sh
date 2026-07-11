#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  CynexVM — One-Click Installer
#  Supports: Ubuntu 22.04+ / Debian 12+
#  Installs: Node.js 20, CynexVM Panel, SQLite, LXD, libvirt/QEMU
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/cynexvm"
PANEL_PORT=5000
REPO="https://github.com/xAyan55/CynexVM.git"

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║            CynexVM Installer v2.0                ║"
  echo "  ║    Multi-Hypervisor Virtualization Platform      ║"
  echo "  ║         LXC Containers + QEMU/KVM VMs            ║"
  echo "  ╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

log()   { echo -e "  ${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "  ${YELLOW}[!]${NC} $1"; }
err()   { echo -e "  ${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "\n  ${CYAN}${BOLD}▸ $1${NC}"; }

check_root() {
  if [ "$(id -u)" -ne 0 ]; then
    err "This installer must be run as root. Use: sudo bash install.sh"
  fi
}

check_os() {
  if ! grep -qiE "ubuntu|debian" /etc/os-release 2>/dev/null; then
    warn "This installer is designed for Ubuntu/Debian. Proceed at your own risk."
  fi
}

install_deps() {
  step "Installing system dependencies..."
  apt-get update -qq
  apt-get install -y -qq \
    curl wget git build-essential \
    ca-certificates gnupg lsb-release \
    sqlite3 nginx certbot python3-certbot-nginx \
    qemu-kvm qemu-utils libvirt-daemon-system libvirt-clients \
    virtinst bridge-utils cloud-image-utils genisoimage \
    ovmf swtpm > /dev/null 2>&1
  log "System packages installed"
}

install_node() {
  step "Installing Node.js 20 LTS..."
  if command -v node &>/dev/null && [[ "$(node -v)" == v20* || "$(node -v)" == v22* ]]; then
    log "Node.js $(node -v) already installed"
    return
  fi
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log "Node.js $(node -v) installed"
}

install_lxd() {
  step "Installing LXD container runtime..."
  if command -v lxd &>/dev/null; then
    log "LXD already installed"
  else
    snap install lxd --channel=latest/stable 2>/dev/null || apt-get install -y -qq lxd > /dev/null 2>&1
    log "LXD installed"
  fi

  # Auto-init LXD if not already initialized
  if ! lxc storage list 2>/dev/null | grep -q "default"; then
    lxd init --auto --storage-backend=dir 2>/dev/null || true
    log "LXD initialized with default storage"
  else
    log "LXD already initialized"
  fi
}

setup_libvirt() {
  step "Configuring libvirt/QEMU hypervisor..."
  systemctl enable --now libvirtd > /dev/null 2>&1 || true

  # Enable default NAT network if not active
  if ! virsh net-info default 2>/dev/null | grep -q "Active.*yes"; then
    virsh net-start default 2>/dev/null || true
    virsh net-autostart default 2>/dev/null || true
  fi
  log "libvirt daemon active with default network"

  # Check KVM hardware support
  if [ -e /dev/kvm ]; then
    log "KVM hardware acceleration available"
  else
    warn "KVM not available — VMs will use software emulation (slow)"
  fi
}

clone_repo() {
  step "Cloning CynexVM repository..."
  if [ -d "$INSTALL_DIR" ]; then
    warn "Existing installation found, pulling latest..."
    cd "$INSTALL_DIR"
    git pull origin main --ff-only 2>/dev/null || git pull origin main
    log "Repository updated"
  else
    git clone "$REPO" "$INSTALL_DIR"
    log "Repository cloned to $INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
}

install_packages() {
  step "Installing npm dependencies..."
  npm install --legacy-peer-deps > /dev/null 2>&1
  log "Dependencies installed"
}

setup_env() {
  step "Configuring environment..."
  if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -hex 16)
    cat > "$INSTALL_DIR/backend/.env" <<EOF
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="${JWT_SECRET}"
JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="${ENCRYPTION_KEY}"
PORT=${PANEL_PORT}
NODE_ENV=production
LXD_SOCKET_PATH=/var/snap/lxd/common/lxd/unix.socket
EOF
    log "Environment file created with secure random secrets"
  else
    log "Environment file already exists, keeping current config"
  fi
}

build_project() {
  step "Building CynexVM (backend + frontend)..."
  npm run build 2>&1 | tail -5
  log "Build completed successfully"
}

setup_database() {
  step "Initializing database..."
  cd "$INSTALL_DIR/backend"
  npx prisma db push --accept-data-loss > /dev/null 2>&1
  log "Database schema synchronized"

  # Seed admin user if database is empty
  CPU_CORES=$(nproc)
  MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
  STORAGE_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')
  SUPPORTS_QEMU=$([ -e /dev/kvm ] && echo true || echo false)

  node -e "
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcryptjs');
    const db = new PrismaClient();
    (async () => {
      const count = await db.user.count();
      if (count === 0) {
        const hash = await bcrypt.hash('admin', 12);
        const user = await db.user.create({
          data: { username: 'admin', email: 'admin@cynexvm.local', passwordHash: hash, emailVerified: true }
        });

        // Create Admin role
        let role = await db.role.findFirst({ where: { name: 'Admin' } });
        if (!role) role = await db.role.create({ data: { name: 'Admin', description: 'Full administrator access' } });
        await db.userRole.create({ data: { userId: user.id, roleId: role.id } });

        // Create User role (required for registration)
        let userRole = await db.role.findFirst({ where: { name: 'User' } });
        if (!userRole) await db.role.create({ data: { name: 'User', description: 'Standard client user with limited scope access' } });

        // Create default node (localhost)
        await db.node.create({
          data: {
            name: 'local',
            hostname: 'localhost',
            apiUrl: 'http://localhost:5050',
            apiToken: 'local-token',
            cpuCores: ${CPU_CORES},
            memoryMb: ${MEM_MB},
            storageGb: ${STORAGE_GB},
            status: 'online',
            supportsLxc: true,
            supportsQemu: ${SUPPORTS_QEMU},
          }
        });

        console.log('  [✓] Admin user created (admin / admin)');
        console.log('  [✓] Local hypervisor node registered');
      } else {
        console.log('  [✓] Database already seeded');
      }
      await db.\$disconnect();
    })();
  " 2>/dev/null || warn "Database seeding encountered a non-critical error"
  cd "$INSTALL_DIR"
}

create_service() {
  step "Creating systemd service..."
  cat > /etc/systemd/system/cynexvm.service <<EOF
[Unit]
Description=CynexVM Virtualization Panel
After=network.target lxd.service libvirtd.service
Wants=lxd.service libvirtd.service

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
User=root
Environment=NODE_ENV=production
Environment=PORT=${PANEL_PORT}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable cynexvm > /dev/null 2>&1
  systemctl restart cynexvm
  log "CynexVM service installed and started"
}

setup_nginx() {
  step "Configuring Nginx reverse proxy..."
  cat > /etc/nginx/sites-available/cynexvm <<EOF
server {
    listen 80;
    server_name _;

    # Frontend static files
    location / {
        root ${INSTALL_DIR}/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    # Socket.IO proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
}
EOF

  ln -sf /etc/nginx/sites-available/cynexvm /etc/nginx/sites-enabled/cynexvm
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t > /dev/null 2>&1
  systemctl reload nginx
  log "Nginx reverse proxy configured"
}

install_cynexd() {
  step "Installing CynexD node daemon..."
  if [ -f "$INSTALL_DIR/scripts/cynexd.sh" ]; then
    bash "$INSTALL_DIR/scripts/cynexd.sh" --auto 2>/dev/null || true
    log "CynexD daemon installed"
  else
    warn "cynexd.sh not found, skipping daemon install"
  fi
}

print_summary() {
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║        CynexVM Installation Complete!            ║"
  echo "  ╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Panel URL:${NC}       http://${LOCAL_IP}"
  echo -e "  ${BOLD}API Endpoint:${NC}    http://${LOCAL_IP}/api/v1"
  echo -e "  ${BOLD}Admin Login:${NC}     admin / admin"
  echo ""
  echo -e "  ${YELLOW}⚠  Change the default password immediately after login!${NC}"
  echo ""
  echo -e "  ${BOLD}Services:${NC}"
  echo -e "    systemctl status cynexvm     — Panel service"
  echo -e "    systemctl status libvirtd    — KVM/QEMU hypervisor"
  echo -e "    lxc list                     — LXC containers"
  echo -e "    virsh list --all             — QEMU/KVM virtual machines"
  echo ""
  echo -e "  ${BOLD}Logs:${NC}"
  echo -e "    journalctl -u cynexvm -f     — Panel logs"
  echo ""
}

# ═══════════════════════════════════════════
#  Main Execution
# ═══════════════════════════════════════════
banner
check_root
check_os
install_deps
install_node
install_lxd
setup_libvirt
clone_repo
install_packages
setup_env
build_project
setup_database
create_service
setup_nginx
install_cynexd
print_summary
