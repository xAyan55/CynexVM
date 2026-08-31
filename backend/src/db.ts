import { PrismaClient } from '@prisma/client';
import { CONFIG } from './config';

declare global {
  var prisma: PrismaClient | undefined;
}

export const db = globalThis.prisma || new PrismaClient({
  datasources: {
    db: {
      url: CONFIG.DATABASE_URL,
    },
  },
});

// Configure SQLite WAL mode and busy timeout for high concurrency
if (CONFIG.DATABASE_URL.startsWith('file:')) {
  db.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
  db.$queryRawUnsafe('PRAGMA busy_timeout = 10000;').catch(() => {});
  db.$queryRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => {});
}

if (CONFIG.NODE_ENV !== 'production') {
  globalThis.prisma = db;
}
