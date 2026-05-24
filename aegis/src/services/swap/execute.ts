import { AppKit } from '@circle-fin/app-kit';
import { ArcTestnet } from '@circle-fin/app-kit/chains';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { config, resolveArcRpcUrl } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { validateSlippage } from './slippage.js';
import type { SupportedSwapToken, SwapExecutionResult } from '../../utils/types.js';

const kit = new AppKit();

export async function executeTokenSwap(input: {
  walletAddress: string;
  tokenIn: SupportedSwapToken;
  tokenOut: SupportedSwapToken;
  amountIn: string;
  slippageBps?: number;
}): Promise<SwapExecutionResult> {
  const apiKey = config.CIRCLE_API_KEY;
  const entitySecret = config.ENTITY_SECRET;
  const kitKey = config.KIT_KEY;

  if (!apiKey || !entitySecret || !kitKey) {
    throw new AppError(503, 'Circle API credentials or Kit Key not configured for swapping', 'SWAP_NOT_CONFIGURED');
  }

  const adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  const slippageBps = validateSlippage(input.slippageBps);
  const rpcUrl = await resolveArcRpcUrl();

  const customArcChain = {
    ...ArcTestnet,
    rpcEndpoints: [rpcUrl, ...ArcTestnet.rpcEndpoints],
  };

  logger.info(
    { walletAddress: input.walletAddress, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amountIn: input.amountIn, rpcHost: new URL(rpcUrl).hostname },
    'Initiating token swap on Arc Testnet via App Kit with custom Aegis RPC'
  );

  try {
    const result = await kit.swap({
      from: {
        adapter,
        chain: customArcChain as any,
        address: input.walletAddress,
      },
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      config: {
        kitKey,
        slippageBps,
        allowanceStrategy: 'approve',
      },
    });

    return {
      status: 'SUCCESS',
      txHash: result.txHash,
      amountIn: result.amountIn || input.amountIn,
      amountOut: result.amountOut || '0',
      explorerUrl: result.explorerUrl || `https://testnet.arcscan.app/tx/${result.txHash}`,
    };
  } catch (err) {
    logger.error({ err, input }, 'Token swap execution failed');
    throw new AppError(
      502,
      `Token swap execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'SWAP_EXECUTION_FAILED'
    );
  }
}
