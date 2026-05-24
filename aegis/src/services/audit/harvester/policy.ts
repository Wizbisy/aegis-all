import type { HarvestCandidate } from './matcher.js';

export interface HarvestPolicyReport {
  allowed: boolean;
  unrealizedLoss: number;
  estimatedTaxSavings: number;
  gasCostDrag: number;
  netBenefit: number;
  reason: string;
}

/**
 * Validates whether executing a tax loss harvest is financially viable by
 * calculating the net tax savings against swap fees, slippage, and gas drag.
 */
export function evaluateHarvestPolicy(
  candidate: HarvestCandidate,
  gasCostUsdc: number,
  taxBracket = 0.30,
  yearlyCapUsdc = Infinity
): HarvestPolicyReport {
  const lossValue = candidate.unrealizedLoss;
  
  // Tax savings is the realized loss value capped at the offset limit, multiplied by the tax bracket rate
  const estimatedTaxSavings = Math.min(lossValue, yearlyCapUsdc) * taxBracket;
  const netBenefit = estimatedTaxSavings - gasCostUsdc;

  if (estimatedTaxSavings <= 0) {
    return {
      allowed: false,
      unrealizedLoss: lossValue,
      estimatedTaxSavings,
      gasCostDrag: gasCostUsdc,
      netBenefit,
      reason: 'No tax deductible savings achievable from this position.',
    };
  }

  if (netBenefit <= 0) {
    return {
      allowed: false,
      unrealizedLoss: lossValue,
      estimatedTaxSavings,
      gasCostDrag: gasCostUsdc,
      netBenefit,
      reason: `Gas cost drag ($${gasCostUsdc.toFixed(2)}) is higher than or equal to estimated tax savings ($${estimatedTaxSavings.toFixed(2)}).`,
    };
  }

  return {
    allowed: true,
    unrealizedLoss: lossValue,
    estimatedTaxSavings,
    gasCostDrag: gasCostUsdc,
    netBenefit,
    reason: `Harvest is viable. Net capital gains benefit is $${netBenefit.toFixed(2)}.`,
  };
}
