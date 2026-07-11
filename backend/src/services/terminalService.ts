import { Socket } from 'socket.io';
import { db } from '../db';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { SocketService } from './socketService';

const pty = require('node-pty');

interface ConsoleSession {
  domainName: string;
  vmid: number;
  type: 'lxc' | 'kvm' | 'qemu';
  pty: any;
  userId: string;
  socketIds: Set<string>;
  createdAt: Date;
  lastActivity: Date;
  cleanupTimer: NodeJS.Timeout | null;
  cols: number;
  rows: number;
}

class ConsoleSessionManager {
  private sessions: Map<string, ConsoleSession> = new Map();
  private socketToDomain: Map<string, string> = new Map();
  private readonly CLEANUP_DELAY = 60000;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000;
  private readonly CLEANUP_INTERVAL = 60 * 1000;

  constructor() {
    setInterval(() => this.cleanupExpired(), this.CLEANUP_INTERVAL);
  }

  /**
   * Create a new session (spawn PTY) or attach to an existing one.
   * Returns the domainName as the sessionId.
   */
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
    const type = (instance.type || 'LXC').toLowerCase() as 'lxc' | 'kvm' | 'qemu';

    // Check for existing session
    const existing = this.sessions.get(domainName);
    if (existing && !existing.pty.destroyed) {
      // Attach this socket to the existing session
      this.attachSocket(domainName, socket.id);
      socket.emit('terminal.ready', { sessionId: domainName, containerName: domainName });
      return { sessionId: domainName };
    }

    // Session exists but PTY is dead — clean it up
    if (existing) {
      this.destroySession(domainName);
    }

    // Spawn new PTY based on type
    let term: any;
    if (type === 'lxc') {
      const lxcBinary = this.findBinary(['/snap/bin/lxc', '/usr/bin/lxc'], '/snap/bin/lxc');
      term = pty.spawn(lxcBinary, [
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
    } else {
      const virshBinary = this.findBinary(['/usr/bin/virsh', '/usr/local/bin/virsh'], '/usr/bin/virsh');
      term = pty.spawn(virshBinary, ['console', domainName], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
      });
    }

    const session: ConsoleSession = {
      domainName,
      vmid: instance.vmid,
      type,
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

    // Forward PTY output to ALL attached sockets
    term.onData((data: string) => {
      session.lastActivity = new Date();
      for (const sid of session.socketIds) {
        io?.to(sid).emit('terminal.data', { sessionId: domainName, data });
      }
    });

    // On PTY exit, notify all attached sockets then clean up
    term.onExit(({ exitCode, signal }: { exitCode: number; signal: number }) => {
      for (const sid of session.socketIds) {
        io?.to(sid).emit('terminal.exit', { sessionId: domainName, exitCode, signal });
      }
      this.destroySession(domainName);
    });

    socket.emit('terminal.ready', { sessionId: domainName, containerName: domainName });

    return { sessionId: domainName };
  }

  /**
   * Attach a socket to an existing session.
   */
  attachSocket(domainName: string, socketId: string): void {
    const session = this.sessions.get(domainName);
    if (!session) return;

    session.socketIds.add(socketId);
    this.socketToDomain.set(socketId, domainName);

    // Cancel any pending cleanup
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = null;
    }
  }

  /**
   * Detach a socket from its session.
   * If no sockets remain, start a 60s cleanup timer.
   */
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

  /**
   * Write data to the PTY for a session (addressed by domainName).
   */
  write(domainName: string, data: string): boolean {
    const session = this.sessions.get(domainName);
    if (!session || !session.pty || session.pty.destroyed) return false;
    session.lastActivity = new Date();
    session.pty.write(data);
    return true;
  }

  /**
   * Resize the PTY for a session.
   */
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

  /**
   * Return the domainName for the session a socket is attached to.
   */
  getDomainForSocket(socketId: string): string | undefined {
    return this.socketToDomain.get(socketId);
  }

  /**
   * Return session info for a socket (for terminal.sessions event).
   */
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
        type: session.type,
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
      type: s.type,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      cols: s.cols,
      rows: s.rows,
    }));
  }

  /**
   * Get session info by domainName.
   */
  getSession(domainName: string): any | null {
    const session = this.sessions.get(domainName);
    if (!session) return null;
    return {
      sessionId: domainName,
      instanceId: session.domainName,
      containerName: session.domainName,
      type: session.type,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      cols: session.cols,
      rows: session.rows,
      socketIds: Array.from(session.socketIds),
    };
  }

  /**
   * Migrate a socket to an existing session (for reconnect).
   */
  migrateSession(socket: Socket, domainName: string): boolean {
    const session = this.sessions.get(domainName);
    if (!session || session.pty.destroyed) return false;

    const decoded = this.verifyTokenFromSocket(socket);
    if (!decoded || !decoded.userId || session.userId !== decoded.userId) return false;

    // Detach from old session (if any) and attach to new
    this.detachSocket(socket.id);
    this.attachSocket(domainName, socket.id);

    session.lastActivity = new Date();

    return true;
  }

  /**
   * Destroy a session: kill PTY, clear timers, remove mappings.
   */
  destroySession(domainName: string): void {
    const session = this.sessions.get(domainName);
    if (!session) return;

    // Kill PTY
    if (session.pty && !session.pty.destroyed) {
      try { session.pty.kill(); } catch (_) {}
    }

    // Clear cleanup timer
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = null;
    }

    // Remove socket→domain mappings for this session
    for (const [sid, dn] of this.socketToDomain) {
      if (dn === domainName) this.socketToDomain.delete(sid);
    }

    this.sessions.delete(domainName);
  }

  /**
   * Destroy all sessions for a socket (used on disconnect).
   */
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

export const consoleManager = new ConsoleSessionManager();
