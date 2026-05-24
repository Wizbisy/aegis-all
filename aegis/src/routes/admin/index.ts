import { Hono } from 'hono';
import { adminAuth } from '../../auth/middleware.js';
import { db } from '../../db/prisma.js';
import { getClientIp, slidingWindowRateLimit } from '../../utils/ratelimit.js';
import { fail } from '../../utils/response.js';
import { adminAgentsRouter } from './agents.js';
import { adminAuthRouter } from './auth.js';
import { adminDashboardRouter } from './dashboard.js';
import { adminMarketplaceRouter } from './marketplace.js';
import { adminReferralRouter } from './referral.js';
import { adminTransactionsRouter } from './transactions.js';
import { adminWalletRouter } from './wallet.js';
import { adminYieldRouter } from './yield.js';
import { adminWealthRouter } from './wealth.js';
import { checkSystemHealth } from '../../services/health.js';

export const adminRouter = new Hono();

adminRouter.use('*', adminAuth);
adminRouter.use('*', slidingWindowRateLimit({
  name: 'admin',
  limit: 120,
  windowMs: 60 * 1000,
  key: getClientIp,
}));

adminRouter.get('/', (c) => {
  return c.json({
    success: true,
    routes: {
      auth: 'GET /v1/admin/auth/session',
      agents: 'GET /v1/admin/agents',
      agentSuspend: 'PATCH /v1/admin/agents/:agentId/suspend',
      agentReactivate: 'PATCH /v1/admin/agents/:agentId/reactivate',
      agentRevokeTokens: 'POST /v1/admin/agents/:agentId/revoke-tokens',
      dashboard: 'GET /v1/admin/dashboard',
      marketplace: 'GET /v1/admin/marketplace/search',
      referral: 'GET /v1/admin/referral',
      transactions: 'GET /v1/admin/transactions',
      wallet: 'GET /v1/admin/wallet',
      yield: 'GET /v1/admin/yield/vaults',
      stats: 'GET /v1/admin/stats',
      audits: 'GET /v1/admin/audits',
      health: 'GET /v1/admin/health',
      wealthIntents: 'GET /v1/admin/wealth/intents',
    },
  });
});

adminRouter.route('/auth', adminAuthRouter);
adminRouter.route('/agents', adminAgentsRouter);
adminRouter.route('/dashboard', adminDashboardRouter);
adminRouter.route('/marketplace', adminMarketplaceRouter);
adminRouter.route('/referral', adminReferralRouter);
adminRouter.route('/transactions', adminTransactionsRouter);
adminRouter.route('/wallet', adminWalletRouter);
adminRouter.route('/yield', adminYieldRouter);
adminRouter.route('/wealth', adminWealthRouter);

adminRouter.get('/stats', async (c) => {
  try {
    const [agentCount, txCount, failedTxCount] = await Promise.all([
      db.agent.count(),
      db.auditLog.count(),
      db.auditLog.count({ where: { status: 'FAILED' } }),
    ]);
    return c.json({ success: true, agentCount, txCount, failedTxCount });
  } catch (err) {
    return fail(c, err);
  }
});

adminRouter.get('/audits', async (c) => {
  try {
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { agent: { select: { id: true, email: true, walletId: true, walletAddress: true } } }
    });
    return c.json({ success: true, logs });
  } catch (err) {
    return fail(c, err);
  }
});

adminRouter.get('/health', async (c) => {
  try {
    const health = await checkSystemHealth();
    return c.json({ success: true, ...health });
  } catch (err) {
    return fail(c, err);
  }
});
