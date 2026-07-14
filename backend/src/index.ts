import { server } from './server';
import { CONFIG } from './config';
import { db } from './db';
import { NotificationDispatcher } from './services/notification/notificationDispatcher';
import { NotificationService } from './services/notification/notificationService';
import { SchedulerService } from './services/automation/SchedulerService';
import { EmailQueue } from './services/email/emailQueue';
import { EmailTemplateService } from './services/email/emailTemplateService';
import { EmailBrandingService } from './services/email/emailBrandingService';
import { EmailService } from './services/email/emailService';

// Startup guard — prevents accidental duplicate initialization
declare global {
  var __CYNEXVM_STARTED__: boolean | undefined;
}
if (global.__CYNEXVM_STARTED__) {
  console.error('[FATAL] Server already started. Exiting.');
  process.exit(1);
}
global.__CYNEXVM_STARTED__ = true;

async function main() {
  try {
    // Verify database connectivity
    await db.$connect();
    console.log('[Database] Connection established successfully.');

    // Initialize and ensure builtin email templates exist
    await EmailTemplateService.ensureBuiltinTemplates();
    // Preload templates into memory cache
    await EmailTemplateService.preloadTemplates();
    // Non-fatal validation of all built-in templates
    await EmailTemplateService.verifyBuiltinTemplates();

    // Create default branding if none exists (white-label: no hardcoded company name)
    const existingBranding = await EmailBrandingService.getBranding();
    if (!existingBranding) {
      await EmailBrandingService.createDefault();
      console.log('[Email] Default branding created.');
    }
    await EmailQueue.initialize();
    console.log('[Email] Templates seeded, queue initialized.');
    await EmailService.startupVerify();

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

async function gracefulShutdown(signal: string) {
  console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
  try {
    await EmailQueue.stop();
  } catch (err: any) {
    console.error('Error during EmailQueue shutdown:', err.message);
  }
  
  try {
    EmailService.clearCache();
  } catch (err: any) {
    console.error('Error clearing EmailService cache:', err.message);
  }

  SchedulerService.stop().catch(() => {});
  NotificationDispatcher.stopPoller();
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

// PM2 shutdown message (ecosystem.config.js: shutdown_with_message: true)
process.on('message', (msg: any) => {
  if (msg === 'shutdown' || (msg && msg.type === 'shutdown')) {
    gracefulShutdown('PM2 shutdown message').catch(() => process.exit(1));
  }
});

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch(() => process.exit(1));
});
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch(() => process.exit(1));
});

main();
