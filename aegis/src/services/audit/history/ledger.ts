import { getHistoricalTrades } from '../scanner/block.js';
import { calculateFIFOGains } from '../gains/fifo.js';
import type { RealizedGainEvent } from '../gains/fifo.js';
import { identifyWashSales } from '../gains/wash.js';
import type { WashSaleEvent } from '../gains/wash.js';
import { logger } from '../../../utils/logger.js';

export interface TaxLedgerSummary {
  agentId: string;
  totalSwapsCount: number;
  grossRealizedGains: number;
  grossRealizedLosses: number;
  disallowedWashLosses: number;
  netAllowedCapitalLoss: number;
  netAllowedCapitalGain: number;
  washSaleEvents: WashSaleEvent[];
  realizedEvents: RealizedGainEvent[];
}

/**
 * Builds a complete tax compliant general ledger summary statement for a given
 * autonomous agent by combining blockchain logs, FIFO basis matching, and wash sale rule verification.
 */
export async function generateTaxLedger(agentId: string): Promise<TaxLedgerSummary> {
  logger.info({ agentId }, 'Generating unified capital gains tax ledger statement');

  const trades = await getHistoricalTrades(agentId);
  const fifoAnalysis = calculateFIFOGains(trades);
  const washSaleAnalysis = identifyWashSales(fifoAnalysis.realizedGains, trades);

  let grossRealizedGains = 0;
  let grossRealizedLosses = 0;

  for (const event of washSaleAnalysis.allowedLosses) {
    if (event.realizedGain >= 0) {
      grossRealizedGains += event.realizedGain;
    } else {
      grossRealizedLosses += Math.abs(event.realizedGain);
    }
  }

  const disallowedWashLosses = washSaleAnalysis.totalDisallowed;
  const netAllowedCapitalGain = Math.max(0, grossRealizedGains - grossRealizedLosses);
  const netAllowedCapitalLoss = Math.max(0, grossRealizedLosses - grossRealizedGains);

  return {
    agentId,
    totalSwapsCount: trades.length,
    grossRealizedGains,
    grossRealizedLosses,
    disallowedWashLosses,
    netAllowedCapitalLoss,
    netAllowedCapitalGain,
    washSaleEvents: washSaleAnalysis.disallowedLosses,
    realizedEvents: fifoAnalysis.realizedGains,
  };
}
