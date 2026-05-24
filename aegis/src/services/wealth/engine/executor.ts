import { logger } from '../../../utils/logger.js';
import { executeTokenSwap } from '../../swap/execute.js';
import { AppError } from '../../../utils/errors.js';
import { startAuditAction, completeAuditAction, failAuditAction } from '../../../utils/audit.js';
import type { SupportedSwapToken, SwapExecutionResult } from '../../../utils/types.js';

export async function executeBackgroundIntent(
  agentId: string,
  walletAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  intentId: string,
  intentType: 'LIMIT_ORDER' | 'DCA',
): Promise<SwapExecutionResult> {
  logger.info({ agentId, intentType, intentId }, 'Executing autonomous background intent via AppKit');

  const audit = await startAuditAction({
    agentId,
    action: `WEALTH_AUTO_${intentType}`,
    amountUsdc: amountIn,
    metadata: { tokenIn, tokenOut, intentId, intentType },
  });

  try {
    const tx = await executeTokenSwap({
      walletAddress,
      tokenIn: tokenIn as SupportedSwapToken,
      tokenOut: tokenOut as SupportedSwapToken,
      amountIn,
      slippageBps: 300,
    });

    await completeAuditAction(audit.id, { signature: tx.txHash, result: tx });
    logger.info({ intentId, txHash: tx.txHash }, 'Background intent executed successfully');
    return tx;
  } catch (err) {
    logger.error({ err, intentId, intentType }, 'Background intent execution failed');
    await failAuditAction(audit.id, err);
    throw new AppError(
      502,
      `Background ${intentType} execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'WEALTH_EXECUTION_FAILED',
    );
  }
}
