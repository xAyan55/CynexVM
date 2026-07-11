import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { CONFIG } from './config';
import { apiLimiter } from './middleware/rateLimit';
import { terminalManager } from './services/terminalService';

// Routes imports
import authRoutes from './routes/auth';
import nodeRoutes from './routes/nodes';
import instanceRoutes from './routes/instances';
import fileRoutes from './routes/files';
import settingRoutes from './routes/settings';
import auditLogRoutes from './routes/auditLogs';
import notificationRoutes from './routes/notifications';
import automationRoutes from './routes/automation';

// Services
import { LxdService } from './services/lxdService';
import { ReconciliationService } from './services/reconciliation';
import { db } from './db';
import { SocketService } from './services/socketService';
import url from 'url';
import net from 'net';
import ws from 'ws';
import { CryptoService } from './services/cryptoService';
import { VirtualizationProviderFactory } from './services/virtualization/provider';

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);

// Mount upgrade listener for VM Console WebSocket proxies
server.on('upgrade', async (req, socket, head) => {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '';
  
  const vncMatch = pathname.match(/^\/api\/v1\/instances\/([^\/]+)\/vnc$/);
  const serialMatch = pathname.match(/^\/api\/v1\/instances\/([^\/]+)\/serial$/);
  
  if (!vncMatch && !serialMatch) {
    return; // Let socket.io handle other paths like /socket.io/
  }
  
  // Authenticate token
  const token = (parsedUrl.query?.token as string) || '';
  let userId = '';
  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as any;
    userId = decoded.userId;
  } catch (_) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  
  const instanceId = vncMatch ? vncMatch[1] : (serialMatch ? serialMatch[1] : '');
  const instance = await db.instance.findUnique({
    where: { id: instanceId },
    include: { node: true }
  });
  
  if (!instance) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  
  // Authorization check (Admin or Owner)
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });
  const roleName = user?.roles[0]?.role.name || 'User';
  if (roleName !== 'Admin' && instance.userId !== userId) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // Create ws Server to handle the upgraded socket connection
  const wss = new ws.Server({ noServer: true });
  wss.handleUpgrade(req, socket, head, async (wsConn) => {
    try {
      const node = instance.node;
      const isLocal = node.hostname === 'localhost' || node.apiUrl.includes('localhost') || node.apiUrl.includes('127.0.0.1');
      
      if (isLocal) {
        if (vncMatch) {
          // Pipe local TCP port directly
          const vncPort = 5900 + (instance.vmid % 100);
          const tcpSocket = net.connect(vncPort, '127.0.0.1');
          
          wsConn.on('message', (msg) => {
            if (tcpSocket.writable) tcpSocket.write(msg as Buffer);
          });
          tcpSocket.on('data', (data) => {
            if (wsConn.readyState === ws.OPEN) wsConn.send(data);
          });
          wsConn.on('close', () => tcpSocket.end());
          tcpSocket.on('close', () => wsConn.close());
          wsConn.on('error', () => tcpSocket.end());
          tcpSocket.on('error', () => wsConn.close());
        } else {
          // Pipe local serial child process
          const { spawn } = require('child_process');
          const proc = spawn('virsh', ['console', `cynex-${instance.vmid}`]);
          
          wsConn.on('message', (msg) => {
            if (proc.stdin.writable) proc.stdin.write(msg as Buffer);
          });
          proc.stdout.on('data', (data: any) => {
            if (wsConn.readyState === ws.OPEN) wsConn.send(data);
          });
          wsConn.on('close', () => proc.kill());
          proc.on('close', () => wsConn.close());
          wsConn.on('error', () => proc.kill());
          proc.on('error', () => wsConn.close());
        }
      } else {
        // Pipe remote websocket proxy to node daemon CynexD
        let decryptedToken = 'local-token';
        if (node.apiToken && node.apiToken !== 'local-token') {
          decryptedToken = CryptoService.decrypt(node.apiToken);
        }
        const protocol = node.apiUrl.startsWith('https') ? 'wss' : 'ws';
        const rawNodeUrl = node.apiUrl.replace(/^https?:\/\//, '');
        const targetType = vncMatch ? 'vnc' : 'serial';
        const remoteUrl = `${protocol}://${rawNodeUrl}/api/v1/${targetType}/${instance.vmid}?token=${decryptedToken}`;
        
        const remoteWs = new ws(remoteUrl);
        
        remoteWs.on('open', () => {
          wsConn.on('message', (msg) => {
            if (remoteWs.readyState === ws.OPEN) remoteWs.send(msg as any);
          });
          remoteWs.on('message', (msg) => {
            if (wsConn.readyState === ws.OPEN) wsConn.send(msg as any);
          });
        });
        
        wsConn.on('close', () => remoteWs.close());
        remoteWs.on('close', () => wsConn.close());
        remoteWs.on('error', () => remoteWs.close());
        remoteWs.on('error', () => wsConn.close());
      }
    } catch (err: any) {
      console.error('[Console Handshake Proxy Error]:', err.message);
      wsConn.close();
    }
  });
});

// Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
SocketService.setIo(io);

// Security & Parsing Middleware
app.use(helmet({
  contentSecurityPolicy: CONFIG.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limits
app.use('/api/', apiLimiter);

// Observability & Health Endpoints
app.get('/health', (req, res) => res.status(200).json({ status: 'healthy', timestamp: new Date() }));
app.get('/liveness', (req, res) => res.status(200).send('OK'));
app.get('/readiness', async (req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: 'ready', database: 'connected' });
  } catch (err: any) {
    return res.status(503).json({ status: 'unready', error: err.message });
  }
});

// Bind REST routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/nodes', nodeRoutes);
app.use('/api/v1/instances', instanceRoutes);
app.use('/api/v1/instances/:id/files', fileRoutes);
app.use('/api/v1/settings', settingRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/automation', automationRoutes);

// Folder management API
app.patch('/api/v1/instances/:id/folder', async (req, res) => {
  try {
    const { folderId } = req.body;
    await db.instance.update({
      where: { id: req.params.id },
      data: { folderId: folderId || null }
    });
    return res.status(200).json({ message: 'Folder updated' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Start background reconciliation loop
setInterval(() => {
  ReconciliationService.run();
}, 60000);

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error boundary
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled internal error:', err);
  res.status(500).json({ error: 'An unexpected internal error occurred' });
});

// Socket.IO Auth Helper
async function checkSocketAuth(instanceId: string, token?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as any;
    if (!decoded || !decoded.userId) return false;

    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      include: { roles: { include: { role: true } } }
    });
    if (!user) return false;

    const instance = await db.instance.findUnique({ where: { id: instanceId } });
    if (!instance) return false;

    const roleName = user.roles[0]?.role.name || 'User';
    if (roleName === 'Admin') return true;

    return instance.userId === user.id;
  } catch (_) {
    return false;
  }
}

// WebSocket Server Handlers
io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  let metricsInterval: NodeJS.Timeout | null = null;

  // 1. Enterprise Terminal via node-pty
  socket.on('terminal.create', async (params: {
    instanceId: string;
    token?: string;
    cols?: number;
    rows?: number;
  }) => {
    const result = await terminalManager.createSession(
      socket,
      params.instanceId,
      params.token,
      params.cols || 80,
      params.rows || 24,
    );
    if (result.error) {
      socket.emit('terminal.error', { message: result.error });
    }
  });

  // All session-scoped dispatch is handled via sessionId
  socket.on('terminal.input', (params: { sessionId: string; data: string }) => {
    const ok = terminalManager.write(params.sessionId, params.data);
    if (!ok) socket.emit('terminal.error', { message: 'Session not found or closed' });
  });

  socket.on('terminal.resize', (params: { sessionId: string; cols: number; rows: number }) => {
    const ok = terminalManager.resize(params.sessionId, params.cols, params.rows);
    if (!ok) socket.emit('terminal.error', { message: 'Session not found for resize' });
  });

  socket.on('terminal.close', (params?: { sessionId?: string }) => {
    if (params?.sessionId) {
      terminalManager.destroySession(params.sessionId);
    } else {
      terminalManager.destroySocketSessions(socket.id);
    }
  });

  // List active sessions for this socket
  socket.on('terminal.sessions', () => {
    const sessions = terminalManager.listSessions(socket.id);
    socket.emit('terminal.sessions', sessions);
  });

  // Get info about a specific session
  socket.on('terminal.session.info', (params: { sessionId: string }) => {
    const info = terminalManager.getSession(params.sessionId);
    if (info) {
      socket.emit('terminal.session.info', info);
    } else {
      socket.emit('terminal.error', { message: 'Session not found' });
    }
  });

  // Reconnect: migrate session from old socket to new socket
  socket.on('terminal.reconnect', (params: { sessionId: string }) => {
    const ok = terminalManager.migrateSession(socket, params.sessionId);
    if (ok) {
      const info = terminalManager.getSession(params.sessionId);
      socket.emit('terminal.ready', info);
    } else {
      socket.emit('terminal.error', { message: 'Cannot reconnect: session not found or unauthorized' });
    }
  });

  // 2. Real-time Live Metrics Streaming
  socket.on('metrics.subscribe', async (params: { instanceId: string; token?: string }) => {
    if (metricsInterval) clearInterval(metricsInterval);

    const authorized = await checkSocketAuth(params.instanceId, params.token);
    if (!authorized) {
      return socket.emit('metrics.error', { message: 'Unauthorized metrics subscription' });
    }

    const emitMetrics = async () => {
      try {
        const instance = await db.instance.findUnique({
          where: { id: params.instanceId },
          include: { node: true }
        });

        if (!instance) return;

        const provider = VirtualizationProviderFactory.getProvider(instance.type);
        const live = await provider.metrics(instance.node, instance);

        socket.emit('metrics.data', {
          cpu: live.cpu || 0,
          maxcpu: live.maxcpu || 1,
          mem: live.mem || 0,
          maxmem: live.maxmem || instance.memoryMb * 1024 * 1024,
          disk: live.disk || 0,
          maxdisk: live.maxdisk || instance.storageGb * 1024 * 1024 * 1024,
          netin: live.netin || 0,
          netout: live.netout || 0,
          uptime: live.uptime || 0,
          status: live.status || instance.status
        });
      } catch (err: any) {
        socket.emit('metrics.error', { message: err.message });
      }
    };

    await emitMetrics();
    metricsInterval = setInterval(emitMetrics, 1000);
  });

  socket.on('metrics.unsubscribe', () => {
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null;
    }
  });

  socket.on('user.auth', (params: { token?: string }) => {
    if (!params.token) return;
    try {
      const decoded = jwt.verify(params.token, CONFIG.JWT_SECRET) as any;
      if (decoded && decoded.userId) {
        socket.join(`user:${decoded.userId}`);
        console.log(`[Socket] User ${decoded.userId} subscribed to room: user:${decoded.userId}`);
      }
    } catch (_) {}
  });

  // 3. Automation real-time events
  socket.on('automation.subscribe', async (params: { instanceId: string; token?: string }) => {
    try {
      if (!params.token) return;
      const decoded = jwt.verify(params.token, CONFIG.JWT_SECRET) as any;
      if (!decoded || !decoded.userId) return;

      const user = await db.user.findUnique({
        where: { id: decoded.userId },
        include: { roles: { include: { role: true } } },
      });
      if (!user) return;

      const roleName = user.roles[0]?.role.name || 'User';

      if (roleName === 'Admin') {
        socket.join(`automation:admin`);
        return;
      }

      const instance = await db.instance.findUnique({ where: { id: params.instanceId } });
      if (!instance) return;
      if (instance.userId === user.id) {
        socket.join(`automation:instance:${params.instanceId}`);
      }
    } catch (_) {}
  });

  socket.on('disconnect', () => {
    if (metricsInterval) clearInterval(metricsInterval);
    // Don't destroy sessions — they persist for reconnect via terminal.reconnect.
    // The session timeout (30 min) cleans up truly abandoned sessions.
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

export { server };
