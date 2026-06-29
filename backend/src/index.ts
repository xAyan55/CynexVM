import { server } from './server';
import { CONFIG } from './config';
import { db } from './db';

async function main() {
  try {
    // Verify database connectivity
    await db.$connect();
    console.log('[Database] Connection established successfully.');

    server.listen(CONFIG.PORT, () => {
      console.log(`[CynexVM] Panel server running on port ${CONFIG.PORT} in [${CONFIG.NODE_ENV}] mode.`);
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

main();
