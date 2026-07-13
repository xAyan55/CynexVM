const WebSocket = require('ws');
const { config } = require('../config');

class WebSocketClient {
  constructor(handlers) {
    this.handlers = handlers;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectDelay = config.reconnectBaseDelay;
    this.shouldReconnect = config.reconnect;
    this.heartbeatTimer = null;
    this.pendingHeartbeat = false;
  }

  connect() {
    const url = `${config.panelUrl}?token=${config.token}`;
    console.log(`[WS] Connecting to ${config.panelUrl}`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.reconnectDelay = config.reconnectBaseDelay;
      this.startHeartbeat();
      if (this.handlers.onConnect) this.handlers.onConnect();
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleMessage(msg);
      } catch (err) {
        console.error('[WS] Malformed message:', err.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[WS] Disconnected (code: ${code}, reason: ${reason || 'none'})`);
      this.stopHeartbeat();
      this.scheduleReconnect();
      if (this.handlers.onDisconnect) this.handlers.onDisconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'authenticated':
        console.log(`[WS] Authenticated as node ${msg.nodeId}`);
        if (this.handlers.onAuthenticated) this.handlers.onAuthenticated(msg);
        break;
      case 'job':
        if (this.handlers.onJob) this.handlers.onJob(msg);
        break;
      case 'job_cancel':
        if (this.handlers.onJobCancel) this.handlers.onJobCancel(msg);
        break;
      case 'terminal_open':
        if (this.handlers.onTerminalOpen) this.handlers.onTerminalOpen(msg);
        break;
      case 'terminal_input':
        if (this.handlers.onTerminalInput) this.handlers.onTerminalInput(msg);
        break;
      case 'terminal_resize':
        if (this.handlers.onTerminalResize) this.handlers.onTerminalResize(msg);
        break;
      case 'terminal_close':
        if (this.handlers.onTerminalClose) this.handlers.onTerminalClose(msg);
        break;
      default:
        console.warn('[WS] Unknown message type:', msg.type);
    }
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.handlers.onHeartbeat) {
        const heartbeatData = this.handlers.onHeartbeat();
        this.send('heartbeat', heartbeatData);
      }
    }, config.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  scheduleReconnect() {
    if (!this.shouldReconnect) return;
    this.reconnectAttempts++;
    const delay = Math.min(
      config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1),
      config.reconnectMaxDelay
    );
    const jitter = delay * (0.5 + Math.random() * 0.5);
    console.log(`[WS] Reconnecting in ${Math.round(jitter)}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), jitter);
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Shutdown');
      this.ws = null;
    }
  }
}

module.exports = WebSocketClient;
