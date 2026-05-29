import { db } from '../../../db/prisma.js';

export async function summarizePortfolioMetrics(agentId: string) {
  const executedOrders = await db.limitOrder.count({
    where: { agentId, status: 'EXECUTED' }
  });

  const failedOrders = await db.limitOrder.count({
    where: { agentId, status: 'FAILED' }
  });

  const activeDcas = await db.dcaSchedule.count({
    where: { agentId, status: 'ACTIVE' }
  });

  const completedDcas = await db.dcaSchedule.count({
    where: { agentId, status: 'COMPLETED' }
  });

  return {
    status: 'ACTIVE',
    healthScore: failedOrders === 0 ? 100 : Math.max(0, 100 - (failedOrders * 5)),
    metrics: {
      successfulTrades: executedOrders,
      failedTrades: failedOrders,
      activeDcaStreams: activeDcas,
      completedDcaStreams: completedDcas,
    },
    message: 'Portfolio operating optimally under autonomous execution.',
  };
}
