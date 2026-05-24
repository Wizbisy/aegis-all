import { formatUnits } from 'viem';
import { getPublicClient, AEGIS_VAULT_ADDRESS, AEGIS_VAULT_ABI } from './client.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import type { YieldVault } from '../../utils/types.js';

export async function getVaultState() {
  if (!AEGIS_VAULT_ADDRESS) {
    throw new AppError(503, 'AEGIS_VAULT_ADDRESS is not configured', 'VAULT_NOT_CONFIGURED');
  }

  const client = await getPublicClient();

  const [
    totalAssets,
    totalSupply,
    pricePerShare,
    estimatedAPY,
    totalYieldDistributed,
    lastYieldTimestamp,
    vaultInceptionTimestamp,
    managementFeeBps,
    performanceFeeBps,
    yieldSafetyThresholdBps,
    paused,
    isEmergency,
    depositCooldown,
    withdrawLockPeriod,
    version,
  ] = await Promise.all([
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'totalAssets' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'totalSupply' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'pricePerShare' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'estimatedAPY' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'totalYieldDistributed' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'lastYieldTimestamp' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'vaultInceptionTimestamp' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'managementFeeBps' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'performanceFeeBps' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'yieldSafetyThresholdBps' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'paused' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'isEmergencyActive' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'depositCooldown' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'withdrawLockPeriod' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'vaultVersion' }),
  ]);

  return {
    address: AEGIS_VAULT_ADDRESS,
    totalAssetsRaw: totalAssets.toString(),
    totalAssets: formatUnits(totalAssets, 6),
    totalSupplyRaw: totalSupply.toString(),
    totalSupply: formatUnits(totalSupply, 6),
    pricePerShare: formatUnits(pricePerShare, 6),
    estimatedAPYBps: Number(estimatedAPY),
    estimatedAPYPercent: Number(estimatedAPY) / 100,
    totalYieldDistributed: formatUnits(totalYieldDistributed, 6),
    lastYieldTimestamp: Number(lastYieldTimestamp),
    vaultInceptionTimestamp: Number(vaultInceptionTimestamp),
    managementFeeBps: Number(managementFeeBps),
    performanceFeeBps: Number(performanceFeeBps),
    yieldSafetyThresholdBps: Number(yieldSafetyThresholdBps),
    paused,
    isEmergencyActive: isEmergency,
    depositCooldownSeconds: Number(depositCooldown),
    withdrawLockSeconds: Number(withdrawLockPeriod),
    version,
  };
}

export function listYieldVaults(): YieldVault[] {
  if (!AEGIS_VAULT_ADDRESS) return [];

  return [
    {
      id: 'aegis-ausdc-v1',
      name: 'Aegis aUSDC Vault',
      chain: 'ARC-TESTNET',
      contractAddress: AEGIS_VAULT_ADDRESS,
      asset: 'USDC',
      enabled: true,
      risk: 'LOW',
    },
  ];
}

export function getYieldVault(vaultId: string): YieldVault | null {
  const vaults = listYieldVaults();
  return vaults.find((v) => v.id === vaultId && v.enabled) ?? null;
}
