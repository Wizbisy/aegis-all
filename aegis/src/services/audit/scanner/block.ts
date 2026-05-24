import { db } from '../../../db/prisma.js';

export interface HistoricalTrade {
  id: string;
  action: string;
  amountUsdc: number;
  signature: string | null;
  metadata: {
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: string;
    amountOut?: string;
    priceIn?: number;
    priceOut?: number;
    [key: string]: any;
  };
  createdAt: Date;
}

/**
 * Scrapes and aggregates historical wealth engine transaction logs 
 * from the database to construct a clean trade execution history.
 */
export async function getHistoricalTrades(agentId: string): Promise<HistoricalTrade[]> {
  const logs = await db.auditLog.findMany({
    where: {
      agentId,
      status: 'SUCCESS',
      action: {
        in: ['TOKEN_SWAP', 'COPY_TRADE', 'YIELD_DEPOSIT', 'YIELD_WITHDRAW', 'WEALTH_AUTO_LIMIT_ORDER', 'WEALTH_AUTO_DCA', 'MULTI_YIELD_DEPOSIT'],
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return logs.map((log) => {
    const rawMetadata = (log.metadata as any) || {};
    return {
      id: log.id,
      action: log.action,
      amountUsdc: log.amountUsdc ? Number(log.amountUsdc) : 0,
      signature: log.signature,
      metadata: {
        tokenIn: rawMetadata.tokenIn,
        tokenOut: rawMetadata.tokenOut,
        amountIn: rawMetadata.amountIn,
        amountOut: rawMetadata.amountOut,
        priceIn: rawMetadata.priceIn,
        priceOut: rawMetadata.priceOut,
        ...rawMetadata,
      },
      createdAt: log.createdAt,
    };
  });
}
