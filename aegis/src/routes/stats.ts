import { Hono } from 'hono';
import { adminAuth } from '../auth/middleware.js';
import { db } from '../db/prisma.js';
import { fail } from '../utils/response.js';

export const statsRouter = new Hono();
statsRouter.use('*', adminAuth);

statsRouter.get('/', async (c) => {
  try {
    const [agents, actions, successfulActions, failedActions] = await Promise.all([
      db.agent.count(),
      db.auditLog.count(),
      db.auditLog.count({ where: { status: 'SUCCESS' } }),
      db.auditLog.count({ where: { status: 'FAILED' } }),
    ]);

    const volume = await db.auditLog.aggregate({
      where: { status: 'SUCCESS', amountUsdc: { not: null } },
      _sum: { amountUsdc: true },
    });

    return c.json({
      success: true,
      stats: {
        agents,
        actions,
        successfulActions,
        failedActions,
        successfulVolumeUsdc: String(volume._sum.amountUsdc ?? 0),
      },
    });
  } catch (err) {
    return fail(c, err);
  }
});
