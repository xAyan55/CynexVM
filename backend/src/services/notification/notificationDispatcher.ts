import { db } from '../../db';
import { SocketService } from '../socketService';
import { NotificationPreferences } from './notificationPreferences';
import { EmailQueue } from '../email/emailQueue';
import { EmailTemplateService } from '../email/emailTemplateService';

const backoffDelays = [10, 30, 120, 480, 1920]; // backoff delays in seconds (10s, 30s, 2m, 8m, 32m)

export class NotificationDispatcher {
  private static activePoller: NodeJS.Timeout | null = null;
  private static isPolling = false;

  /**
   * Initializes the background database-backed persistent worker poller.
   */
  public static startPoller() {
    if (this.activePoller) return;
    console.log('[Notification Queue] Starting persistent queue worker...');
    this.activePoller = setInterval(() => this.processQueue(), 5000);
  }

  /**
   * Stops the background poller worker.
   */
  public static stopPoller() {
    if (this.activePoller) {
      clearInterval(this.activePoller);
      this.activePoller = null;
    }
  }

  /**
   * Runs one cycle of background queue processing.
   */
  private static async processQueue() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      // Find all pending deliveries that are scheduled for execution
      const deliveries = await db.notificationDelivery.findMany({
        where: {
          status: 'pending',
          OR: [
            { retryAfter: null },
            { retryAfter: { lte: new Date() } }
          ]
        },
        include: {
          notification: true
        },
        take: 10 // process in batches to ensure high performance
      });

      for (const d of deliveries) {
        await this.dispatchDelivery(d);
      }
    } catch (err: any) {
      console.error('[Notification Queue] Poller run failure:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Dispatches a single delivery task.
   */
  private static async dispatchDelivery(delivery: any) {
    const { notification, channel } = delivery;
    let success = false;
    let errorMsg: string | null = null;

    try {
      if (channel === 'websocket') {
        // Real-time socket channel
        if (notification.userId) {
          SocketService.emitToUser(notification.userId, 'notification.new', notification);
        } else {
          SocketService.emitToAll('notification.new', notification);
        }
        success = true;
      } else if (channel === 'email') {
        success = await this.sendEmail(notification);
      } else if (channel === 'discord') {
        success = await this.sendDiscordWebhook(notification);
      } else if (channel === 'webhook') {
        success = await this.sendGenericWebhook(notification);
      } else if (channel === 'panel') {
        // Panel notifications are persistent in the DB and loaded via REST. Always succeeds.
        success = true;
      }
    } catch (err: any) {
      errorMsg = err.message || 'Unknown dispatch error';
    }

    try {
      if (success) {
        await db.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'success',
            error: null,
            deliveredAt: new Date()
          }
        });
      } else {
        const nextAttempt = delivery.retryCount + 1;
        const isDeadLetter = nextAttempt >= delivery.maxAttempts;
        const delaySec = backoffDelays[delivery.retryCount] || 3600;
        const retryAfter = isDeadLetter ? null : new Date(Date.now() + delaySec * 1000);

        await db.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            retryCount: nextAttempt,
            status: isDeadLetter ? 'failed' : 'pending',
            error: errorMsg || 'Delivery attempt failed',
            retryAfter
          }
        });

        console.warn(`[Notification Queue] Failed delivery on channel ${channel} (attempt ${nextAttempt}/${delivery.maxAttempts}). Reason: ${errorMsg}`);
      }
    } catch (dbErr: any) {
      console.error('[Notification Queue] Failed to update delivery state:', dbErr.message);
    }
  }

  /**
   * Helper to dispatch SMTP email notifications via the new email queue system.
   */
  private static async sendEmail(notification: any): Promise<boolean> {
    if (!notification.userId) return true;

    const user = await db.user.findUnique({ where: { id: notification.userId } });
    if (!user || !user.email) return false;

    const panelName = (await db.setting.findUnique({ where: { key: 'panel_name' } }))?.value || 'CynexVM';
    const actionUrl = notification.actionUrl
      ? `${process.env.APP_URL || 'http://localhost:5173'}${notification.actionUrl}`
      : '';

    // Use a notification email template if available, otherwise fall back to inline
    const template = await EmailTemplateService.getTemplate('notification_alert').catch(() => null);
    if (template) {
      const rendered = EmailTemplateService.render(template, {
        panel_name: panelName,
        title: notification.title,
        message: notification.message,
        category: notification.category,
        priority: notification.priority,
        color: notification.color || '#3b82f6',
        action_url: actionUrl,
        time: new Date().toISOString()
      });
      await EmailQueue.enqueue({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        plainText: rendered.plainText,
        templateName: 'notification_alert',
        userId: user.id,
        metadata: { notificationId: notification.id, category: notification.category }
      });
    } else {
      const htmlBody = `
        <h2 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:0 0 8px 0">${notification.title}</h2>
        <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0">${notification.message}</p>
        ${actionUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td align="center" style="background-color:#2563eb;border-radius:8px"><a href="${actionUrl}" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">View Details</a></td></tr></table>` : ''}
        <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="font-size:12px;color:#9ca3af;margin:0">This is an automated notification from ${panelName}. Manage preferences in your Profile settings.</p>
      `;
      await EmailQueue.enqueue({
        to: user.email,
        subject: `[${notification.category}] ${notification.title}`,
        html: htmlBody,
        userId: user.id,
        metadata: { notificationId: notification.id, category: notification.category }
      });
    }

    return true;
  }

  /**
   * Helper to dispatch Discord Rich Embed Webhooks.
   */
  private static async sendDiscordWebhook(notification: any): Promise<boolean> {
    if (!notification.userId) return true; // Global announcements handle panel system banners only

    const prefs = await NotificationPreferences.getPreferences(notification.userId);
    if (!prefs.discordWebhookUrl) {
      throw new Error('Discord webhook URL is not configured in user preferences.');
    }

    // Convert hex color string to decimal for Discord Embed parameters
    let colorDecimal = 3447003; // Default blue
    if (notification.color) {
      try {
        colorDecimal = parseInt(notification.color.replace('#', ''), 16);
      } catch (_) {}
    }

    const payload = {
      embeds: [
        {
          title: notification.title,
          description: notification.message,
          color: colorDecimal,
          fields: [
            { name: 'Category', value: notification.category, inline: true },
            { name: 'Priority', value: notification.priority, inline: true }
          ],
          timestamp: notification.createdAt.toISOString(),
          footer: {
            text: 'CynexVM Alert Center'
          }
        }
      ]
    };

    const res = await fetch(prefs.discordWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Discord Webhook HTTP Error: ${res.status} - ${errText}`);
    }

    return true;
  }

  /**
   * Helper to dispatch Generic Webhook HTTP POST actions.
   */
  private static async sendGenericWebhook(notification: any): Promise<boolean> {
    if (!notification.userId) return true;

    const prefs = await NotificationPreferences.getPreferences(notification.userId);
    if (!prefs.webhookUrl) {
      throw new Error('Generic webhook target URL is not configured in user preferences.');
    }

    const res = await fetch(prefs.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CynexVM-Event': notification.sourceEvent || 'notification.event'
      },
      body: JSON.stringify({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        category: notification.category,
        priority: notification.priority,
        createdAt: notification.createdAt,
        metadata: notification.metadata ? JSON.parse(notification.metadata) : null
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Generic Webhook HTTP Error: ${res.status} - ${errText}`);
    }

    return true;
  }
}
