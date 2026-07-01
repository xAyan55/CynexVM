import { db } from '../../db';

export interface ChannelPreference {
  panel: boolean;
  websocket: boolean;
  email: boolean;
  discord: boolean;
  webhook: boolean;
}

export const DEFAULT_EVENT_PREFERENCES: Record<string, ChannelPreference> = {
  'instance.created': { panel: true, websocket: true, email: true, discord: false, webhook: true },
  'instance.deleted': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  'instance.started': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'instance.stopped': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'instance.rebooted': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'instance.killed': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  'instance.suspended': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  
  'deployment.started': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'deployment.completed': { panel: true, websocket: true, email: true, discord: false, webhook: true },
  'deployment.failed': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  
  'backup.started': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'backup.completed': { panel: true, websocket: true, email: true, discord: false, webhook: true },
  'backup.failed': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  
  'snapshot.created': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'snapshot.restored': { panel: true, websocket: true, email: true, discord: false, webhook: false },
  'snapshot.deleted': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  
  'image.download_finished': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'image.download_failed': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  
  'node.online': { panel: true, websocket: true, email: true, discord: false, webhook: true },
  'node.offline': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  'node.high_cpu': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'node.high_ram': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'node.low_disk': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  'node.maintenance': { panel: true, websocket: true, email: true, discord: false, webhook: false },
  
  'user.registered': { panel: true, websocket: true, email: true, discord: false, webhook: false },
  'user.login': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'user.login_failed': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  'user.password_changed': { panel: true, websocket: true, email: true, discord: false, webhook: false },
  'user.email_changed': { panel: true, websocket: true, email: true, discord: false, webhook: false },
  'user.api_token_created': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'user.api_token_deleted': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  
  'system.announcement': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  'system.maintenance': { panel: true, websocket: true, email: true, discord: true, webhook: true },
  'system.update_available': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  
  'task.completed': { panel: true, websocket: true, email: false, discord: false, webhook: false },
  'task.failed': { panel: true, websocket: true, email: true, discord: true, webhook: true }
};

export class NotificationPreferences {
  /**
   * Fetches or initializes preference model values for a User.
   */
  public static async getPreferences(userId: string) {
    let prefs = await db.notificationPreference.findUnique({
      where: { userId }
    });

    if (!prefs) {
      prefs = await db.notificationPreference.create({
        data: {
          userId,
          desktopEnabled: true,
          soundEnabled: true,
          soundProfile: 'default',
          emailEnabled: true,
          discordEnabled: true,
          webhookEnabled: true,
          mutedCategories: '[]',
          eventPreferences: JSON.stringify(DEFAULT_EVENT_PREFERENCES)
        }
      });
    }

    return prefs;
  }

  /**
   * Checks if a user has enabled notification delivery for a specific event and channel.
   */
  public static async shouldDeliver(userId: string, eventName: string, channel: keyof ChannelPreference, category: string): Promise<boolean> {
    const prefs = await this.getPreferences(userId);

    // 1. Check Mute category list
    try {
      const muted: string[] = JSON.parse(prefs.mutedCategories || '[]');
      if (muted.includes(category)) return false;
    } catch (_) {}

    // 2. Check Mute Until schedule
    if (prefs.muteUntil && new Date() < new Date(prefs.muteUntil)) {
      return false;
    }

    // 3. Check general channel master switch
    if (channel === 'email' && !prefs.emailEnabled) return false;
    if (channel === 'discord' && !prefs.discordEnabled) return false;
    if (channel === 'webhook' && !prefs.webhookEnabled) return false;
    if (channel === 'websocket' && !prefs.desktopEnabled) return false; // Desktop/WebSockets toggle boundary

    // 4. Check specific per-event channel preference
    try {
      const eventPrefs: Record<string, ChannelPreference> = JSON.parse(prefs.eventPreferences || '{}');
      const spec = eventPrefs[eventName] || DEFAULT_EVENT_PREFERENCES[eventName];
      if (spec && spec[channel] !== undefined) {
        return spec[channel];
      }
    } catch (_) {}

    // Default to fallback template matrix value
    const fallback = DEFAULT_EVENT_PREFERENCES[eventName];
    return fallback ? fallback[channel] : true;
  }
}
