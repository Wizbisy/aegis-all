import type { RealizedGainEvent } from './fifo.js';
import type { HistoricalTrade } from '../scanner/block.js';

export interface WashSaleEvent {
  disallowedLoss: number;
  sellEvent: RealizedGainEvent;
  violatingBuyEvent: HistoricalTrade;
}

/**
 * Scans realized gain/loss events and checks if they violate the 30day wash sale rule.
 * A wash sale occurs if an asset is sold at a loss and a substantially identical asset
 * is purchased within 30 days before or after the sale.
 */
export function identifyWashSales(
  realizedEvents: RealizedGainEvent[],
  allTrades: HistoricalTrade[]
): {
  allowedLosses: RealizedGainEvent[];
  disallowedLosses: WashSaleEvent[];
  totalDisallowed: number;
} {
  const allowedLosses: RealizedGainEvent[] = [];
  const disallowedLosses: WashSaleEvent[] = [];
  let totalDisallowed = 0;

  const WASH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  for (const event of realizedEvents) {
    if (event.realizedGain >= 0) {
      allowedLosses.push(event);
      continue;
    }

    const lossValue = Math.abs(event.realizedGain);

    const violatingBuy = allTrades.find((trade) => {
      if (trade.action !== 'TOKEN_SWAP') return false;
      const isBuyOfSameToken = trade.metadata.tokenOut === event.token;
      if (!isBuyOfSameToken) return false;
      if (trade.createdAt.getTime() === event.buyTimestamp.getTime()) return false;

      const timeDifference = Math.abs(trade.createdAt.getTime() - event.sellTimestamp.getTime());
      return timeDifference <= WASH_WINDOW_MS;
    });

    if (violatingBuy) {
      disallowedLosses.push({
        disallowedLoss: lossValue,
        sellEvent: event,
        violatingBuyEvent: violatingBuy,
      });
      totalDisallowed += lossValue;
    } else {
      allowedLosses.push(event);
    }
  }

  return {
    allowedLosses,
    disallowedLosses,
    totalDisallowed,
  };
}
