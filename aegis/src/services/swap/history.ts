import { db } from '../../db/prisma.js';

export interface SwapHistoryItem {
  id: string;
  action: string;
  amountUsdc: string;
  status: string;
  txHash: string | null;
  tokenIn: string;
  tokenOut: string;
  slippageBps: number | null;
  createdAt: Date;
}

/**
 * Retrieves the historical swaps executed by a specific autonomous agent,
 * automatically parsing raw JSON metadata fields into typed representations.
 */
export async function getSwapHistory(agentId: string, limit = 50): Promise<SwapHistoryItem[]> {
  const logs = await db.auditLog.findMany({
    where: {
      agentId,
      action: 'TOKEN_SWAP',
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  return logs.map((log) => {
    const metadata = (log.metadata as any) || {};
    return {
      id: log.id,
      action: log.action,
      amountUsdc: log.amountUsdc ? log.amountUsdc.toString() : '0',
      status: log.status,
      txHash: log.signature,
      tokenIn: metadata.tokenIn || 'USDC',
      tokenOut: metadata.tokenOut || 'EURC',
      slippageBps: metadata.slippageBps !== undefined ? Number(metadata.slippageBps) : null,
      createdAt: log.createdAt,
    };
  });
}
