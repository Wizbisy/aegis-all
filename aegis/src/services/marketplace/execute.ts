import { payForService } from '../../actions/pay.js';
import type { MarketplacePayOptions } from '../../utils/types.js';

/**
 * Executes a payment to a service endpoint using the agent's USDC wallet.
 */
export async function executePaidService(options: MarketplacePayOptions): Promise<any> {
  return payForService({
    serviceUrl: options.serviceUrl,
    walletAddress: options.walletAddress,
    maxAmount: options.maxAmount,
    ...(options.method ? { method: options.method } : {}),
    ...(options.data !== undefined ? { data: options.data } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.estimate !== undefined ? { estimate: options.estimate } : {}),
  });
}
