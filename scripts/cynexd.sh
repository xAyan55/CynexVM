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
npm init -y || true
npm install ws || true

# Write Node daemon index.js
cat << 'EOF' > index.js
const http = require('http');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const ws = require('ws');
const net = require('net');

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

const getSocketPath = () => {
  if (fs.existsSync('/var/snap/lxd/common/lxd/unix.socket')) {
    return '/var/snap/lxd/common/lxd/unix.socket';
  }
  return '/var/lib/lxd/unix.socket';
};

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
      let lxcVer = 'unknown';
      let virshVer = 'unknown';
      try {
        const { stdout } = await execAsync('lxc --version');
        lxcVer = stdout.trim();
      } catch (_) {}
      try {
        const { stdout } = await execAsync('virsh --version');
        virshVer = stdout.trim();
      } catch (_) {}
      return sendJson(200, { success: true, lxcVersion: lxcVer, virshVersion: virshVer });
    }

    if (method === 'GET' && url === '/api/v1/status') {
      let totalMem = 16 * 1024 * 1024 * 1024;
      let usedMem = 4 * 1024 * 1024 * 1024;
      try {
        const { stdout: memOut } = await execAsync('free -b');
        const lines = memOut.split('\n');
        const memLine = lines[1].split(/\s+/);
        totalMem = parseInt(memLine[1], 10);
        usedMem = parseInt(memLine[2], 10);
      } catch (_) {}

      let cpuUsage = 0.1;
      try {
        const { stdout: cpuOut } = await execAsync("grep 'cpu ' /proc/stat");
        const cpuFields = cpuOut.split(/\s+/);
        const idle = parseInt(cpuFields[4], 10);
        const total = cpuFields.slice(1).reduce((acc, val) => acc + parseInt(val, 10), 0);
        cpuUsage = 1 - (idle / total);
      } catch (_) {}

      return sendJson(200, {
        cpu: cpuUsage,
        memory: { total: totalMem, used: usedMem, free: totalMem - usedMem },
        disk: { total: 100 * 1024 * 1024 * 1024, used: 25 * 1024 * 1024 * 1024 }
      });
    }

    // Generic command execution
    if (method === 'POST' && url === '/api/v1/exec') {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr || '{}');
          const { command } = body;
          if (!command) return sendJson(400, { error: 'Command is required' });
          
          const { stdout, stderr } = await execAsync(command);
          return sendJson(200, { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 });
        } catch (err) {
          return sendJson(200, {
            stdout: err.stdout?.trim() || '',
            stderr: err.stderr?.trim() || err.message,
            exitCode: err.code || 1
          });
        }
      });
      return;
    }

    // Generic LXD Socket Proxying
    if (method === 'POST' && url === '/api/v1/lxd') {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr || '{}');
          const { url: lxdUrl, method: lxdMethod, data: lxdData } = body;
          
          const options = {
            socketPath: getSocketPath(),
            path: lxdUrl,
            method: lxdMethod,
            headers: {
              'Content-Type': 'application/json'
            }
          };

          const lxdReq = http.request(options, (lxdRes) => {
            let resData = '';
            lxdRes.on('data', (chunk) => { resData += chunk; });
            lxdRes.on('end', () => {
              try {
                const parsed = JSON.parse(resData);
                sendJson(lxdRes.statusCode, parsed);
              } catch (_) {
                res.writeHead(lxdRes.statusCode, { 'Content-Type': 'text/plain' });
                res.end(resData);
              }
            });
          });

          lxdReq.on('error', (err) => {
            sendJson(500, { error: err.message });
          });

          if (lxdData) {
            lxdReq.write(JSON.stringify(lxdData));
          }
          lxdReq.end();
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

// Configure WebSocket Server for VM VNC / Serial proxies
const wss = new ws.Server({ noServer: true });

wss.on('connection', (wsConn, req) => {
  const url = req.url;
  const vncMatch = url.match(/^\/api\/v1\/vnc\/(\d+)$/);
  const serialMatch = url.match(/^\/api\/v1\/serial\/(\d+)$/);

  if (vncMatch) {
    const vmid = parseInt(vncMatch[1], 10);
    const vncPort = 5900 + (vmid % 100);
    const tcpSocket = net.connect(vncPort, '127.0.0.1');

    wsConn.on('message', (msg) => {
      if (tcpSocket.writable) tcpSocket.write(msg);
    });

    tcpSocket.on('data', (data) => {
      if (wsConn.readyState === ws.OPEN) wsConn.send(data);
    });

    wsConn.on('close', () => tcpSocket.end());
    tcpSocket.on('close', () => wsConn.close());
    wsConn.on('error', () => tcpSocket.end());
    tcpSocket.on('error', () => wsConn.close());
    tcpSocket.on('error', (err) => console.error('[VNC TCP Error]:', err.message));
  }

  if (serialMatch) {
    const vmid = parseInt(serialMatch[1], 10);
    const proc = spawn('virsh', ['console', `cynex-${vmid}`]);

    wsConn.on('message', (msg) => {
      if (proc.stdin.writable) proc.stdin.write(msg);
    });

    proc.stdout.on('data', (data) => {
      if (wsConn.readyState === ws.OPEN) wsConn.send(data);
    });

    wsConn.on('close', () => proc.kill());
    proc.on('close', () => wsConn.close());
    wsConn.on('error', () => proc.kill());
    proc.on('error', () => wsConn.close());
  }
});

server.on('upgrade', (req, socket, head) => {
  // Validate token from queries
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const queryToken = urlObj.searchParams.get('token');
  
  if (TOKEN && queryToken !== TOKEN) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (wsConn) => {
    wss.emit('connection', wsConn, req);
  });
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
