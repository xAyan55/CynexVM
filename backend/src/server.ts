import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
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
import { SshService } from './services/sshService';
import { LxdService } from './services/lxdService';
import { db } from './db';

const app = express();
const server = http.createServer(app);

// Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict to panel domain name
    methods: ['GET', 'POST']
  }
});

// Security & Parsing Middleware
app.use(helmet({
  contentSecurityPolicy: CONFIG.NODE_ENV === 'production' ? undefined : false, // Disable for dev source maps
}));

app.use(cors({
  origin: true, // Allow frontend domain
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limits
app.use('/api/', apiLimiter);

// Bind REST routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/nodes', nodeRoutes);
app.use('/api/v1/instances', instanceRoutes);
app.use('/api/v1/instances/:id/files', fileRoutes);
app.use('/api/v1/settings', settingRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error boundary
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled internal error:', err);
  res.status(500).json({ error: 'An unexpected internal error occurred' });
});

// WebSocket Server Handlers
io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  let metricsInterval: NodeJS.Timeout | null = null;

  // 1. Terminal Proxy Session handler
  socket.on('terminal.init', async (params: { instanceId: string; host?: string; username?: string; password?: string }) => {
    try {
      const instance = await db.instance.findUnique({
        where: { id: params.instanceId },
        include: { node: true }
      });

      if (!instance) {
        return socket.emit('terminal.log', '\r\n*** ERROR: LXC Container instance not found ***\r\n');
      }

      const host = params.host || instance.ipAddress;
      const username = params.username || 'root';
      const password = params.password || instance.password || undefined;

      if (!host) {
        return socket.emit('terminal.log', '\r\n*** ERROR: No IP Address configured on container ***\r\n');
      }

      socket.emit('terminal.log', `\r\nConnecting to SSH server at ${host}:22...\r\n`);
      
      SshService.handleTerminalSocket(socket, {
        host,
        username,
        password,
        port: 22
      });
    } catch (err: any) {
      socket.emit('terminal.log', `\r\n*** ERROR negotiating terminal tunnel: ${err.message} ***\r\n`);
    }
  });

  // 2. Real-time Live Metrics Streaming
  socket.on('metrics.subscribe', async (params: { instanceId: string }) => {
    if (metricsInterval) clearInterval(metricsInterval);

    const emitMetrics = async () => {
      try {
        const instance = await db.instance.findUnique({
          where: { id: params.instanceId },
          include: { node: true }
        });

        if (!instance) return;

        const live = await LxdService.getContainerStatus(instance.vmid);

        socket.emit('metrics.data', {
          cpu: live.cpu,
          maxcpu: live.maxcpu,
          mem: live.mem,
          maxmem: live.maxmem,
          disk: live.disk,
          maxdisk: live.maxdisk,
          netin: live.netin,
          netout: live.netout,
          uptime: live.uptime
        });
      } catch (err: any) {
        socket.emit('metrics.error', { message: err.message });
      }
    };

    // Emit immediately then set interval
    await emitMetrics();
    metricsInterval = setInterval(emitMetrics, 2000); // 2 second polls
  });

  socket.on('metrics.unsubscribe', () => {
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null;
    }
  });

  socket.on('disconnect', () => {
    if (metricsInterval) clearInterval(metricsInterval);
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

export { server };
