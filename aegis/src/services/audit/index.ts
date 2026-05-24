import { getHistoricalTrades } from './scanner/block.js';
import { calculateFIFOGains } from './gains/fifo.js';
import { matchHarvestCandidates } from './harvester/matcher.js';
import { evaluateHarvestPolicy } from './harvester/policy.js';
import { executeTaxHarvest } from './harvester/executor.js';
import { logTaxHarvestEvent } from './history/audit.js';
import { generateTaxLedger } from './history/ledger.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

export interface TaxHarvestResult {
  token: string;
  amountToSell: number;
  unrealizedLoss: number;
  policyReport: any;
  executionReport: any;
}

export interface TaxHarvestReport {
  agentId: string;
  executionMode: 'HARVEST' | 'SIMULATE';
  timestamp: Date;
  candidatesAnalyzedCount: number;
  harvestedPositions: TaxHarvestResult[];
  netRealizedLossCreatedUsdc: number;
}

/**
 * Triggers the tax loss harvesting engine loop. It scans the portfolio for unrealized
 * losses, validates candidates against gas drag policy, and executes offsetting trades.
 */
export async function harvestTaxLosses(input: {
  agentId: string;
  walletAddress: string;
  executionMode: 'HARVEST' | 'SIMULATE';
  taxBracket?: number;
}): Promise<TaxHarvestReport> {
  const { agentId, walletAddress, executionMode, taxBracket = 0.30 } = input;
  logger.info({ agentId, executionMode }, 'Starting portfolio tax loss harvesting execution loop');

  const trades = await getHistoricalTrades(agentId);
  
  const fifoAnalysis = calculateFIFOGains(trades);
  const candidates = await matchHarvestCandidates(fifoAnalysis.remainingLots);

  const harvestedPositions: TaxHarvestResult[] = [];
  let netRealizedLossCreatedUsdc = 0;

  for (const candidate of candidates) {
    const estimatedGasDragUsdc = 0.01; 

    const policyReport = evaluateHarvestPolicy(candidate, estimatedGasDragUsdc, taxBracket);

    if (!policyReport.allowed) {
      logger.info({ token: candidate.token, reason: policyReport.reason }, 'Skipping harvest candidate due to policy limits');
      continue;
    }

    let executionReport = null;

    if (executionMode === 'HARVEST') {
      try {
        const report = await executeTaxHarvest({
          walletAddress,
          token: candidate.token,
          amount: candidate.totalHoldings,
          unrealizedLoss: candidate.unrealizedLoss,
        });

        executionReport = report;

        if (report.status === 'SUCCESS') {
          netRealizedLossCreatedUsdc += report.realizedLossUsdc;
          await logTaxHarvestEvent(agentId, report, {
            netTaxBenefitUsdc: policyReport.netBenefit,
            estimatedSavingsUsdc: policyReport.estimatedTaxSavings,
          });
        }
      } catch (err) {
        logger.error({ err, token: candidate.token }, 'Unexpected error during harvest execution');
        executionReport = {
          status: 'FAILED',
          tokenHarvested: candidate.token,
          amountHarvested: candidate.totalHoldings.toString(),
          realizedLossUsdc: 0,
          txHash: null,
          timestamp: new Date(),
        };
      }
    } else {
      executionReport = {
        status: 'SUCCESS',
        tokenHarvested: candidate.token,
        amountHarvested: candidate.totalHoldings.toString(),
        realizedLossUsdc: candidate.unrealizedLoss,
        txHash: '0xmock_simulation_hash_' + Math.random().toString(36).substring(7),
        timestamp: new Date(),
      };
      netRealizedLossCreatedUsdc += candidate.unrealizedLoss;
    }

    harvestedPositions.push({
      token: candidate.token,
      amountToSell: candidate.totalHoldings,
      unrealizedLoss: candidate.unrealizedLoss,
      policyReport,
      executionReport,
    });
  }

  return {
    agentId,
    executionMode,
    timestamp: new Date(),
    candidatesAnalyzedCount: candidates.length,
    harvestedPositions,
    netRealizedLossCreatedUsdc,
  };
}

export { generateTaxLedger };
