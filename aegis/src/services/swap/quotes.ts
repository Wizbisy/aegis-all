import { AppKit } from '@circle-fin/app-kit';
import { ArcTestnet } from '@circle-fin/app-kit/chains';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { config, resolveArcRpcUrl } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import type { SupportedSwapToken, SwapQuoteResult } from '../../utils/types.js';

const kit = new AppKit();

function getCircleWalletsAdapter() {
  if (!config.CIRCLE_API_KEY || !config.ENTITY_SECRET) {
    throw new AppError(503, 'Circle API credentials are not configured for swapping', 'SWAP_NOT_CONFIGURED');
  }

  return createCircleWalletsAdapter({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.ENTITY_SECRET,
  });
}

export async function getSwapQuote(input: {
  tokenIn: SupportedSwapToken;
  tokenOut: SupportedSwapToken;
  amountIn: string;
  walletAddress?: string;
}): Promise<SwapQuoteResult> {
  const kitKey = config.KIT_KEY;
  if (!kitKey) {
    throw new AppError(503, 'Circle App Kit Key is not configured', 'SWAP_NOT_CONFIGURED');
  }

  const adapter = getCircleWalletsAdapter();
  const rpcUrl = await resolveArcRpcUrl();
  const customArcChain = {
    ...ArcTestnet,
    rpcEndpoints: [rpcUrl, ...ArcTestnet.rpcEndpoints],
  };

  try {
    const estimate = await kit.estimateSwap({
      from: {
        adapter,
        chain: customArcChain as any,
        address: input.walletAddress ?? '',
      },
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      config: {
        kitKey,
      },
    });

    return {
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      estimatedOutput: typeof estimate.estimatedOutput === 'object' && estimate.estimatedOutput 
        ? (estimate.estimatedOutput as any).amount 
        : String(estimate.estimatedOutput),
      fees: (estimate.fees || []).map((fee: any) => ({
        type: fee.type || 'provider',
        amount: typeof fee.amount === 'object' && fee.amount 
          ? (fee.amount as any).amount 
          : String(fee.amount || '0'),
        token: fee.token || input.tokenIn,
      })),
    };
  } catch (err) {
    throw new AppError(
      502,
      `Failed to estimate swap rate: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'SWAP_ESTIMATE_FAILED'
    );
  }
}
