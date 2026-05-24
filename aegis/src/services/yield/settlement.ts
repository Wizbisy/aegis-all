import { formatUnits } from 'viem';
import { getPublicClient, AEGIS_VAULT_ADDRESS, AEGIS_VAULT_ABI } from './client.js';
import { AppError } from '../../utils/errors.js';

export async function reconcileYieldSettlements() {
  if (!AEGIS_VAULT_ADDRESS) {
    return { reconciled: 0, message: 'AEGIS_VAULT_ADDRESS is not configured' };
  }

  const client = await getPublicClient();

  const [totalAssets, totalSupply, pricePerShare, totalYieldDistributed, lastYieldTimestamp, paused, isEmergency] = await Promise.all([
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'totalAssets' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'totalSupply' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'pricePerShare' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'totalYieldDistributed' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'lastYieldTimestamp' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'paused' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'isEmergencyActive' }),
  ]);

  return {
    reconciled: 1,
    vault: AEGIS_VAULT_ADDRESS,
    snapshot: {
      totalAssets: formatUnits(totalAssets, 6),
      totalShares: formatUnits(totalSupply, 6),
      pricePerShare: formatUnits(pricePerShare, 6),
      totalYieldDistributed: formatUnits(totalYieldDistributed, 6),
      lastYieldTimestamp: Number(lastYieldTimestamp),
      lastYieldDate: lastYieldTimestamp > 0n ? new Date(Number(lastYieldTimestamp) * 1000).toISOString() : null,
      paused,
      isEmergencyActive: isEmergency,
    },
    timestamp: new Date().toISOString(),
  };
}