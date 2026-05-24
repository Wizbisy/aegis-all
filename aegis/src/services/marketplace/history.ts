import { db } from '../../db/prisma.js';

/**
 * Retrieves recent marketplace payment history for an agent.
 */
export function getMarketplaceHistory(agentId: string, take = 50) {
  return db.auditLog.findMany({
    where: { agentId, action: 'X402_PAY' },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
