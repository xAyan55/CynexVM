const { config } = require('./config');
const WebSocketClient = require('./services/WebSocketClient');
const ContainerService = require('./services/ContainerService');
const MetricsService = require('./services/MetricsService');
const JobExecutor = require('./services/JobExecutor');
const TerminalService = require('./services/TerminalService');

const fs = require('fs');
const path = require('path');

if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

function log(level, message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(config.logDir, 'daemon.log'), line + '\n');
  } catch (_) {}
}

log('info', `CynexD Agent v3.0.0 starting...`);
log('info', `Panel URL: ${config.panelUrl}`);
log('info', `Heartbeat: ${config.heartbeatInterval}ms`);

let terminalService;

function sendMessage(type, extra = {}) {
  wsClient.send(type, extra);
}

const jobExecutor = new JobExecutor(sendMessage, ContainerService, null);

const wsClient = new WebSocketClient({
  onConnect: () => {
    log('info', 'WebSocket connected');
  },

  onAuthenticated: (msg) => {
    log('info', `Authenticated as node ${msg.nodeId}`);

    const metrics = MetricsService.collect();
    wsClient.send('heartbeat', metrics);
  },

  onDisconnect: () => {
    log('warn', 'WebSocket disconnected');
  },

  onHeartbeat: () => {
    const metrics = MetricsService.collect();
    metrics.jobsQueued = jobExecutor.getQueueLength();
    metrics.jobRunning = jobExecutor.isRunning();
    return metrics;
  },

  onJob: (msg) => {
    log('info', `Received job: ${msg.jobType} (${msg.jobId})`);
    jobExecutor.enqueue(msg);
  },

  onJobCancel: (msg) => {
    log('info', `Cancel job: ${msg.jobId}`);
    jobExecutor.cancel(msg.jobId);
  },

  onTerminalOpen: (msg) => {
    log('info', `Terminal open: ${msg.sessionId} on ${msg.containerId}`);
    if (!terminalService) {
      terminalService = new TerminalService((type, data) => wsClient.send(type, data));
    }
    terminalService.open(msg.sessionId, msg.containerId, msg.cols || 80, msg.rows || 24);
  },

  onTerminalInput: (msg) => {
    if (terminalService) terminalService.input(msg.sessionId, msg.data);
  },

  onTerminalResize: (msg) => {
    if (terminalService) terminalService.resize(msg.sessionId, msg.cols, msg.rows);
  },

  onTerminalClose: (msg) => {
    if (terminalService) terminalService.close(msg.sessionId);
  },
});

wsClient.connect();

process.on('SIGINT', () => {
  log('info', 'Shutting down...');
  if (terminalService) terminalService.cleanup();
  wsClient.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', 'Shutting down...');
  if (terminalService) terminalService.cleanup();
  wsClient.disconnect();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log('error', `Uncaught: ${err.message}`);
});

process.on('unhandledRejection', (err) => {
  log('error', `Unhandled: ${err.message}`);
});
