import { Router } from 'express';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/v1/audit-logs
 * @desc    Lists system audit logs with pagination and search filtering
 */
router.get('/', authenticate, requireRole('Admin'), async (req, res) => {
  const page = parseInt(req.query.page as string || '1', 10);
  const limit = parseInt(req.query.limit as string || '20', 10);
  const search = req.query.search as string || '';
  const severity = req.query.severity as string || '';
  
  const skip = (page - 1) * limit;

  try {
    const where: any = {};
    
    if (severity) {
      where.severity = severity;
    }

    if (search) {
      where.OR = [
        { username: { contains: search } },
        { action: { contains: search } },
        { details: { contains: search } }
      ];
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { username: true, email: true }
          }
        }
      }),
      db.auditLog.count({ where })
    ]);

    return res.status(200).json({
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

export default router;
