import { Socket } from 'socket.io';
import { db } from '../db';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';

const pty = require('node-pty');

interface PtySession {
  pty: any;
  instanceId: string;
  userId: string;
  socketId: string;
  containerName: string;
  createdAt: Date;
  lastActivity: Date;
  timeout: NodeJS.Timeout | null;
  cols: number;
  rows: number;
}

class TerminalManager {
  private sessions: Map<string, PtySession> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 min
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 min

  constructor() {
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  async createSession(
    socket: Socket,
    instanceId: string,
    token: string | undefined,
    cols: number,
    rows: number,
  ): Promise<{ sessionId: string; error?: string }> {
    // Authenticate
    const decoded = this.verifyToken(token);
    if (!decoded || !decoded.userId) {
      return { sessionId: '', error: 'Unauthorized: invalid token' };
    }

    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) return { sessionId: '', error: 'User not found' };

    const roleName = user.roles[0]?.role.name || 'User';

    const instance = await db.instance.findUnique({
      where: { id: instanceId },
      include: { node: true },
    });
    if (!instance) return { sessionId: '', error: 'Instance not found' };

    if (roleName !== 'Admin' && instance.userId !== user.id) {
      return { sessionId: '', error: 'Forbidden: you do not own this instance' };
    }

    const containerName = `cynex-${instance.vmid}`;
    const sessionId = `${socket.id}-${Date.now()}`;

    // Check LXD path
    const lxdPaths = [
      '/snap/bin/lxc',
      '/var/snap/lxd/common/lxd/unix.socket',
      '/usr/bin/lxc',
    ];

    const lxcBinary = this.findLxcBinary();

    // Create PTY: spawn lxc exec inside a proper PTY
    const term = pty.spawn(lxcBinary, [
      'exec',
      containerName,
      '--env', 'TERM=xterm-256color',
      '--env', 'HOME=/root',
      '--env', 'LANG=en_US.UTF-8',
      '--env', 'LC_ALL=en_US.UTF-8',
      '--',
      '/bin/login',
      '-f', 'root',
    ], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: '/root',
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    const session: PtySession = {
      pty: term,
      instanceId,
      userId: user.id,
      socketId: socket.id,
      containerName,
      createdAt: new Date(),
      lastActivity: new Date(),
      timeout: null,
      cols: cols || 80,
      rows: rows || 24,
    };

    this.sessions.set(sessionId, session);
    this.resetTimeout(sessionId);

    // PTY output -> Socket
    term.onData((data: string) => {
      session.lastActivity = new Date();
      this.resetTimeout(sessionId);
      socket.emit('terminal.data', data);
    });

    // PTY exit
    term.onExit(({ exitCode, signal }: { exitCode: number; signal: number }) => {
      socket.emit('terminal.exit', { sessionId, exitCode, signal });
      this.destroySession(sessionId);
    });

    // Socket input -> PTY
    socket.on('terminal.input', (data: string) => {
      const sess = this.sessions.get(sessionId);
      if (sess && !sess.pty.destroyed) {
        sess.lastActivity = new Date();
        this.resetTimeout(sessionId);
        sess.pty.write(data);
      }
    });

    // Socket resize -> PTY
    socket.on('terminal.resize', (size: { cols: number; rows: number }) => {
      const sess = this.sessions.get(sessionId);
      if (sess && !sess.pty.destroyed) {
        sess.cols = size.cols || sess.cols;
        sess.rows = size.rows || sess.rows;
        try {
          sess.pty.resize(size.cols, size.rows);
        } catch (_) {}
      }
    });

    socket.emit('terminal.ready', { sessionId, containerName });

    // Rate limit: max 5 sessions per socket
    const socketSessions = Array.from(this.sessions.values()).filter(s => s.socketId === socket.id);
    if (socketSessions.length > 5) {
      const oldest = socketSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      const oldestId = Array.from(this.sessions.entries()).find(([_, v]) => v === oldest)?.[0];
      if (oldestId) this.destroySession(oldestId);
    }

    return { sessionId };
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.pty.destroyed) return false;
    session.cols = cols;
    session.rows = rows;
    try {
      session.pty.resize(cols, rows);
      return true;
    } catch {
      return false;
    }
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.pty.destroyed) return false;
    session.lastActivity = new Date();
    this.resetTimeout(sessionId);
    session.pty.write(data);
    return true;
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.timeout) clearTimeout(session.timeout);
    if (!session.pty.destroyed) {
      try {
        session.pty.kill();
      } catch (_) {}
    }
    this.sessions.delete(sessionId);
  }

  destroySocketSessions(socketId: string): void {
    const toDelete = Array.from(this.sessions.entries())
      .filter(([_, s]) => s.socketId === socketId)
      .map(([id]) => id);
    for (const id of toDelete) this.destroySession(id);
  }

  getInfo(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      sessionId,
      instanceId: session.instanceId,
      containerName: session.containerName,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      cols: session.cols,
      rows: session.rows,
    };
  }

  listSessions(socketId?: string): any[] {
    const entries = Array.from(this.sessions.entries());
    const filtered = socketId
      ? entries.filter(([_, s]) => s.socketId === socketId)
      : entries;
    return filtered.map(([id, s]) => ({
      id,
      instanceId: s.instanceId,
      containerName: s.containerName,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
    }));
  }

  private verifyToken(token?: string): any {
    if (!token) return null;
    try {
      return jwt.verify(token, CONFIG.JWT_SECRET);
    } catch {
      return null;
    }
  }

  private findLxcBinary(): string {
    const fs = require('fs');
    const candidates = ['/snap/bin/lxc', '/usr/bin/lxc'];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return '/snap/bin/lxc';
  }

  private resetTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.timeout) clearTimeout(session.timeout);
    session.timeout = setTimeout(() => {
      const sock = require('socket.io');
      // Emit warning before closing
      const { SocketService } = require('./socketService');
      SocketService.getIo()?.to(session.socketId)?.emit('terminal.warn', {
        sessionId,
        message: 'Session idle timeout reached. Terminal will close.',
      });
      this.destroySession(sessionId);
    }, this.SESSION_TIMEOUT);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        this.destroySession(id);
      }
    }
  }
}

export const terminalManager = new TerminalManager();
