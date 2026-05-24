import { Hono } from 'hono';
import { db } from '../../db/prisma.js';
import { fail } from '../../utils/response.js';

export const adminTransactionsRouter = new Hono();

adminTransactionsRouter.get('/', async (c) => {
  try {
    const transactions = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { agent: { select: { id: true, email: true, walletId: true, walletAddress: true } } },
    });
    return c.json({ success: true, transactions });
  } catch (err) {
    return fail(c, err);
  }
});
