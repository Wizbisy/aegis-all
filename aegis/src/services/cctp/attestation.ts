import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { BridgeStatusInput } from '../../utils/types.js';
import { getDcwClient } from '../../circle/dcw.js';
import { createCircuitBreaker } from '../../utils/circuitbreaker.js';

/**
 * Checks the status of a CCTP bridge transfer by polling the Circle transaction.
 * Since Bridge Kit handles the full lifecycle synchronously, this function
 * queries Circle's transaction API for the transaction status by hash.
 */
async function _getBridgeStatus(input: BridgeStatusInput): Promise<unknown> {
  if (!input.txHash || !/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) {
    throw new AppError(400, 'txHash must be a valid 66-character hex string', 'BRIDGE_INVALID_TX_HASH');
  }

  logger.info({ txHash: input.txHash }, 'Checking CCTP bridge status');

  try {
    const client = getDcwClient();
    const response = await client.listTransactions({ txHash: input.txHash });
    const tx = response.data?.transactions?.[0];

    if (!tx) {
      return {
        txHash: input.txHash,
        status: 'UNKNOWN',
        message: 'Transaction not found in Circle records. It may still be processing or was submitted externally.',
      };
    }

    return {
      txHash: input.txHash,
      status: tx.state ?? 'UNKNOWN',
      transactionType: tx.transactionType,
      ...(tx.txHash ? { onChainTxHash: tx.txHash } : {}),
      ...(tx.errorReason ? { errorReason: tx.errorReason } : {}),
      createDate: tx.createDate,
      updateDate: tx.updateDate,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return {
        txHash: input.txHash,
        status: 'UNKNOWN',
        message: 'Failed to check onchain status. Provide a Circle transaction id (UUID) to query Circle instead.',
      };
    }
    throw error;
  }
}

export const getBridgeStatus = createCircuitBreaker(
  { name: 'cctp-status', threshold: 5, resetTimeoutMs: 30_000 },
  _getBridgeStatus,
);
