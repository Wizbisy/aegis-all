import { db } from '../../../db/prisma.js';

/**
 * Unified JSON readout of active intents and historical executions.
 * Exposed to the LLM Agent so it can report portfolio health.
 */
export async function getAgentWealthLedger(agentId: string) {
  const limitOrders = await db.limitOrder.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const dcaSchedules = await db.dcaSchedule.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return {
    limitOrders,
    dcaSchedules,
  };
}
