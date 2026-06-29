#!/bin/bash
# CynexD - Remote LXD Host Daemon Setup Installer
# Supported Platforms: Ubuntu, Debian

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}          CynexD Daemon Setup Installer           ${NC}"
echo -e "${GREEN}==================================================${NC}"

# Check root permissions
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this installer script as root.${NC}"
  exit 1
fi

# 1. Install Dependencies
echo -e "${YELLOW}[1/4] Installing package dependencies...${NC}"
apt update -y
apt install -y curl git snapd nodejs npm

# Install LXD (container engine)
if ! command -v lxc &> /dev/null; then
  echo -e "${YELLOW}[Info] Installing LXD container engine snap...${NC}"
  snap install lxd
  lxd init --auto || true
fi

# 2. Setup Working Directory
echo -e "${YELLOW}[2/4] Initializing /var/www/cynexd...${NC}"
mkdir -p /var/www/cynexd
cd /var/www/cynexd

# Write Express daemon index.js
cat << 'EOF' > index.js
const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

// Load config.json
let config = {};
const configPath = '/var/www/config.json';
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (err) {
  console.error('Failed to load config.json:', err.message);
}

const PORT = config.port || 5050;
const TOKEN = config.token || '';

// Token authorization middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!TOKEN) {
    return next(); // Default to open access if no token is configured
  }
  if (!authHeader || authHeader !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Connection check endpoint
app.get('/api/v1/test', async (req, res) => {
  try {
    const { stdout } = await execAsync('/snap/bin/lxc --version');
    res.json({ success: true, version: stdout.trim() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resource stats endpoint
app.get('/api/v1/status', async (req, res) => {
  try {
    const { stdout: memOut } = await execAsync('free -b');
    const lines = memOut.split('\n');
    const memLine = lines[1].split(/\s+/);
    const totalMem = parseInt(memLine[1], 10);
    const usedMem = parseInt(memLine[2], 10);

    const { stdout: cpuOut } = await execAsync("grep 'cpu ' /proc/stat");
    const cpuFields = cpuOut.split(/\s+/);
    const idle = parseInt(cpuFields[4], 10);
    const total = cpuFields.slice(1).reduce((acc, val) => acc + parseInt(val, 10), 0);

    res.json({
      cpu: 1 - (idle / total),
      memory: { total: totalMem, used: usedMem, free: totalMem - usedMem },
      disk: { total: 100 * 1024 * 1024 * 1024, used: 25 * 1024 * 1024 * 1024 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Container Status
app.get('/api/v1/containers/:vmid/status', async (req, res) => {
  const { vmid } = req.params;
  try {
    const containerName = `cynex-${vmid}`;
    const { stdout } = await execAsync(`/snap/bin/lxc info ${containerName} --format=json`);
    const info = JSON.parse(stdout);
    res.json({
      status: info.status?.toLowerCase() || 'stopped',
      cpu: 0.05,
      mem: info.state?.memory?.usage || 0,
      maxmem: info.state?.memory?.usage_peak || 512 * 1024 * 1024,
      uptime: info.state?.uptime || 0
    });
  } catch (err) {
    res.json({ status: 'stopped', cpu: 0, mem: 0, maxmem: 512 * 1024 * 1024, uptime: 0 });
  }
});

// Power actions
app.post('/api/v1/containers/:vmid/start', async (req, res) => {
  const { vmid } = req.params;
  try {
    await execAsync(`/snap/bin/lxc start cynex-${vmid}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/containers/:vmid/stop', async (req, res) => {
  const { vmid } = req.params;
  try {
    await execAsync(`/snap/bin/lxc stop cynex-${vmid}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/containers/:vmid/reboot', async (req, res) => {
  const { vmid } = req.params;
  try {
    await execAsync(`/snap/bin/lxc restart cynex-${vmid}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete container
app.delete('/api/v1/containers/:vmid', async (req, res) => {
  const { vmid } = req.params;
  try {
    await execAsync(`/snap/bin/lxc delete cynex-${vmid} --force`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deploy container
app.post('/api/v1/containers', async (req, res) => {
  const { vmid, ostemplate, cores, memory } = req.body;
  const containerName = `cynex-${vmid}`;
  let distro = 'ubuntu/22.04';
  if (ostemplate.toLowerCase().includes('debian')) {
    distro = 'debian/12';
  } else if (ostemplate.toLowerCase().includes('alpine')) {
    distro = 'alpine/3.19';
  }

  try {
    await execAsync(`/snap/bin/lxc launch images:${distro} ${containerName}`);
    if (cores) {
      await execAsync(`/snap/bin/lxc config set ${containerName} limits.cpu ${cores}`);
    }
    if (memory) {
      await execAsync(`/snap/bin/lxc config set ${containerName} limits.memory ${memory}MB`);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CynexD Daemon listening on port ${PORT}`);
});
EOF

# Install dependencies
echo -e "${YELLOW}[3/4] Restoring npm dependencies...${NC}"
npm init -y > /dev/null
npm install express > /dev/null

# 3. Setup Systemd Service
echo -e "${YELLOW}[4/4] Creating systemd service file (/etc/systemd/system/cynexd.service)...${NC}"
cat <<EOF > /etc/systemd/system/cynexd.service
[Unit]
Description=CynexD Host Node daemon service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/cynexd
ExecStart=/usr/bin/node index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cynexd

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}          Setup Completed Successfully!           ${NC}"
echo -e "${GREEN}==================================================${NC}"
echo -e "${YELLOW}Next Steps:${NC}"
echo -e " 1. Paste the generated config file contents into: ${GREEN}/var/www/config.json${NC}"
echo -e " 2. Start the daemon service with: ${GREEN}systemctl start cynexd${NC}"
echo -e " 3. Verify status with: ${GREEN}systemctl status cynexd${NC}"
echo -e "${GREEN}==================================================${NC}"
