import { Hono } from 'hono';
import { db } from '../../db/prisma.js';
import { fail } from '../../utils/response.js';

export const adminWealthRouter = new Hono();

adminWealthRouter.get('/intents', async (c) => {
  try {
    const [limitOrders, dcaSchedules] = await Promise.all([
      db.limitOrder.findMany({ orderBy: { createdAt: 'desc' } }),
      db.dcaSchedule.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);
    return c.json({ success: true, limitOrders, dcaSchedules });
  } catch (err) {
    return fail(c, err);
  }
});
