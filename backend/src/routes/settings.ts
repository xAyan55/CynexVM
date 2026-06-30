import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/v1/settings
 * @desc    Retrieves all settings key-value pairs (Public)
 */
router.get('/', async (req, res) => {
  try {
    const list = await db.setting.findMany();
    const settingsMap = list.reduce((acc: any, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});
    return res.status(200).json(settingsMap);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

/**
 * @route   POST /api/v1/settings
 * @desc    Updates system configuration settings
 */
router.post('/', authenticate, requirePermission('settings.write'), async (req, res) => {
  const settings = req.body; // JSON object of keys and values
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings payload must be a JSON object' });
  }

  try {
    const updates = Object.entries(settings).map(([key, value]) => {
      return db.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    });

    await Promise.all(updates);

    // If vps_motd is updated, update /etc/motd in all currently running containers asynchronously
    if (settings.vps_motd !== undefined) {
      (async () => {
        try {
          const runningInstances = await db.instance.findMany({
            where: { status: 'running' }
          });
          const { LxdClient } = require('../services/lxd/lxdClient');
          for (const inst of runningInstances) {
            try {
              const containerName = `cynex-${inst.vmid}`;
              await LxdClient.request(
                inst.nodeId,
                `/1.0/instances/${containerName}/exec`,
                'POST',
                {
                  command: ['sh', '-c', `echo "${String(settings.vps_motd).replace(/"/g, '\\"')}" > /etc/motd`],
                  environment: {},
                  'wait-for-variables': true,
                  record: false
                }
              );
            } catch (_) {}
          }
        } catch (_) {}
      })();
    }

    await db.auditLog.create({
      data: {
        action: 'settings.write',
        details: `Updated settings: ${Object.keys(settings).join(', ')}`,
        severity: 'warning'
      }
    });

    return res.status(200).json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default router;
