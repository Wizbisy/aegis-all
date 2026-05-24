import { createPublicClient, http, type PublicClient } from 'viem';
import { resolveArcRpcUrl } from '../../config.js';

let publicClient: PublicClient | null = null;

export async function getPublicClient(): Promise<PublicClient> {
  if (!publicClient) {
    const rpcUrl = await resolveArcRpcUrl();
    publicClient = createPublicClient({
      transport: http(rpcUrl),
    });
  }
  return publicClient;
}

export const AEGIS_VAULT_ADDRESS = (process.env.AEGIS_VAULT_ADDRESS ?? '') as `0x${string}`;
export const USDC_ADDRESS = (process.env.USDC_ADDRESS ?? '') as `0x${string}`;

export const AEGIS_VAULT_ABI = [
  { type: 'function', name: 'totalAssets', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'pricePerShare', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'estimatedAPY', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalYieldDistributed', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lastYieldTimestamp', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'vaultInceptionTimestamp', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'managementFeeBps', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'performanceFeeBps', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'feeCollector', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'yieldSafetyThresholdBps', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'isEmergencyActive', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'isAllowlisted', inputs: [{ type: 'address', name: 'account' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ type: 'address', name: 'account' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'convertToAssets', inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'convertToShares', inputs: [{ type: 'uint256', name: 'assets' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'previewDeposit', inputs: [{ type: 'uint256', name: 'assets' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'previewWithdraw', inputs: [{ type: 'uint256', name: 'assets' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'previewRedeem', inputs: [{ type: 'uint256', name: 'shares' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'maxDeposit', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'maxWithdraw', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'maxRedeem', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'depositCooldown', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'withdrawLockPeriod', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'lastDepositTime', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'vaultVersion', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'pure' },
  { type: 'function', name: 'asset', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'setAllowlist', inputs: [{ type: 'address', name: 'account' }, { type: 'bool', name: 'status' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'distributeYield', inputs: [{ type: 'uint256', name: 'amount' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ type: 'address', name: 'account' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ type: 'address', name: 'owner' }, { type: 'address', name: 'spender' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ type: 'address', name: 'spender' }, { type: 'uint256', name: 'amount' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;
