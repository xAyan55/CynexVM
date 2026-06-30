import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import jwt from 'jsonwebtoken';
import { CONFIG } from './config';
import { apiLimiter } from './middleware/rateLimit';

// Routes imports
import authRoutes from './routes/auth';
import nodeRoutes from './routes/nodes';
import instanceRoutes from './routes/instances';
import fileRoutes from './routes/files';
import settingRoutes from './routes/settings';
import auditLogRoutes from './routes/auditLogs';

// Services
import { LxdService } from './services/lxdService';
import { ReconciliationService } from './services/reconciliation';
import { db } from './db';

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);

// Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

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
  let terminalProcess: ChildProcessWithoutNullStreams | null = null;

  // 1. Terminal via lxc exec (direct container shell, no SSH)
  socket.on('terminal.init', async (params: { instanceId: string; token?: string }) => {
    try {
      const authorized = await checkSocketAuth(params.instanceId, params.token);
      if (!authorized) {
        return socket.emit('terminal.log', '\r\n*** ERROR: Unauthorized access to container terminal ***\r\n');
      }

      const instance = await db.instance.findUnique({
        where: { id: params.instanceId },
        include: { node: true }
      });

      if (!instance) {
        return socket.emit('terminal.log', '\r\n*** ERROR: Container not found ***\r\n');
      }

      const containerName = `cynex-${instance.vmid}`;
      socket.emit('terminal.log', `\r\nAttaching to container ${containerName}...\r\n`);

      // Spawn lxc exec with interactive bash shell
      const proc = spawn('/snap/bin/lxc', ['exec', containerName, '--', '/bin/bash'], {
        env: { ...process.env, TERM: 'xterm-256color' }
      });

      terminalProcess = proc;

      proc.stdout.on('data', (data: Buffer) => {
        socket.emit('terminal.data', data.toString('utf8'));
      });

      proc.stderr.on('data', (data: Buffer) => {
        socket.emit('terminal.data', data.toString('utf8'));
      });

      proc.on('close', (code: number | null) => {
        socket.emit('terminal.log', `\r\n*** Session ended (exit ${code}) ***\r\n`);
        terminalProcess = null;
      });

      proc.on('error', (err: Error) => {
        socket.emit('terminal.log', `\r\n*** Failed to attach: ${err.message} ***\r\n`);
        terminalProcess = null;
      });

      // Relay user keystrokes to the container shell
      socket.on('terminal.input', (data: string) => {
        if (proc && !proc.killed) {
          proc.stdin.write(data);
        }
      });

      socket.on('terminal.resize', (size: { cols: number; rows: number }) => {
        // LXC exec doesn't support resize signals directly via spawn
      });

    } catch (err: any) {
      socket.emit('terminal.log', `\r\n*** ERROR: ${err.message} ***\r\n`);
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

        const live = await LxdService.getContainerStatus(instance.vmid, instance.node);

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
    metricsInterval = setInterval(emitMetrics, 2000);
  });

  socket.on('metrics.unsubscribe', () => {
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null;
    }
  });

  socket.on('disconnect', () => {
    if (metricsInterval) clearInterval(metricsInterval);
    if (terminalProcess && !terminalProcess.killed) {
      terminalProcess.kill();
    }
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

export { server };
