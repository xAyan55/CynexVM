import { ConnectionManager } from './ConnectionManager';

interface TerminalSession {
  sessionId: string;
  nodeId: string;
  socketId: string;
  containerId: string;
  cols: number;
  rows: number;
}

export class TerminalProxy {
  private static sessions = new Map<string, TerminalSession>();
  private static socketSessions = new Map<string, Set<string>>();

  static open(socketId: string, nodeId: string, containerId: string, cols: number, rows: number): string | null {
    const sessionId = `${nodeId}-${containerId}-${Date.now()}`;

    const sent = ConnectionManager.send(nodeId, {
      type: 'terminal_open',
      sessionId,
      containerId,
      cols,
      rows
    });

    if (!sent) return null;

    const session: TerminalSession = { sessionId, nodeId, socketId, containerId, cols, rows };
    this.sessions.set(sessionId, session);

    if (!this.socketSessions.has(socketId)) {
      this.socketSessions.set(socketId, new Set());
    }
    this.socketSessions.get(socketId)!.add(sessionId);

    return sessionId;
  }

  static input(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    ConnectionManager.send(session.nodeId, {
      type: 'terminal_input',
      sessionId,
      data
    });
  }

  static resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.cols = cols;
    session.rows = rows;
    ConnectionManager.send(session.nodeId, {
      type: 'terminal_resize',
      sessionId,
      cols,
      rows
    });
  }

  static close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    ConnectionManager.send(session.nodeId, {
      type: 'terminal_close',
      sessionId
    });
    this.cleanup(sessionId);
  }

  static detachSocket(socketId: string): void {
    const sessionIds = this.socketSessions.get(socketId);
    if (!sessionIds) return;
    for (const sessionId of sessionIds) {
      this.cleanup(sessionId);
    }
    this.socketSessions.delete(socketId);
  }

  static forwardFromNode(nodeId: string, msg: any): void {
    const { TerminalService } = require('../../services/terminalService');
    switch (msg.type) {
      case 'terminal_output':
        TerminalService.emitToSocket(msg.sessionId, 'terminal.data', { data: msg.data });
        break;
      case 'terminal_closed':
        TerminalService.emitToSocket(msg.sessionId, 'terminal.closed', { sessionId: msg.sessionId });
        this.cleanup(msg.sessionId);
        break;
    }
  }

  static getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  private static cleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const socketSessions = this.socketSessions.get(session.socketId);
      if (socketSessions) {
        socketSessions.delete(sessionId);
        if (socketSessions.size === 0) this.socketSessions.delete(session.socketId);
      }
    }
    this.sessions.delete(sessionId);
  }
}
