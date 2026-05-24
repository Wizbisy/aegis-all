import { resolveBridgeChain, estimateBridgeFee, listSupportedChains } from './chains.js';
import type { BridgeQuoteInput } from '../../utils/types.js';

/**
 * Estimates the CCTP bridge fee for a given route.
 * Returns a baseline estimate.
 * Actual fees are determined by Bridge Kit at runtime.
 */
export async function getBridgeFee(input: BridgeQuoteInput): Promise<{
  fromChain: string;
  toChain: string;
  estimatedFeeUsdc: string;
  supportedChains: string[];
  note: string;
}> {
  const fromChain = resolveBridgeChain(input.fromChain ?? 'ARC-TESTNET');
  const toChain = resolveBridgeChain(input.toChain);

  const fee = estimateBridgeFee(fromChain, toChain);

  return {
    fromChain,
    toChain,
    estimatedFeeUsdc: fee.estimatedFeeUsdc,
    supportedChains: listSupportedChains(),
    note: fee.note,
  };
}
