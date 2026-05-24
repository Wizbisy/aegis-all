import { Hono } from 'hono';
import { getWalletBalance, listAgentWallets } from '../../circle/wallet.js';
import { db } from '../../db/prisma.js';
import { fail } from '../../utils/response.js';

export const adminWalletRouter = new Hono();

adminWalletRouter.get('/', async (c) => {
  try {
    const wallets = await listAgentWallets();
    return c.json({ success: true, wallets });
  } catch (err) {
    return fail(c, err);
  }
});

adminWalletRouter.get('/balance', async (c) => {
  try {
    const agent = await db.agent.findFirst({
      where: { walletId: { not: null } },
      select: { walletId: true, walletAddress: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!agent?.walletId) {
      return c.json({ success: false, error: 'No wallet found' }, 404);
    }

    const balance = await getWalletBalance(agent.walletId);
    return c.json({ success: true, walletId: agent.walletId, walletAddress: agent.walletAddress, balance });
  } catch (err) {
    return fail(c, err);
  }
});
