import type { BridgeStatusInput } from '../../utils/types.js';
import { getBridgeStatus } from './attestation.js';

/**
 * Confirms a bridge mint by checking the bridge transfer status.
 * In Bridge Kit's full lifecycle flow, the mint step is handled automatically.
 * This function provides a way to verify the final state.
 */
export async function confirmBridgeMint(input: BridgeStatusInput) {
  return getBridgeStatus(input);
}
