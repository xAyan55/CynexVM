import { server } from './server';
import { CONFIG } from './config';
import { db } from './db';
import { NotificationDispatcher } from './services/notification/notificationDispatcher';
import { NotificationService } from './services/notification/notificationService';
import { SchedulerService } from './services/automation/SchedulerService';
import { EmailQueue } from './services/email/emailQueue';
import { EmailTemplateService } from './services/email/emailTemplateService';
import { EmailBrandingService } from './services/email/emailBrandingService';

async function main() {
  try {
    // Verify database connectivity
    await db.$connect();
    console.log('[Database] Connection established successfully.');

    // Initialize and ensure builtin email templates exist
    await EmailTemplateService.ensureBuiltinTemplates();
    // Create default branding if none exists (white-label: no hardcoded company name)
    const existingBranding = await EmailBrandingService.getBranding();
    if (!existingBranding) {
      await EmailBrandingService.createDefault();
      console.log('[Email] Default branding created.');
    }
    await EmailQueue.initialize();
    console.log('[Email] Templates seeded, queue initialized.');

    // Start background notification processors
    NotificationDispatcher.startPoller();

    // Start the Email Queue background processor
    EmailQueue.start();

    // Start the Automation Scheduler
    await SchedulerService.start();
    
    // Clean expired notifications hourly
    setInterval(() => {
      NotificationService.cleanExpiredNotifications().catch(console.error);
    }, 60 * 60 * 1000);

    // Clean old email logs daily
    setInterval(async () => {
      const { EmailLogService } = await import('./services/email/emailLogService');
      const purged = await EmailLogService.purgeOldLogs(90);
      if (purged > 0) console.log(`[Email] Purged ${purged} old log entries.`);
    }, 24 * 60 * 60 * 1000);

    server.listen(CONFIG.PORT, () => {
      console.log(`[CynexVM] Panel server running on port ${CONFIG.PORT} in [${CONFIG.NODE_ENV}] mode.`);
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

function gracefulShutdown(signal: string) {
  console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
  EmailQueue.stop();
  SchedulerService.stop().catch(() => {});
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

main();
