import { Router } from 'express';
import { db } from '../db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { NotificationService } from '../services/notification/notificationService';
import { NotificationPreferences } from '../services/notification/notificationPreferences';
import { SocketService } from '../services/socketService';

const router = Router();

/**
 * @route   GET /api/v1/notifications
 * @desc    Fetch paginated notifications with filters
 */
router.get('/', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const page = parseInt(req.query.page as string || '1', 10);
  const limit = parseInt(req.query.limit as string || '20', 10);
  const skip = (page - 1) * limit;

  const category = req.query.category as string;
  const priority = req.query.priority as string;
  const readStr = req.query.read as string;
  const q = req.query.q as string;

  const whereClause: any = {
    userId: req.user.id
  };

  if (category) whereClause.category = category;
  if (priority) whereClause.priority = priority;
  if (readStr === 'true') whereClause.read = true;
  if (readStr === 'false') whereClause.read = false;

  if (q) {
    whereClause.OR = [
      { title: { contains: q } },
      { message: { contains: q } }
    ];
  }

  try {
    const total = await db.notification.count({ where: whereClause });
    const items = await db.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    return res.status(200).json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * @route   GET /api/v1/notifications/unread
 * @desc    Fetch unread count
 */
router.get('/unread', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const count = await db.notification.count({
      where: {
        userId: req.user.id,
        read: false
      }
    });

    return res.status(200).json({ count });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

/**
 * @route   POST /api/v1/notifications/read/:id
 * @desc    Mark a single notification as read
 */
router.post('/read/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const notif = await db.notification.findUnique({ where: { id: req.params.id } });
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    if (notif.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const updated = await db.notification.update({
      where: { id: req.params.id },
      data: {
        read: true,
        readAt: new Date()
      }
    });

    // Notify all other browser tabs of the status update in real-time
    SocketService.emitToUser(req.user.id, 'notification.sync', { action: 'read', id: notif.id });

    return res.status(200).json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * @route   POST /api/v1/notifications/read-all
 * @desc    Mark all notifications as read
 */
router.post('/read-all', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await db.notification.updateMany({
      where: {
        userId: req.user.id,
        read: false
      },
      data: {
        read: true,
        readAt: new Date()
      }
    });

    // Sync tabs
    SocketService.emitToUser(req.user.id, 'notification.sync', { action: 'read-all' });

    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete a notification
 */
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const notif = await db.notification.findUnique({ where: { id: req.params.id } });
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    if (notif.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await db.notification.delete({ where: { id: req.params.id } });

    // Sync tabs
    SocketService.emitToUser(req.user.id, 'notification.sync', { action: 'delete', id: req.params.id });

    return res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

/**
 * @route   DELETE /api/v1/notifications/read
 * @desc    Prune all read notifications for user
 */
router.delete('/read', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await db.notification.deleteMany({
      where: {
        userId: req.user.id,
        read: true
      }
    });

    // Sync tabs
    SocketService.emitToUser(req.user.id, 'notification.sync', { action: 'delete-all-read' });

    return res.status(200).json({ success: true, message: 'All read notifications pruned' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to prune notifications' });
  }
});

/**
 * @route   GET /api/v1/notifications/preferences
 * @desc    Fetch preferences
 */
router.get('/preferences', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const prefs = await NotificationPreferences.getPreferences(req.user.id);
    return res.status(200).json(prefs);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * @route   PUT /api/v1/notifications/preferences
 * @desc    Update preferences
 */
router.put('/preferences', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const {
    desktopEnabled,
    soundEnabled,
    soundProfile,
    emailEnabled,
    discordEnabled,
    discordWebhookUrl,
    webhookEnabled,
    webhookUrl,
    mutedCategories,
    muteUntil,
    retentionDays,
    eventPreferences
  } = req.body;

  try {
    const data: any = {};
    if (desktopEnabled !== undefined) data.desktopEnabled = desktopEnabled;
    if (soundEnabled !== undefined) data.soundEnabled = soundEnabled;
    if (soundProfile !== undefined) data.soundProfile = soundProfile;
    if (emailEnabled !== undefined) data.emailEnabled = emailEnabled;
    if (discordEnabled !== undefined) data.discordEnabled = discordEnabled;
    if (discordWebhookUrl !== undefined) data.discordWebhookUrl = discordWebhookUrl;
    if (webhookEnabled !== undefined) data.webhookEnabled = webhookEnabled;
    if (webhookUrl !== undefined) data.webhookUrl = webhookUrl;
    if (mutedCategories !== undefined) data.mutedCategories = typeof mutedCategories === 'string' ? mutedCategories : JSON.stringify(mutedCategories);
    if (muteUntil !== undefined) data.muteUntil = muteUntil ? new Date(muteUntil) : null;
    if (retentionDays !== undefined) data.retentionDays = parseInt(retentionDays, 10);
    if (eventPreferences !== undefined) data.eventPreferences = typeof eventPreferences === 'string' ? eventPreferences : JSON.stringify(eventPreferences);

    const updated = await db.notificationPreference.update({
      where: { userId: req.user.id },
      data
    });

    return res.status(200).json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * @route   POST /api/v1/admin/notifications/broadcast
 * @desc    Broadcast a system-wide announcement banner or alert (Admin Only)
 */
router.post('/admin/broadcast', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  // Verify Admin role
  const user = await db.user.findUnique({
    where: { id: req.user.id },
    include: { roles: { include: { role: true } } }
  });
  if (user?.roles[0]?.role.name !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Admin role required' });
  }

  const { title, message, type, targetAudience, targetValue, scheduledStart, scheduledEnd } = req.body;
  if (!title || !message || !type) {
    return res.status(400).json({ error: 'Title, message, and banner type are required.' });
  }

  try {
    const announcement = await NotificationService.broadcast(
      title,
      message,
      type,
      targetAudience || 'all',
      targetValue || null,
      scheduledStart ? new Date(scheduledStart) : null,
      scheduledEnd ? new Date(scheduledEnd) : null
    );

    return res.status(201).json(announcement);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to dispatch system broadcast' });
  }
});

/**
 * @route   GET /api/v1/admin/notifications/analytics
 * @desc    Retrieve analytics metrics & dashboard diagnostics (Admin Only)
 */
router.get('/admin/analytics', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const user = await db.user.findUnique({
    where: { id: req.user.id },
    include: { roles: { include: { role: true } } }
  });
  if (user?.roles[0]?.role.name !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Admin role required' });
  }

  try {
    const totalSent = await db.notification.count();
    const totalRead = await db.notification.count({ where: { read: true } });
    
    // Delivery breakdowns
    const totalDeliveries = await db.notificationDelivery.count();
    const successDeliveries = await db.notificationDelivery.count({ where: { status: 'success' } });
    const failedDeliveries = await db.notificationDelivery.count({ where: { status: 'failed' } });
    const pendingDeliveries = await db.notificationDelivery.count({ where: { status: 'pending' } });

    // Category breakdowns
    const categories = await db.notification.groupBy({
      by: ['category'],
      _count: { id: true }
    });

    // Read Time calculation: average difference between readAt and createdAt
    const readNotifications = await db.notification.findMany({
      where: { read: true, NOT: { readAt: null } },
      select: { createdAt: true, readAt: true },
      take: 100 // Sample size for high performance
    });

    let totalDiff = 0;
    readNotifications.forEach(n => {
      if (n.readAt) {
        totalDiff += n.readAt.getTime() - n.createdAt.getTime();
      }
    });
    const avgReadTimeMs = readNotifications.length > 0 ? totalDiff / readNotifications.length : 0;

    return res.status(200).json({
      totalSent,
      totalRead,
      readRate: totalSent > 0 ? (totalRead / totalSent) * 100 : 0,
      avgReadTimeSec: avgReadTimeMs / 1000,
      deliveries: {
        total: totalDeliveries,
        success: successDeliveries,
        failed: failedDeliveries,
        pending: pendingDeliveries
      },
      categories: categories.map(c => ({ name: c.category, count: c._count.id }))
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
