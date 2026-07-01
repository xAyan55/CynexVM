import { db } from '../../db';
import { templates, renderTemplate } from './notificationTemplates';
import { NotificationPreferences } from './notificationPreferences';
import { NotificationDispatcher } from './notificationDispatcher';

export class NotificationService {
  /**
   * Triggers a system event and spawns appropriate persistent notifications.
   * Implements real-time deduplication and background delivery queue registration.
   */
  public static async notify(
    userId: string | null,
    eventName: string,
    variables: Record<string, any> = {},
    customMetadata: any = null
  ) {
    const template = templates[eventName];
    if (!template) {
      console.warn(`[Notification] Triggered unknown event: ${eventName}`);
      return null;
    }

    const title = renderTemplate(template.title, variables);
    const message = renderTemplate(template.message, variables);
    const category = template.category;
    const priority = template.priority;
    const icon = template.icon;
    const color = template.color;
    const actionUrl = template.actionUrl ? renderTemplate(template.actionUrl, variables) : null;

    let notification: any = null;

    // Deduplication strategy: Check if there's an identical unread notification for the same user & event within the last 5 minutes
    if (userId) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const existing = await db.notification.findFirst({
        where: {
          userId,
          sourceEvent: eventName,
          read: false,
          createdAt: { gte: fiveMinutesAgo }
        }
      });

      if (existing) {
        // Retrieve or initialize the deduplication group list
        let groupMeta: any[] = [];
        try {
          const metaParsed = existing.metadata ? JSON.parse(existing.metadata) : {};
          groupMeta = metaParsed.groupItems || [];
        } catch (_) {}

        // Add this new sub-item to the list
        groupMeta.push({
          title,
          message,
          timestamp: new Date().toISOString(),
          variables
        });

        const totalCount = groupMeta.length + 1;
        
        // Render a grouped message e.g. "3 Containers Started"
        let groupedTitle = `${totalCount} ${category} Events`;
        if (eventName.includes('started')) groupedTitle = `${totalCount} Containers Started`;
        if (eventName.includes('stopped')) groupedTitle = `${totalCount} Containers Stopped`;
        if (eventName.includes('rebooted')) groupedTitle = `${totalCount} Containers Restarted`;
        if (eventName.includes('backup')) groupedTitle = `${totalCount} Backup Events`;

        notification = await db.notification.update({
          where: { id: existing.id },
          data: {
            title: groupedTitle,
            message: `Multiple related events have occurred. Expand to view details.`,
            createdAt: new Date(), // bump to top
            metadata: JSON.stringify({
              ...customMetadata,
              groupItems: groupMeta
            })
          }
        });
      }
    }

    if (!notification) {
      // Normal non-deduplicated notification path
      notification = await db.notification.create({
        data: {
          userId,
          title,
          message,
          category,
          priority,
          icon,
          color,
          actionUrl,
          sourceEvent: eventName,
          metadata: customMetadata ? JSON.stringify(customMetadata) : null
        }
      });
    }

    // Register delivery tasks for all enabled channels
    const channels: ('panel' | 'websocket' | 'email' | 'discord' | 'webhook')[] = ['panel', 'websocket'];

    if (userId) {
      // Fetch channel permissions from user preferences
      const hasEmail = await NotificationPreferences.shouldDeliver(userId, eventName, 'email', category);
      const hasDiscord = await NotificationPreferences.shouldDeliver(userId, eventName, 'discord', category);
      const hasWebhook = await NotificationPreferences.shouldDeliver(userId, eventName, 'webhook', category);

      if (hasEmail) channels.push('email');
      if (hasDiscord) channels.push('discord');
      if (hasWebhook) channels.push('webhook');
    }

    // Save pending deliveries
    const deliveryInserts = channels.map(channel => ({
      notificationId: notification.id,
      channel,
      status: 'pending',
      maxAttempts: channel === 'websocket' || channel === 'panel' ? 1 : 5
    }));

    await db.notificationDelivery.createMany({
      data: deliveryInserts
    });

    // Fire queue process immediately in background
    process.nextTick(() => {
      NotificationDispatcher.startPoller();
    });

    return notification;
  }

  /**
   * Broadcasts a system-wide announcement banner.
   */
  public static async broadcast(
    title: string,
    message: string,
    type: 'banner' | 'maintenance' | 'emergency',
    targetAudience: 'all' | 'admins' | 'roles' | 'users' = 'all',
    targetValue: string | null = null,
    scheduledStart: Date | null = null,
    scheduledEnd: Date | null = null
  ) {
    const announcement = await db.announcement.create({
      data: {
        title,
        message,
        type,
        targetAudience,
        targetValue,
        scheduledStart,
        scheduledEnd
      }
    });

    // Notify all active clients in real-time
    const { SocketService } = require('../socketService');
    SocketService.emitToAll('announcement.new', announcement);

    // Also write a persistent System notification for users matching the target audience
    let matchedUsers: any[] = [];
    if (targetAudience === 'all') {
      matchedUsers = await db.user.findMany({ select: { id: true } });
    } else if (targetAudience === 'admins') {
      matchedUsers = await db.user.findMany({
        where: { roles: { some: { role: { name: 'Admin' } } } },
        select: { id: true }
      });
    } else if (targetAudience === 'users' && targetValue) {
      const userIds = targetValue.split(',').map(x => x.trim());
      matchedUsers = userIds.map(id => ({ id }));
    }

    for (const u of matchedUsers) {
      await this.notify(u.id, 'system.announcement', { message: `${title}: ${message}` });
    }

    return announcement;
  }

  /**
   * Cleans up expired notifications or entries exceeding user retention limits.
   */
  public static async cleanExpiredNotifications() {
    try {
      // 1. Delete notifications that passed their custom expiration dates
      await db.notification.deleteMany({
        where: {
          expiration: { lte: new Date() }
        }
      });

      // 2. Query user preferences to prune records exceeding retention period
      const prefs = await db.notificationPreference.findMany();
      for (const p of prefs) {
        const thresholdDate = new Date(Date.now() - p.retentionDays * 24 * 60 * 60 * 1000);
        await db.notification.deleteMany({
          where: {
            userId: p.userId,
            createdAt: { lte: thresholdDate }
          }
        });
      }
    } catch (err: any) {
      console.error('[Notification CleanUp] Scheduled maintenance failed:', err.message);
    }
  }
}
