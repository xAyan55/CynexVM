import { Socket } from 'socket.io';
import { db } from '../db';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { SocketService } from './socketService';

const pty = require('node-pty');

interface PtySession {
  pty: any;
  instanceId: string;
  userId: string;
  socketId: string;
  containerName: string;
  type: 'lxc' | 'kvm' | 'qemu';
  createdAt: Date;
  lastActivity: Date;
  timeout: NodeJS.Timeout | null;
  cols: number;
  rows: number;
}

class TerminalManager {
  private sessions: Map<string, PtySession> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000;
  private readonly CLEANUP_INTERVAL = 60 * 1000;

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
    const sessionId = `${socket.id}-${Date.now()}`;

    const type = (instance.type || 'LXC').toLowerCase() as 'lxc' | 'kvm' | 'qemu';

    // KVM/QEMU: kill any existing console session for this domain first
    // virsh console only allows one active connection per domain.
    if (type === 'kvm' || type === 'qemu') {
      this.destroyDomainSession(domainName);
    }

    let term: any;
    let typeLabel: string;

    if (type === 'lxc') {
      // LXC container: use lxc exec
      const lxcBinary = this.findLxcBinary();
      term = pty.spawn(lxcBinary, [
        'exec',
        domainName,
        '--env', 'TERM=xterm-256color',
        '--env', 'HOME=/root',
        '--env', 'LANG=en_US.UTF-8',
        '--env', 'LC_ALL=en_US.UTF-8',
        '--env', 'COLORTERM=truecolor',
        '--',
        '/bin/login',
        '-f', 'root',
      ], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: '/root',
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });
      typeLabel = 'LXC container';
    } else {
      // KVM/QEMU: use virsh console via serial
      const virshBinary = this.findVirshBinary();
      term = pty.spawn(virshBinary, [
        'console',
        domainName,
      ], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
      });
      typeLabel = 'KVM VM';
    }

    const session: PtySession = {
      pty: term,
      instanceId,
      userId: user.id,
      socketId: socket.id,
      containerName: domainName,
      type,
      createdAt: new Date(),
      lastActivity: new Date(),
      timeout: null,
      cols: cols || 80,
      rows: rows || 24,
    };

    this.sessions.set(sessionId, session);
    this.resetTimeout(session);

    const io = SocketService.getIo();

    term.onData((data: string) => {
      session.lastActivity = new Date();
      this.resetTimeout(session);
      io?.to(session.socketId).emit('terminal.data', { sessionId, data });
    });

    term.onExit(({ exitCode, signal }: { exitCode: number; signal: number }) => {
      io?.to(session.socketId).emit('terminal.exit', { sessionId, exitCode, signal });
      this.destroySession(sessionId);
    });

    socket.emit('terminal.ready', { sessionId, containerName: domainName });

    // Rate limit: max 5 sessions per socket
    const socketSessions = Array.from(this.sessions.values()).filter(s => s.socketId === socket.id);
    if (socketSessions.length > 5) {
      const oldest = socketSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      const oldestId = Array.from(this.sessions.entries()).find(([_, v]) => v === oldest)?.[0];
      if (oldestId) this.destroySession(oldestId);
    }

    return { sessionId };
  }

  private getCurrentSocketId(sessionId: string): string {
    return this.sessions.get(sessionId)?.socketId || '';
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
    this.resetTimeout(session);
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

  /**
   * Destroys any active session for a given domain name (used for KVM virsh console).
   * virsh console only permits one active connection per domain.
   */
  destroyDomainSession(domainName: string): void {
    const toDelete = Array.from(this.sessions.entries())
      .filter(([_, s]) => s.containerName === domainName && (s.type === 'kvm' || s.type === 'qemu'))
      .map(([id]) => id);
    for (const id of toDelete) this.destroySession(id);
  }

  destroySocketSessions(socketId: string): void {
    const toDelete = Array.from(this.sessions.entries())
      .filter(([_, s]) => s.socketId === socketId)
      .map(([id]) => id);
    for (const id of toDelete) this.destroySession(id);
  }

  getSession(sessionId: string): { sessionId: string; instanceId: string; containerName: string; type: string; createdAt: Date; lastActivity: Date; cols: number; rows: number; socketId: string } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      sessionId,
      instanceId: session.instanceId,
      containerName: session.containerName,
      type: session.type,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      cols: session.cols,
      rows: session.rows,
      socketId: session.socketId,
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
      type: s.type,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      cols: s.cols,
      rows: s.rows,
    }));
  }

  migrateSession(socket: Socket, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.pty.destroyed) return false;

    // Verify token
    const decoded = this.verifyTokenFromSocket(socket);
    if (!decoded || !decoded.userId || session.userId !== decoded.userId) return false;

    const oldSocketId = session.socketId;
    session.socketId = socket.id;
    session.lastActivity = new Date();
    this.resetTimeout(session);

    return true;
  }

  private verifyTokenFromSocket(socket: Socket): any {
    const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
    if (!token) return null;
    try {
      return jwt.verify(token as string, CONFIG.JWT_SECRET);
    } catch {
      return null;
    }
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

  private findVirshBinary(): string {
    const fs = require('fs');
    const candidates = ['/usr/bin/virsh', '/usr/local/bin/virsh'];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return '/usr/bin/virsh';
  }

  private resetTimeout(session: PtySession): void {
    if (session.timeout) clearTimeout(session.timeout);
    session.timeout = setTimeout(() => {
      const io = SocketService.getIo();
      if (io) {
        io.to(session.socketId).emit('terminal.warn', {
          sessionId: this.findSessionIdBySession(session),
          message: 'Session idle timeout reached. Terminal will close.',
        });
      }
      this.destroySession(this.findSessionIdBySession(session));
    }, this.SESSION_TIMEOUT);
  }

  private findSessionIdBySession(target: PtySession): string {
    for (const [id, s] of this.sessions) {
      if (s === target) return id;
    }
    return '';
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
