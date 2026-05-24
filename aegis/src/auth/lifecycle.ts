import { db } from '../db/prisma.js';

export async function suspendAgent(agentId: string, reason = 'SUSPENDED_BY_ADMIN') {
  return db.$transaction(async (tx) => {
    const agent = await tx.agent.update({
      where: { id: agentId },
      data: { isActive: false },
      select: { id: true, email: true, isActive: true, updatedAt: true },
    });

    const revoked = await tx.agentApiToken.updateMany({
      where: {
        agentId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    return { agent, revokedCount: revoked.count };
  });
}

export async function reactivateAgent(agentId: string) {
  return db.agent.update({
    where: { id: agentId },
    data: { isActive: true },
    select: { id: true, email: true, isActive: true, updatedAt: true },
  });
}

export async function revokeAgentTokens(agentId: string, reason = 'REVOKED_BY_ADMIN') {
  const revoked = await db.agentApiToken.updateMany({
    where: {
      agentId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });

  return { revokedCount: revoked.count };
}