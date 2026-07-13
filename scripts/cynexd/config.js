const fs = require('fs');
const path = require('path');

const CONFIG_PATH = '/etc/cynexd/config.json';

function loadConfig() {
  const defaults = {
    panelUrl: process.env.PANEL_URL || 'ws://localhost:5000/ws/node',
    nodeId: process.env.NODE_ID || '',
    token: process.env.NODE_TOKEN || '',
    reconnect: true,
    maxRetries: -1,
    heartbeatInterval: 15000,
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 60000,
    logDir: '/var/log/cynexd',
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const fileConfig = JSON.parse(raw);
      return { ...defaults, ...fileConfig };
    }
  } catch (err) {
    console.error('[Config] Error reading config file:', err.message);
  }

  return defaults;
}

const config = loadConfig();

module.exports = { config, CONFIG_PATH };
