import { AppError } from '../../utils/errors.js';

export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_SLIPPAGE_BPS = 500;

/**
 * Validates the slippage bounds to protect from MEV
 */
export function validateSlippage(slippageBps: number | undefined): number {
  if (slippageBps === undefined) {
    return DEFAULT_SLIPPAGE_BPS;
  }

  if (isNaN(slippageBps) || slippageBps < 0) {
    throw new AppError(400, 'Slippage must be a positive integer in basis points', 'INVALID_SLIPPAGE');
  }

  if (slippageBps > MAX_SLIPPAGE_BPS) {
    throw new AppError(
      400,
      `Slippage exceeds maximum safe bounds of ${MAX_SLIPPAGE_BPS / 100}% to prevent high price impact`,
      'SLIPPAGE_EXCEEDS_MAX'
    );
  }

  return slippageBps;
}
