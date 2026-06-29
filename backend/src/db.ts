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

if (CONFIG.NODE_ENV !== 'production') {
  globalThis.prisma = db;
}
