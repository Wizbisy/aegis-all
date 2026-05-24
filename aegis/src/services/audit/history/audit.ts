import { db } from '../../../db/prisma.js';
import { logger } from '../../../utils/logger.js';
import type { HarvestExecutionReport } from '../harvester/executor.js';

/**
 * Persists tax loss harvesting executions and offset yields
 * in the global database audit table for compliance auditing.
 */
export async function logTaxHarvestEvent(
  agentId: string,
  report: HarvestExecutionReport,
  metadata?: Record<string, any>
): Promise<void> {
  logger.info({ agentId, report }, 'Recording tax loss harvest audit log to database');

  try {
    await db.auditLog.create({
      data: {
        agentId,
        action: 'TAX_LOSS_HARVEST',
        amountUsdc: report.realizedLossUsdc,
        status: report.status,
        signature: report.txHash,
        metadata: {
          tokenHarvested: report.tokenHarvested,
          amountHarvested: report.amountHarvested,
          timestamp: report.timestamp.toISOString(),
          ...metadata,
        },
      },
    });
  } catch (err) {
    logger.error({ err, agentId }, 'Failed to write tax loss harvest audit log to database');
  }
}
