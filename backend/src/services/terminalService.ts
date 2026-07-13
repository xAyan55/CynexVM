import { Socket } from 'socket.io';
import { db } from '../db';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { SocketService } from './socketService';

const pty = require('node-pty');

interface TerminalSession {
  domainName: string;
  vmid: number;
  pty: any;
  userId: string;
  socketIds: Set<string>;
  createdAt: Date;
  lastActivity: Date;
  cleanupTimer: NodeJS.Timeout | null;
  cols: number;
  rows: number;
}

class TerminalSessionManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private socketToDomain: Map<string, string> = new Map();
  private readonly CLEANUP_DELAY = 60000;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000;
  private readonly CLEANUP_INTERVAL = 60 * 1000;

  constructor() {
    setInterval(() => this.cleanupExpired(), this.CLEANUP_INTERVAL);
  }

  async createOrAttach(
    socket: Socket,
    instanceId: string,
    token: string | undefined,
    cols: number,
    rows: number,
  ): Promise<{ sessionId: string; error?: string }> {
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

    const domainName = `cynex-${instance.vmid}`;

    const existing = this.sessions.get(domainName);
    if (existing && !existing.pty.destroyed) {
      this.attachSocket(domainName, socket.id);
      socket.emit('terminal.ready', { sessionId: domainName, containerName: domainName });
      return { sessionId: domainName };
    }

    if (existing) {
      this.destroySession(domainName);
    }

    const lxcBinary = this.findBinary(['/snap/bin/lxc', '/usr/bin/lxc'], '/snap/bin/lxc');
    const term = pty.spawn(lxcBinary, [
      'exec', domainName,
      '--env', 'TERM=xterm-256color',
      '--env', 'HOME=/root',
      '--env', 'LANG=en_US.UTF-8',
      '--env', 'LC_ALL=en_US.UTF-8',
      '--env', 'COLORTERM=truecolor',
      '--', '/bin/login', '-f', 'root',
    ], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: '/root',
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });

    const session: TerminalSession = {
      domainName,
      vmid: instance.vmid,
      pty: term,
      userId: user.id,
      socketIds: new Set(),
      createdAt: new Date(),
      lastActivity: new Date(),
      cleanupTimer: null,
      cols: cols || 80,
      rows: rows || 24,
    };

    this.sessions.set(domainName, session);
    this.attachSocket(domainName, socket.id);

    const io = SocketService.getIo();

    term.onData((data: string) => {
      session.lastActivity = new Date();
      for (const sid of session.socketIds) {
        io?.to(sid).emit('terminal.data', { sessionId: domainName, data });
      }
    });

    term.onExit(({ exitCode, signal }: { exitCode: number; signal: number }) => {
      for (const sid of session.socketIds) {
        io?.to(sid).emit('terminal.exit', { sessionId: domainName, exitCode, signal });
      }
      this.destroySession(domainName);
    });

    socket.emit('terminal.ready', { sessionId: domainName, containerName: domainName });

    return { sessionId: domainName };
  }

  attachSocket(domainName: string, socketId: string): void {
    const session = this.sessions.get(domainName);
    if (!session) return;

    session.socketIds.add(socketId);
    this.socketToDomain.set(socketId, domainName);

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = null;
    }
  }

  detachSocket(socketId: string): void {
    const domainName = this.socketToDomain.get(socketId);
    if (!domainName) return;

    this.socketToDomain.delete(socketId);
    const session = this.sessions.get(domainName);
    if (!session) return;

    session.socketIds.delete(socketId);

    if (session.socketIds.size === 0) {
      session.cleanupTimer = setTimeout(() => {
        this.destroySession(domainName);
      }, this.CLEANUP_DELAY);
    }
  }

  write(domainName: string, data: string): boolean {
    const session = this.sessions.get(domainName);
    if (!session || !session.pty || session.pty.destroyed) return false;
    session.lastActivity = new Date();
    session.pty.write(data);
    return true;
  }

  resize(domainName: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(domainName);
    if (!session || !session.pty || session.pty.destroyed) return false;
    session.cols = cols;
    session.rows = rows;
    try {
      session.pty.resize(cols, rows);
      return true;
    } catch {
      return false;
    }
  }

  getDomainForSocket(socketId: string): string | undefined {
    return this.socketToDomain.get(socketId);
  }

  listSessions(socketId?: string): any[] {
    if (socketId) {
      const domainName = this.socketToDomain.get(socketId);
      if (!domainName) return [];
      const session = this.sessions.get(domainName);
      if (!session) return [];
      return [{
        id: domainName,
        instanceId: session.domainName,
        containerName: session.domainName,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        cols: session.cols,
        rows: session.rows,
      }];
    }
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      id,
      instanceId: s.domainName,
      containerName: s.domainName,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      cols: s.cols,
      rows: s.rows,
    }));
  }

  getSession(domainName: string): any | null {
    const session = this.sessions.get(domainName);
    if (!session) return null;
    return {
      sessionId: domainName,
      instanceId: session.domainName,
      containerName: session.domainName,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      cols: session.cols,
      rows: session.rows,
      socketIds: Array.from(session.socketIds),
    };
  }

  migrateSession(socket: Socket, domainName: string): boolean {
    const session = this.sessions.get(domainName);
    if (!session || session.pty.destroyed) return false;

    const decoded = this.verifyTokenFromSocket(socket);
    if (!decoded || !decoded.userId || session.userId !== decoded.userId) return false;

    this.detachSocket(socket.id);
    this.attachSocket(domainName, socket.id);

    session.lastActivity = new Date();

    return true;
  }

  destroySession(domainName: string): void {
    const session = this.sessions.get(domainName);
    if (!session) return;

    if (session.pty && !session.pty.destroyed) {
      try { session.pty.kill(); } catch (_) {}
    }

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = null;
    }

    for (const [sid, dn] of this.socketToDomain) {
      if (dn === domainName) this.socketToDomain.delete(sid);
    }

    this.sessions.delete(domainName);
  }

  destroySocketSessions(socketId: string): void {
    const domainName = this.socketToDomain.get(socketId);
    if (domainName) {
      this.detachSocket(socketId);
    }
  }

  private verifyTokenFromSocket(socket: Socket): any {
    const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
    if (!token) return null;
    try { return jwt.verify(token as string, CONFIG.JWT_SECRET); } catch { return null; }
  }

  private verifyToken(token?: string): any {
    if (!token) return null;
    try { return jwt.verify(token, CONFIG.JWT_SECRET); } catch { return null; }
  }

  private findBinary(candidates: string[], fallback: string): string {
    const fs = require('fs');
    for (const p of candidates) {
      try { if (fs.existsSync(p)) return p; } catch {}
    }
    return fallback;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [domainName, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        this.destroySession(domainName);
      }
    }
  }
}

export const terminalManager = new TerminalSessionManager();
