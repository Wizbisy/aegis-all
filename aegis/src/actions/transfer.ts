import { logger } from '../utils/logger.js';
import { sendUsdcTransfer } from '../circle/dcw.js';

export async function transferUsdc(
  walletId: string,
  destinationAddress: string,
  amount: string,
  idempotencyKey?: string,
) {
  logger.info({ amount }, 'Initiating Arc USDC transfer');
  return sendUsdcTransfer({
    walletId,
    destinationAddress,
    amount,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
}
