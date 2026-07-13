const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logDir = '/var/log/cynexd';

class TerminalService {
  constructor(sendCallback) {
    this.sessions = new Map();
    this.send = sendCallback;
  }

  open(sessionId, containerId, cols, rows) {
    const proc = spawn('lxc', ['exec', containerId, '/bin/bash'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { TERM: 'xterm-256color', LANG: 'en_US.UTF-8', ...process.env }
    });

    proc.stdout.on('data', (data) => {
      this.send('terminal_output', { sessionId, data: data.toString('base64') });
    });

    proc.stderr.on('data', (data) => {
      this.send('terminal_output', { sessionId, data: data.toString('base64') });
    });

    proc.on('close', (code) => {
      this.send('terminal_closed', { sessionId, exitCode: code });
      this.sessions.delete(sessionId);
    });

    proc.on('error', (err) => {
      this.send('terminal_closed', { sessionId, error: err.message });
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, proc);
    return sessionId;
  }

  input(sessionId, data) {
    const proc = this.sessions.get(sessionId);
    if (!proc || !proc.stdin.writable) return;
    proc.stdin.write(data);
  }

  resize(sessionId, cols, rows) {
    const proc = this.sessions.get(sessionId);
    if (!proc || !proc.stdin.writable) return;
    try {
      process.kill(proc.pid, 'SIGWINCH');
    } catch (_) {}
  }

  close(sessionId) {
    const proc = this.sessions.get(sessionId);
    if (!proc) return;
    proc.kill('SIGTERM');
    this.sessions.delete(sessionId);
  }

  cleanup() {
    for (const [id, proc] of this.sessions) {
      proc.kill('SIGKILL');
    }
    this.sessions.clear();
  }
}

module.exports = TerminalService;
