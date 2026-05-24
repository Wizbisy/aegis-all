import { formatUnits } from 'viem';
import { getPublicClient, AEGIS_VAULT_ADDRESS, AEGIS_VAULT_ABI, ERC20_ABI, USDC_ADDRESS } from './client.js';
import { AppError } from '../../utils/errors.js';
import type { YieldPosition } from '../../utils/types.js';

export async function listYieldPositions(agentId: string, walletAddress?: string): Promise<YieldPosition[]> {
  if (!AEGIS_VAULT_ADDRESS || !walletAddress) return [];

  const client = await getPublicClient();
  const address = walletAddress as `0x${string}`;

  const [sharesRaw, usdcValueRaw, isAllowlisted, lastDeposit, withdrawLock] = await Promise.all([
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'balanceOf', args: [address] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'maxWithdraw', args: [address] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'isAllowlisted', args: [address] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'lastDepositTime', args: [address] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'withdrawLockPeriod' }),
  ]);

  if (sharesRaw === 0n) return [];

  const nowSeconds = Math.floor(Date.now() / 1000);
  const lockExpiry = Number(lastDeposit) + Number(withdrawLock);
  const isLocked = nowSeconds < lockExpiry;

  return [
    {
      vaultId: 'aegis-ausdc-v1',
      agentId,
      shares: formatUnits(sharesRaw, 6),
      amountUsdc: formatUnits(usdcValueRaw, 6),
      status: 'ACTIVE',
      isAllowlisted,
      isWithdrawLocked: isLocked,
      lockExpiresAt: isLocked ? new Date(lockExpiry * 1000).toISOString() : null,
    } as YieldPosition & Record<string, unknown>,
  ];
}

export async function getAgentVaultBalance(walletAddress: string) {
  if (!AEGIS_VAULT_ADDRESS) {
    throw new AppError(503, 'AEGIS_VAULT_ADDRESS is not configured', 'VAULT_NOT_CONFIGURED');
  }

  const client = await getPublicClient();
  const address = walletAddress as `0x${string}`;

  const [shares, usdcValue, usdcBalance, allowance, pricePerShare, isAllowlisted] = await Promise.all([
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'balanceOf', args: [address] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'convertToAssets', args: [await client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'balanceOf', args: [address] })] }),
    client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
    client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, AEGIS_VAULT_ADDRESS] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'pricePerShare' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'isAllowlisted', args: [address] }),
  ]);

  return {
    wallet: walletAddress,
    vault: AEGIS_VAULT_ADDRESS,
    aUSDC: {
      shares: formatUnits(shares, 6),
      usdcValue: formatUnits(usdcValue, 6),
    },
    usdc: {
      balance: formatUnits(usdcBalance, 6),
      approvedToVault: formatUnits(allowance, 6),
    },
    pricePerShare: formatUnits(pricePerShare, 6),
    isAllowlisted,
  };
}
