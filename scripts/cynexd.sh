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
apt remove -y npm || true
apt install -y curl git snapd || true

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

# Write zero-dependency Native Node daemon index.js
cat << 'EOF' > index.js
const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const execAsync = promisify(exec);

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

const server = http.createServer(async (req, res) => {
  const sendJson = (statusCode, body) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  // Authorization check
  const authHeader = req.headers['authorization'];
  if (TOKEN && (!authHeader || authHeader !== `Bearer ${TOKEN}`)) {
    return sendJson(401, { error: 'Unauthorized' });
  }

  const url = req.url;
  const method = req.method;

  try {
    if (method === 'GET' && url === '/api/v1/test') {
      const { stdout } = await execAsync('/snap/bin/lxc --version');
      return sendJson(200, { success: true, version: stdout.trim() });
    }

    if (method === 'GET' && url === '/api/v1/status') {
      const { stdout: memOut } = await execAsync('free -b');
      const lines = memOut.split('\n');
      const memLine = lines[1].split(/\s+/);
      const totalMem = parseInt(memLine[1], 10);
      const usedMem = parseInt(memLine[2], 10);

      const { stdout: cpuOut } = await execAsync("grep 'cpu ' /proc/stat");
      const cpuFields = cpuOut.split(/\s+/);
      const idle = parseInt(cpuFields[4], 10);
      const total = cpuFields.slice(1).reduce((acc, val) => acc + parseInt(val, 10), 0);

      return sendJson(200, {
        cpu: 1 - (idle / total),
        memory: { total: totalMem, used: usedMem, free: totalMem - usedMem },
        disk: { total: 100 * 1024 * 1024 * 1024, used: 25 * 1024 * 1024 * 1024 }
      });
    }

    // Match /api/v1/containers/:vmid/status
    const statusMatch = url.match(/^\/api\/v1\/containers\/(\d+)\/status$/);
    if (method === 'GET' && statusMatch) {
      const vmid = statusMatch[1];
      try {
        const containerName = `cynex-${vmid}`;
        const { stdout } = await execAsync(`/snap/bin/lxc info ${containerName} --format=json`);
        const info = JSON.parse(stdout);
        return sendJson(200, {
          status: info.status?.toLowerCase() || 'stopped',
          cpu: 0.05,
          mem: info.state?.memory?.usage || 0,
          maxmem: info.state?.memory?.usage_peak || 512 * 1024 * 1024,
          uptime: info.state?.uptime || 0
        });
      } catch (_) {
        return sendJson(200, { status: 'stopped', cpu: 0, mem: 0, maxmem: 512 * 1024 * 1024, uptime: 0 });
      }
    }

    // Match power actions
    const startMatch = url.match(/^\/api\/v1\/containers\/(\d+)\/start$/);
    if (method === 'POST' && startMatch) {
      await execAsync(`/snap/bin/lxc start cynex-${startMatch[1]}`);
      return sendJson(200, { success: true });
    }

    const stopMatch = url.match(/^\/api\/v1\/containers\/(\d+)\/stop$/);
    if (method === 'POST' && stopMatch) {
      await execAsync(`/snap/bin/lxc stop cynex-${stopMatch[1]}`);
      return sendJson(200, { success: true });
    }

    const rebootMatch = url.match(/^\/api\/v1\/containers\/(\d+)\/reboot$/);
    if (method === 'POST' && rebootMatch) {
      await execAsync(`/snap/bin/lxc restart cynex-${rebootMatch[1]}`);
      return sendJson(200, { success: true });
    }

    // Match delete
    const deleteMatch = url.match(/^\/api\/v1\/containers\/(\d+)$/);
    if (method === 'DELETE' && deleteMatch) {
      await execAsync(`/snap/bin/lxc delete cynex-${deleteMatch[1]} --force`);
      return sendJson(200, { success: true });
    }

    // Match create container
    if (method === 'POST' && url === '/api/v1/containers') {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr || '{}');
          const { vmid, ostemplate, cores, memory } = body;
          const containerName = `cynex-${vmid}`;
          let distro = 'ubuntu/22.04';
          if (ostemplate && ostemplate.toLowerCase().includes('debian')) {
            distro = 'debian/12';
          } else if (ostemplate && ostemplate.toLowerCase().includes('alpine')) {
            distro = 'alpine/3.19';
          }

          await execAsync(`/snap/bin/lxc launch images:${distro} ${containerName}`);
          if (cores) await execAsync(`/snap/bin/lxc config set ${containerName} limits.cpu ${cores}`);
          if (memory) await execAsync(`/snap/bin/lxc config set ${containerName} limits.memory ${memory}MB`);
          sendJson(200, { success: true });
        } catch (err) {
          sendJson(500, { error: err.message });
        }
      });
      return;
    }

    sendJson(404, { error: 'Not Found' });
  } catch (err) {
    sendJson(500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CynexD Daemon listening on port ${PORT}`);
});
EOF

# 3. Setup Systemd Service
echo -e "${YELLOW}[3/4] Creating systemd service file (/etc/systemd/system/cynexd.service)...${NC}"
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
