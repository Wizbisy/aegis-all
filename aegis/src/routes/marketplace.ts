import { Hono } from 'hono';
import { z } from 'zod';
import { agentAuth } from '../auth/middleware.js';
import { fail } from '../utils/response.js';
import { getClientIp, slidingWindowRateLimit } from '../utils/ratelimit.js';
import { outboundHeaderSchema, serviceUrlSchema } from '../utils/validation.js';
import { inspectServicePayment, searchServices, getMarketplaceHistory } from '../services/marketplace/index.js';
import type { AppBindings, MarketplaceInspectOptions, MarketplaceSearchOptions } from '../utils/types.js';

export const marketplaceRouter = new Hono<AppBindings>();

const searchSchema = z.object({
  keyword: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(80).optional(),
  type: z.string().min(1).max(80).optional(),
  limit: z.number().int().positive().max(50).optional(),
  offset: z.number().int().min(0).max(500).optional(),
});

const inspectSchema = z.object({
  serviceUrl: serviceUrlSchema,
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  data: z.unknown().optional(),
  headers: z.array(outboundHeaderSchema).max(10).optional(),
});

marketplaceRouter.use('*', agentAuth);
marketplaceRouter.use('*', slidingWindowRateLimit({
  name: 'marketplace',
  limit: 90,
  windowMs: 60 * 1000,
  key: (c) => c.get('agent')?.id ?? getClientIp(c),
}));

marketplaceRouter.get('/', (c) => {
  return c.json({
    success: true,
    routes: {
      search: 'POST /v1/marketplace/search',
      inspect: 'POST /v1/marketplace/inspect',
      history: 'GET /v1/marketplace/history',
    },
  });
});

marketplaceRouter.post('/search', async (c) => {
  const parsed = searchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid search payload' }, 400);
  }

  try {
    const searchOptions: MarketplaceSearchOptions = {
      ...(parsed.data.keyword ? { keyword: parsed.data.keyword } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
      ...(parsed.data.offset !== undefined ? { offset: parsed.data.offset } : {}),
    };
    const results = await searchServices(searchOptions);
    return c.json({ success: true, results });
  } catch (err) {
    return fail(c, err);
  }
});

marketplaceRouter.post('/inspect', async (c) => {
  const parsed = inspectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid inspect payload' }, 400);
  }

  try {
    const inspectOptions: MarketplaceInspectOptions = {
      serviceUrl: parsed.data.serviceUrl,
      ...(parsed.data.method ? { method: parsed.data.method } : {}),
      ...(parsed.data.data !== undefined ? { data: parsed.data.data } : {}),
      ...(parsed.data.headers ? { headers: parsed.data.headers } : {}),
    };
    const result = await inspectServicePayment(inspectOptions);
    return c.json({ success: true, result });
  } catch (err) {
    return fail(c, err);
  }
});

marketplaceRouter.get('/history', async (c) => {
  try {
    const logs = await getMarketplaceHistory(c.get('agent').id);
    return c.json({ success: true, logs });
  } catch (err) {
    return fail(c, err);
  }
});
