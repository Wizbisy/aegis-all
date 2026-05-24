import { Hono } from 'hono';
import { getPlatformStats } from '../../utils/statscache.js';
import { fail } from '../../utils/response.js';

export const adminDashboardRouter = new Hono();

adminDashboardRouter.get('/', async (c) => {
  try {
    return c.json({ success: true, dashboard: await getPlatformStats() });
  } catch (err) {
    return fail(c, err);
  }
});
