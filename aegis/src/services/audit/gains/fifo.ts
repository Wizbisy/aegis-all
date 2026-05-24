import type { HistoricalTrade } from '../scanner/block.js';

export interface TaxLot {
  amount: number;
  priceUsd: number;
  timestamp: Date;
}

export interface RealizedGainEvent {
  token: string;
  amount: number;
  costBasis: number;
  saleValue: number;
  realizedGain: number;
  buyTimestamp: Date;
  sellTimestamp: Date;
}

/**
 * Calculates the realized capital gains or losses for a set of historical trades
 * using the FIFO inventory tax lots allocation strategy.
 */
export function calculateFIFOGains(trades: HistoricalTrade[]): {
  realizedGains: RealizedGainEvent[];
  remainingLots: Record<string, TaxLot[]>;
  totalRealized: number;
} {
  const remainingLots: Record<string, TaxLot[]> = {};
  const realizedGains: RealizedGainEvent[] = [];
  let totalRealized = 0;

  for (const trade of trades) {
    const isSwap = ['TOKEN_SWAP', 'COPY_TRADE', 'WEALTH_AUTO_LIMIT_ORDER', 'WEALTH_AUTO_DCA', 'MULTI_YIELD_DEPOSIT', 'YIELD_DEPOSIT', 'YIELD_WITHDRAW', 'TAX_LOSS_HARVEST'].includes(trade.action);
    if (!isSwap) continue;

    let tokenIn = trade.metadata.tokenIn;
    let tokenOut = trade.metadata.tokenOut;
    let amountInStr = trade.metadata.amountIn;
    let amountOutStr = trade.metadata.amountOut;

    if (trade.action === 'YIELD_DEPOSIT') {
      tokenIn = 'USDC';
      tokenOut = 'AEGIS_VAULT_LP';
      amountInStr = trade.amountUsdc.toString();
      amountOutStr = trade.amountUsdc.toString();
    } else if (trade.action === 'YIELD_WITHDRAW') {
      tokenIn = 'AEGIS_VAULT_LP';
      tokenOut = 'USDC';
      amountInStr = trade.amountUsdc.toString();
      amountOutStr = trade.amountUsdc.toString();
    } else if (trade.action === 'TAX_LOSS_HARVEST') {
      tokenIn = trade.metadata.tokenHarvested;
      tokenOut = 'USDC';
      amountInStr = trade.metadata.amountHarvested;
      amountOutStr = '0';
      const harvestedVal = Number(amountInStr) - Number(trade.amountUsdc);
      amountOutStr = Math.max(0, harvestedVal).toString();
    } else if (trade.action === 'MULTI_YIELD_DEPOSIT') {
      const aegisWeight = trade.metadata.aegisWeight ?? 0;
      const synthraWeight = trade.metadata.synthraWeight ?? 0;
      
      const aegisAmount = trade.amountUsdc * (aegisWeight / 100);
      const synthraAmount = trade.amountUsdc * (synthraWeight / 100);

      if (aegisAmount > 0) {
        if (!remainingLots['AEGIS_VAULT_LP']) remainingLots['AEGIS_VAULT_LP'] = [];
        remainingLots['AEGIS_VAULT_LP'].push({
          amount: aegisAmount,
          priceUsd: 1,
          timestamp: trade.createdAt,
        });
      }

      if (synthraAmount > 0) {
        if (!remainingLots['SYNTHRA_V3_LP']) remainingLots['SYNTHRA_V3_LP'] = [];
        remainingLots['SYNTHRA_V3_LP'].push({
          amount: synthraAmount,
          priceUsd: 1,
          timestamp: trade.createdAt,
        });
      }
      
      continue;
    }

    if (!tokenIn || !tokenOut || !amountInStr || !amountOutStr) continue;

    const amountIn = Number(amountInStr);
    const amountOut = Number(amountOutStr);
    const priceIn = trade.metadata.priceIn || (trade.amountUsdc / amountIn) || 1;
    const priceOut = trade.metadata.priceOut || (trade.amountUsdc / amountOut) || 1;

    if (!remainingLots[tokenOut]) {
      remainingLots[tokenOut] = [];
    }
    remainingLots[tokenOut]!.push({
      amount: amountOut,
      priceUsd: priceOut,
      timestamp: trade.createdAt,
    });

    const sellQueue = remainingLots[tokenIn] || [];
    let sellAmountRemaining = amountIn;

    while (sellAmountRemaining > 0 && sellQueue.length > 0) {
      const oldestLot = sellQueue[0];
      if (!oldestLot) break;

      if (oldestLot.amount <= sellAmountRemaining) {
        const consumedAmount = oldestLot.amount;
        const costBasis = consumedAmount * oldestLot.priceUsd;
        const saleValue = consumedAmount * priceIn;
        const realizedGain = saleValue - costBasis;

        realizedGains.push({
          token: tokenIn,
          amount: consumedAmount,
          costBasis,
          saleValue,
          realizedGain,
          buyTimestamp: oldestLot.timestamp,
          sellTimestamp: trade.createdAt,
        });

        totalRealized += realizedGain;
        sellAmountRemaining -= consumedAmount;
        sellQueue.shift();
      } else {
        const consumedAmount = sellAmountRemaining;
        const costBasis = consumedAmount * oldestLot.priceUsd;
        const saleValue = consumedAmount * priceIn;
        const realizedGain = saleValue - costBasis;

        realizedGains.push({
          token: tokenIn,
          amount: consumedAmount,
          costBasis,
          saleValue,
          realizedGain,
          buyTimestamp: oldestLot.timestamp,
          sellTimestamp: trade.createdAt,
        });

        totalRealized += realizedGain;
        oldestLot.amount -= consumedAmount;
        sellAmountRemaining = 0;
      }
    }
  }

  return {
    realizedGains,
    remainingLots,
    totalRealized,
  };
}
