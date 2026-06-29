import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load environmental variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Helper to get or generate configuration keys
const getOrGenerateKey = (envVar: string, bytes = 32): string => {
  const value = process.env[envVar];
  if (value) return value;
  // Generate random fallback key for development
  const fallback = crypto.randomBytes(bytes).toString('hex');
  console.warn(`[WARNING] Environment variable ${envVar} is not set. Using generated fallback (NOT FOR PRODUCTION): ${fallback}`);
  return fallback;
};

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  JWT_SECRET: getOrGenerateKey('JWT_SECRET', 32),
  JWT_REFRESH_SECRET: getOrGenerateKey('JWT_REFRESH_SECRET', 32),
  // AES-256-GCM requires a 32-byte key. We take the hex-configured key and parse it to buffer.
  ENCRYPTION_KEY: Buffer.from(getOrGenerateKey('ENCRYPTION_KEY', 32).substring(0, 64), 'hex'),
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  BCRYPT_ROUNDS: 12,
  SESSION_TIMEOUT_MINS: 30,
};
