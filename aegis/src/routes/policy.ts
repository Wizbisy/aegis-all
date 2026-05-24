import { Hono } from 'hono';
import { z } from 'zod';
import { agentAuth } from '../auth/middleware.js';
import { upsertLocalPolicy } from '../policy/engine.js';
import { db } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { completeIdempotency, failIdempotency, idempotencyMiddleware } from '../utils/idempotency.js';
import { fail } from '../utils/response.js';
import { getClientIp, slidingWindowRateLimit } from '../utils/ratelimit.js';
import type { AppBindings } from '../utils/types.js';
import { evmAddressSchema, usdcAmountSchema } from '../utils/validation.js';

export const policyRouter = new Hono<AppBindings>();

const policySchema = z.object({
  perTx: usdcAmountSchema.default('1'),
  daily: usdcAmountSchema.default('5'),
  weekly: usdcAmountSchema.default('20'),
  monthly: usdcAmountSchema.default('50'),
  walletAddress: evmAddressSchema.optional(),
}).refine((limits) => Number(limits.perTx) <= Number(limits.daily), 'perTx must be <= daily')
  .refine((limits) => Number(limits.daily) <= Number(limits.weekly), 'daily must be <= weekly')
  .refine((limits) => Number(limits.weekly) <= Number(limits.monthly), 'weekly must be <= monthly');

policyRouter.use('*', agentAuth);
policyRouter.use('*', slidingWindowRateLimit({
  name: 'policy',
  limit: 60,
  windowMs: 60 * 1000,
  key: (c) => c.get('agent').id || getClientIp(c),
}));

// GET /policy -> Reads local Aegis limits
policyRouter.get('/', async (c) => {
  const agent = c.get('agent');
  try {
    const policy = await db.agentPolicy.upsert({
      where: { agentId: agent.id },
      update: {},
      create: { agentId: agent.id },
    });

    return c.json({ success: true, policy });
  } catch (err) {
    return fail(c, err);
  }
});

