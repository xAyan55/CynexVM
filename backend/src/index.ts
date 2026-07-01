import { server } from './server';
import { CONFIG } from './config';
import { db } from './db';
import { NotificationDispatcher } from './services/notification/notificationDispatcher';
import { NotificationService } from './services/notification/notificationService';

async function main() {
  try {
    // Verify database connectivity
    await db.$connect();
    console.log('[Database] Connection established successfully.');

    // Start background notification processors
    NotificationDispatcher.startPoller();
    
    // Clean expired notifications hourly
    setInterval(() => {
      NotificationService.cleanExpiredNotifications().catch(console.error);
    }, 60 * 60 * 1000);

    server.listen(CONFIG.PORT, () => {
      console.log(`[CynexVM] Panel server running on port ${CONFIG.PORT} in [${CONFIG.NODE_ENV}] mode.`);
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

main();
