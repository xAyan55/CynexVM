import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { db } from '../../db';
import { NodeAuthService } from './AuthService';
import { JobManager } from './JobManager';
import { HeartbeatMonitor } from './HeartbeatMonitor';
import { MetricsConsumer } from './MetricsConsumer';

interface NodeConnection {
  ws: WebSocket;
  nodeId: string;
  connectedAt: Date;
  lastActivity: Date;
}

export class ConnectionManager {
  private static connections = new Map<string, NodeConnection>();
  private static wss: WebSocket.Server;

  static mount(server: any): void {
    this.wss = new WebSocket.Server({ server, path: '/ws/node' });

    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      const ip = req.socket.remoteAddress || 'unknown';
      console.log(`[NodeWS] Connection attempt from ${ip}`);

      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Missing token');
        return;
      }

      const auth = await NodeAuthService.validateConnection(token);
      if (!auth) {
        ws.close(4001, 'Invalid token');
        return;
      }

      const { nodeId } = auth;
      console.log(`[NodeWS] Node ${nodeId} authenticated`);

      const existing = this.connections.get(nodeId);
      if (existing) {
        existing.ws.close(4000, 'Replaced by new connection');
      }

      const conn: NodeConnection = { ws, nodeId, connectedAt: new Date(), lastActivity: new Date() };
      this.connections.set(nodeId, conn);

      await db.node.update({
        where: { id: nodeId },
        data: { status: 'online', connectedAt: new Date(), lastSeen: new Date(), agentVersion: this.getAgentVersion(req) }
      });

      ws.send(JSON.stringify({ type: 'authenticated', nodeId }));

      ws.on('message', (data: WebSocket.RawData) => {
        conn.lastActivity = new Date();
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(nodeId, msg);
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Malformed JSON' }));
        }
      });

      ws.on('close', () => {
        this.connections.delete(nodeId);
        db.node.update({
          where: { id: nodeId },
          data: { status: 'offline', lastSeen: new Date() }
        }).catch(() => {});
        console.log(`[NodeWS] Node ${nodeId} disconnected`);
      });

      ws.on('error', (err) => {
        console.error(`[NodeWS] Error for ${nodeId}:`, err.message);
      });
    });

    console.log('[NodeWS] WebSocket gateway mounted at /ws/node');
  }

  private static getAgentVersion(req: IncomingMessage): string {
    return (req.headers['user-agent'] || '').replace(/^CynexD\//, '');
  }

  private static handleMessage(nodeId: string, msg: any): void {
    switch (msg.type) {
      case 'heartbeat':
        HeartbeatMonitor.process(nodeId, msg);
        MetricsConsumer.ingest(nodeId, msg);
        break;
      case 'job_progress':
      case 'job_stdout':
      case 'job_stderr':
      case 'job_complete':
      case 'job_failed':
      case 'job_cancelled':
        JobManager.handleResponse(msg);
        break;
      case 'terminal_output':
      case 'terminal_closed':
        this.forwardTerminal(nodeId, msg);
        break;
      default:
        this.getConnection(nodeId)?.ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  }

  static send(nodeId: string, message: any): boolean {
    const conn = this.connections.get(nodeId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
    conn.ws.send(JSON.stringify(message));
    return true;
  }

  static getConnection(nodeId: string): NodeConnection | undefined {
    return this.connections.get(nodeId);
  }

  static isConnected(nodeId: string): boolean {
    const conn = this.connections.get(nodeId);
    return !!conn && conn.ws.readyState === WebSocket.OPEN;
  }

  static getConnectedNodes(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, c]) => c.ws.readyState === WebSocket.OPEN)
      .map(([id]) => id);
  }

  static getConnectionCount(): number {
    return this.getConnectedNodes().length;
  }

  static forwardTerminal(nodeId: string, msg: any): void {
    const { TerminalProxy } = require('./TerminalProxy');
    TerminalProxy.forwardFromNode(nodeId, msg);
  }
}
