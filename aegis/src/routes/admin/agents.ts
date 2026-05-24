import { Hono } from 'hono';
import { z } from 'zod';
import { suspendAgent, reactivateAgent, revokeAgentTokens } from '../../auth/lifecycle.js';
import { db } from '../../db/prisma.js';
import { logAuditAction } from '../../utils/audit.js';
import { fail } from '../../utils/response.js';

export const adminAgentsRouter = new Hono();

const agentIdParamSchema = z.object({
  agentId: z.string().uuid(),
});

const suspendBodySchema = z.object({
  reason: z.string().trim().min(3).max(120).optional(),
});

const policyUpdateBodySchema = z.object({
  perTxLimitUsdc: z.number().positive().optional(),
  dailyLimitUsdc: z.number().positive().optional(),
  weeklyLimitUsdc: z.number().positive().optional(),
  monthlyLimitUsdc: z.number().positive().optional(),
});

adminAgentsRouter.get('/', async (c) => {
  try {
    const agents = await db.agent.findMany({
      include: { policy: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return c.json({ success: true, agents });
  } catch (err) {
    return fail(c, err);
  }
});

adminAgentsRouter.patch('/:agentId/policy', async (c) => {
  const params = agentIdParamSchema.safeParse(c.req.param());
  if (!params.success) {
    return c.json({ success: false, error: params.error.issues[0]?.message ?? 'Invalid agent id' }, 400);
  }

  const body = policyUpdateBodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ success: false, error: body.error.issues[0]?.message ?? 'Invalid policy payload' }, 400);
  }

  try {
    const policy = await db.agentPolicy.update({
      where: { agentId: params.data.agentId },
      data: {
        ...(body.data.perTxLimitUsdc !== undefined ? { perTxLimitUsdc: body.data.perTxLimitUsdc } : {}),
        ...(body.data.dailyLimitUsdc !== undefined ? { dailyLimitUsdc: body.data.dailyLimitUsdc } : {}),
        ...(body.data.weeklyLimitUsdc !== undefined ? { weeklyLimitUsdc: body.data.weeklyLimitUsdc } : {}),
        ...(body.data.monthlyLimitUsdc !== undefined ? { monthlyLimitUsdc: body.data.monthlyLimitUsdc } : {}),
      },
    });

    await logAuditAction(params.data.agentId, 'ADMIN_POLICY_UPDATE', null, { 
      newPolicy: body.data 
    });

    return c.json({ success: true, policy });
  } catch (err) {
    return fail(c, err);
  }
});

adminAgentsRouter.patch('/:agentId/suspend', async (c) => {
  const params = agentIdParamSchema.safeParse(c.req.param());
  if (!params.success) {
    return c.json({ success: false, error: params.error.issues[0]?.message ?? 'Invalid agent id' }, 400);
  }

  const body = suspendBodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ success: false, error: body.error.issues[0]?.message ?? 'Invalid suspension payload' }, 400);
  }

  try {
    const result = await suspendAgent(params.data.agentId, body.data.reason ?? 'SUSPENDED_BY_ADMIN');
    await logAuditAction(params.data.agentId, 'ADMIN_AGENT_SUSPEND', null, { reason: body.data.reason ?? 'ADMIN_ACTION' });
    return c.json({ success: true, ...result });
  } catch (err) {
    return fail(c, err);
  }
});

adminAgentsRouter.patch('/:agentId/reactivate', async (c) => {
  const params = agentIdParamSchema.safeParse(c.req.param());
  if (!params.success) {
    return c.json({ success: false, error: params.error.issues[0]?.message ?? 'Invalid agent id' }, 400);
  }

  try {
    const agent = await reactivateAgent(params.data.agentId);
    await logAuditAction(params.data.agentId, 'ADMIN_AGENT_REACTIVATE', null, { reason: 'ADMIN_ACTION' });
    return c.json({ success: true, agent });
  } catch (err) {
    return fail(c, err);
  }
});

adminAgentsRouter.post('/:agentId/revoke-tokens', async (c) => {
  const params = agentIdParamSchema.safeParse(c.req.param());
  if (!params.success) {
    return c.json({ success: false, error: params.error.issues[0]?.message ?? 'Invalid agent id' }, 400);
  }

  try {
    const result = await revokeAgentTokens(params.data.agentId);
    await logAuditAction(params.data.agentId, 'ADMIN_AGENT_REVOKE_TOKENS', null, { reason: 'ADMIN_ACTION' });
    return c.json({ success: true, ...result });
  } catch (err) {
    return fail(c, err);
  }
});
