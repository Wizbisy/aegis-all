import { Hono } from 'hono';
import { z } from 'zod';
import { searchServices } from '../../services/marketplace/search.js';
import { fail } from '../../utils/response.js';

export const adminMarketplaceRouter = new Hono();
const marketplaceQuerySchema = z.string().trim().min(1).max(120);

adminMarketplaceRouter.get('/search', async (c) => {
  const parsedQuery = marketplaceQuerySchema.safeParse(c.req.query('q') ?? 'arc');
  if (!parsedQuery.success) {
    return c.json({ success: false, error: parsedQuery.error.issues[0]?.message ?? 'Invalid search query' }, 400);
  }

  const keyword = parsedQuery.data;
  try {
    const results = await searchServices({ keyword, limit: 20 });
    return c.json({ success: true, results });
  } catch (err) {
    return fail(c, err);
  }
});
