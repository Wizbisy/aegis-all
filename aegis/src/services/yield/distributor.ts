import { createWalletClient, http, publicActions, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';
import { AEGIS_VAULT_ADDRESS, AEGIS_VAULT_ABI, USDC_ADDRESS, ERC20_ABI } from './client.js';
import { logger } from '../../utils/logger.js';
import { resolveArcRpcUrl } from '../../config.js';

/**
 * Calculates the amount of yield to distribute based on a target APY.
 * @param totalAssets Current total assets in the vault
 * @param targetApy Target Annual Percentage Yield (e.g., 0.02 for 2%)
 * @param elapsedSeconds Time elapsed since last distribution
 */
function calculateYieldAmount(totalAssets: bigint, targetApy: number, elapsedSeconds: number): bigint {
  const annualYield = Number(totalAssets) * targetApy;
  const yieldPerSecond = annualYield / (365 * 24 * 60 * 60);
  const amountToDistribute = BigInt(Math.floor(yieldPerSecond * elapsedSeconds));
  return amountToDistribute;
}

export async function runYieldDistributor(privateKey: `0x${string}`, targetApy = 0.02) {
  if (!AEGIS_VAULT_ADDRESS) {
    throw new Error('AEGIS_VAULT_ADDRESS is not configured');
  }

  const account = privateKeyToAccount(privateKey);
  const rpcUrl = await resolveArcRpcUrl();
  const client = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpcUrl),
  }).extend(publicActions);

  logger.info({ admin: account.address }, 'Starting Yield Distributor Cron');

  const totalAssets = await client.readContract({
    address: AEGIS_VAULT_ADDRESS,
    abi: AEGIS_VAULT_ABI,
    functionName: 'totalAssets',
  });

  const lastYieldTimestamp = await client.readContract({
    address: AEGIS_VAULT_ADDRESS,
    abi: AEGIS_VAULT_ABI,
    functionName: 'lastYieldTimestamp',
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  let elapsedSeconds = Number(now - lastYieldTimestamp);

  if (lastYieldTimestamp === 0n || elapsedSeconds <= 0) {
    elapsedSeconds = 3600; 
  }

  const yieldAmount = calculateYieldAmount(totalAssets, targetApy, elapsedSeconds);

  if (yieldAmount <= 0n) {
    logger.info('Calculated yield is 0, skipping distribution.');
    return { status: 'skipped', reason: 'zero_yield' };
  }

  logger.info({ totalAssets: totalAssets.toString(), yieldAmount: yieldAmount.toString(), elapsedSeconds }, 'Calculated target yield');

  const adminBalance = await client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  if (adminBalance < yieldAmount) {
    logger.error({ required: yieldAmount.toString(), balance: adminBalance.toString() }, 'Admin wallet does not have enough USDC to distribute yield.');
    throw new Error('Insufficient USDC in distributor wallet');
  }

  const allowance = await client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, AEGIS_VAULT_ADDRESS],
  });

  if (allowance < yieldAmount) {
    logger.info('Approving USDC for vault distribution...');
    const hash = await client.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [AEGIS_VAULT_ADDRESS, yieldAmount * 1000n],
    });
    await client.waitForTransactionReceipt({ hash, timeout: 600_000 });
  }

  logger.info('Executing distributeYield...');
  const txHash = await client.writeContract({
    address: AEGIS_VAULT_ADDRESS,
    abi: AEGIS_VAULT_ABI,
    functionName: 'distributeYield',
    args: [yieldAmount],
  });

  await client.waitForTransactionReceipt({ hash: txHash, timeout: 600_000 });
  logger.info({ txHash }, 'Yield distributed successfully!');

  return { status: 'success', txHash, yieldAmount: yieldAmount.toString() };
}
