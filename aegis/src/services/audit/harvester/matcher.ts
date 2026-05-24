import type { TaxLot } from '../gains/fifo.js';
import { getHistoricalPrice } from '../scanner/pricing.js';

export interface HarvestCandidate {
  token: string;
  unrealizedLoss: number;
  totalHoldings: number;
  averageCostBasis: number;
  currentPrice: number;
  lots: {
    amount: number;
    purchasePrice: number;
    unrealizedLoss: number;
    timestamp: Date;
  }[];
}

/**
 * Compares current token valuations against historical purchase cost basis lots
 * to isolate assets currently holding tax deductible unrealized losses.
 */
export async function matchHarvestCandidates(
  remainingLots: Record<string, TaxLot[]>
): Promise<HarvestCandidate[]> {
  const candidates: HarvestCandidate[] = [];

  for (const [token, lots] of Object.entries(remainingLots)) {
    if (lots.length === 0) continue;

    const currentPrice = await getHistoricalPrice(token, new Date());
    let totalUnrealizedLoss = 0;
    let totalHoldings = 0;
    let totalCostBasis = 0;

    const candidateLots: HarvestCandidate['lots'] = [];

    for (const lot of lots) {
      totalHoldings += lot.amount;
      totalCostBasis += lot.amount * lot.priceUsd;

      if (lot.priceUsd > currentPrice) {
        const lotLoss = lot.amount * (lot.priceUsd - currentPrice);
        totalUnrealizedLoss += lotLoss;

        candidateLots.push({
          amount: lot.amount,
          purchasePrice: lot.priceUsd,
          unrealizedLoss: lotLoss,
          timestamp: lot.timestamp,
        });
      }
    }

    if (totalUnrealizedLoss > 0) {
      candidates.push({
        token,
        unrealizedLoss: totalUnrealizedLoss,
        totalHoldings,
        averageCostBasis: totalHoldings > 0 ? (totalCostBasis / totalHoldings) : 0,
        currentPrice,
        lots: candidateLots.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss),
      });
    }
  }

  return candidates.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss);
}
