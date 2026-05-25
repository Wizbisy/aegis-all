import { executeTokenSwap } from '../../swap/execute.js';
import { logger } from '../../../utils/logger.js';
import { AppError } from '../../../utils/errors.js';
import type { SupportedSwapToken } from '../../../utils/types.js';

export interface HarvestExecutionReport {
  status: 'SUCCESS' | 'FAILED';
  tokenHarvested: string;
  amountHarvested: string;
  realizedLossUsdc: number;
  txHash: string | null;
  timestamp: Date;
}

/**
 * Triggers the tax loss offsetting trade swaps by selling assets with unrealized losses
 * for stablecoins, programmatically securing capital gains tax offsets.
 */
export async function executeTaxHarvest(input: {
  walletAddress: string;
  token: string;
  amount: number;
  unrealizedLoss: number;
}): Promise<HarvestExecutionReport> {
  logger.info(
    { token: input.token, amount: input.amount, unrealizedLoss: input.unrealizedLoss },
    'Executing programmatically triggered tax loss harvest trade'
  );

  const rawToken = input.token.toUpperCase();

  if (rawToken === 'USDC') {
    throw new AppError(400, 'Cannot harvest tax loss on native stablecoin base assets', 'INVALID_HARVEST_ASSET');
  }

  if (rawToken === 'SYNTHRA_V3_LP') {
    logger.info('Executing programmatic withdrawal of Synthra V3 Liquidity NFT to harvest impermanent loss');
    const { withdrawFromSynthraV3 } = await import('../../wealth/yield/aggregator.js');
    const { db } = await import('../../../db/prisma.js');
    
    const agent = await db.agent.findFirst({ where: { walletAddress: input.walletAddress } });
    if (!agent || !agent.walletId) {
      throw new AppError(500, 'Could not resolve walletId for execution', 'WALLET_RESOLUTION_FAILED');
    }

    const result = await withdrawFromSynthraV3({
      walletId: agent.walletId,
      walletAddress: input.walletAddress,
      idempotencyKey: 'harvest-' + Date.now().toString(),
    });

    return {
      status: 'SUCCESS',
      tokenHarvested: input.token,
      amountHarvested: input.amount.toString(),
      realizedLossUsdc: input.unrealizedLoss,
      txHash: result.txHash ?? null,
      timestamp: new Date(),
    };
  }

  const tokenIn = rawToken as SupportedSwapToken;
  const tokenOut = 'USDC' as SupportedSwapToken;

  try {
    const swapResult = await executeTokenSwap({
      walletAddress: input.walletAddress,
      tokenIn,
      tokenOut,
      amountIn: input.amount.toString(),
      slippageBps: 100,
    });

    return {
      status: 'SUCCESS',
      tokenHarvested: input.token,
      amountHarvested: input.amount.toString(),
      realizedLossUsdc: input.unrealizedLoss,
      txHash: swapResult.txHash,
      timestamp: new Date(),
    };
  } catch (err) {
    logger.error({ err, token: input.token }, 'Tax loss harvest execution failed');
    return {
      status: 'FAILED',
      tokenHarvested: input.token,
      amountHarvested: input.amount.toString(),
      realizedLossUsdc: 0,
      txHash: null,
      timestamp: new Date(),
    };
  }
}
