import type { HistoricalTrade } from '../scanner/block.js';
import type { TaxLot, RealizedGainEvent } from './fifo.js';

/**
 * Calculates the realized capital gains or losses for a set of historical trades
 * using the LIFO inventory tax lots allocation strategy.
 */
export function calculateLIFOGains(trades: HistoricalTrade[]): {
  realizedGains: RealizedGainEvent[];
  remainingLots: Record<string, TaxLot[]>;
  totalRealized: number;
} {
  const remainingLots: Record<string, TaxLot[]> = {};
  const realizedGains: RealizedGainEvent[] = [];
  let totalRealized = 0;

  for (const trade of trades) {
    if (trade.action !== 'TOKEN_SWAP') continue;

    const tokenIn = trade.metadata.tokenIn;
    const tokenOut = trade.metadata.tokenOut;
    const amountInStr = trade.metadata.amountIn;
    const amountOutStr = trade.metadata.amountOut;

    if (!tokenIn || !tokenOut || !amountInStr || !amountOutStr) continue;

    const amountIn = Number(amountInStr);
    const amountOut = Number(amountOutStr);
    const priceIn = trade.metadata.priceIn || (trade.amountUsdc / amountIn) || 1;
    const priceOut = trade.metadata.priceOut || (trade.amountUsdc / amountOut) || 1;

    if (!remainingLots[tokenOut]) {
      remainingLots[tokenOut] = [];
    }
    remainingLots[tokenOut].push({
      amount: amountOut,
      priceUsd: priceOut,
      timestamp: trade.createdAt,
    });

    const sellStack = remainingLots[tokenIn] || [];
    let sellAmountRemaining = amountIn;

    while (sellAmountRemaining > 0 && sellStack.length > 0) {
      const newestLot = sellStack[sellStack.length - 1];
      if (!newestLot) break;

      if (newestLot.amount <= sellAmountRemaining) {
        const consumedAmount = newestLot.amount;
        const costBasis = consumedAmount * newestLot.priceUsd;
        const saleValue = consumedAmount * priceIn;
        const realizedGain = saleValue - costBasis;

        realizedGains.push({
          token: tokenIn,
          amount: consumedAmount,
          costBasis,
          saleValue,
          realizedGain,
          buyTimestamp: newestLot.timestamp,
          sellTimestamp: trade.createdAt,
        });

        totalRealized += realizedGain;
        sellAmountRemaining -= consumedAmount;
        sellStack.pop();
      } else {
        const consumedAmount = sellAmountRemaining;
        const costBasis = consumedAmount * newestLot.priceUsd;
        const saleValue = consumedAmount * priceIn;
        const realizedGain = saleValue - costBasis;

        realizedGains.push({
          token: tokenIn,
          amount: consumedAmount,
          costBasis,
          saleValue,
          realizedGain,
          buyTimestamp: newestLot.timestamp,
          sellTimestamp: trade.createdAt,
        });

        totalRealized += realizedGain;
        newestLot.amount -= consumedAmount;
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
