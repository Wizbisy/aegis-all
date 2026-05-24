import { AppError } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';

const MAX_EXTERNAL_WEIGHT = 80;

export function validateAgentAllocation(aegisWeight: number, synthraWeight: number): void {
  logger.debug({ aegisWeight, synthraWeight }, 'Validating agentic yield allocation');

  if (aegisWeight < 0 || synthraWeight < 0) {
    throw new AppError(400, 'Allocation weights cannot be negative', 'INVALID_YIELD_WEIGHTS');
  }

  if (aegisWeight + synthraWeight !== 100) {
    throw new AppError(400, 'aegisWeight and synthraWeight must add up to 100', 'INVALID_YIELD_WEIGHTS');
  }

  if (synthraWeight > MAX_EXTERNAL_WEIGHT) {
    throw new AppError(
      400,
      `synthraWeight exceeds maximum external protocol allocation of ${MAX_EXTERNAL_WEIGHT}%`,
      'YIELD_RISK_CAP_EXCEEDED',
      { maxExternalWeight: MAX_EXTERNAL_WEIGHT, requested: synthraWeight },
    );
  }
}
