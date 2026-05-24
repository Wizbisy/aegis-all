import { logger } from '../../../utils/logger.js';
import { AppError } from '../../../utils/errors.js';
import type { SupportedSwapToken } from '../../../utils/types.js';
import { getSwapQuote } from '../../swap/index.js';

export async function fetchLivePrice(tokenIn: string, tokenOut: string, walletAddress: string): Promise<number> {
  logger.debug({ tokenIn, tokenOut }, 'Fetching live price for Wealth Sentinel');

  try {
    const quote = await getSwapQuote({
      tokenIn: tokenIn as SupportedSwapToken,
      tokenOut: tokenOut as SupportedSwapToken,
      amountIn: '1',
      walletAddress,
    });

    const outputAmount = Number(quote.estimatedOutput);
    if (Number.isNaN(outputAmount) || outputAmount <= 0) {
      throw new AppError(502, `Oracle returned invalid price for ${tokenIn}/${tokenOut}`, 'ORACLE_INVALID_PRICE');
    }

    return outputAmount;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, tokenIn, tokenOut }, 'Failed to fetch oracle price');
    throw new AppError(502, `Oracle price fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'ORACLE_FETCH_FAILED');
  }
}
