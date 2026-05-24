import { parseUnits, formatUnits } from 'viem';
import { executeContractCall, waitForDcwTransaction } from '../../circle/dcw.js';
import { getPublicClient, AEGIS_VAULT_ADDRESS, AEGIS_VAULT_ABI } from './client.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

interface WithdrawInput {
  walletId: string;
  walletAddress: string;
  amount: string;
  idempotencyKey?: string;
}

export async function withdrawFromYieldVault(input: WithdrawInput) {
  if (!AEGIS_VAULT_ADDRESS) {
    throw new AppError(503, 'AEGIS_VAULT_ADDRESS is not configured', 'VAULT_NOT_CONFIGURED');
  }

  const { walletId, walletAddress, amount, idempotencyKey } = input;
  const amountRaw = parseUnits(amount, 6);
  const address = walletAddress as `0x${string}`;

  const client = await getPublicClient();

  const [paused, isEmergency, maxWithdrawable, lastDeposit, withdrawLock] = await Promise.all([
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'paused' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'isEmergencyActive' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'maxWithdraw', args: [address] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'lastDepositTime', args: [address] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'withdrawLockPeriod' }),
  ]);

  if (paused) {
    throw new AppError(503, 'Aegis vault is currently paused', 'VAULT_PAUSED');
  }
  if (isEmergency) {
    throw new AppError(503, 'Aegis vault is in emergency mode', 'VAULT_EMERGENCY');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const lockExpiry = Number(lastDeposit) + Number(withdrawLock);
  if (nowSeconds < lockExpiry) {
    const remainingSeconds = lockExpiry - nowSeconds;
    throw new AppError(403, `Withdrawal locked for ${remainingSeconds} more seconds`, 'WITHDRAW_LOCKED', {
      lockExpiresAt: new Date(lockExpiry * 1000).toISOString(),
      remainingSeconds,
    });
  }

  if (amountRaw > maxWithdrawable) {
    throw new AppError(400, `Requested ${amount} USDC exceeds maximum withdrawable ${formatUnits(maxWithdrawable, 6)} USDC`, 'INSUFFICIENT_SHARES', {
      requested: amount,
      maxWithdrawable: formatUnits(maxWithdrawable, 6),
    });
  }

  logger.info({ walletAddress, amount, vault: AEGIS_VAULT_ADDRESS }, 'Executing vault withdrawal');
  const withdrawTxInfo = await executeContractCall({
    walletId,
    contractAddress: AEGIS_VAULT_ADDRESS,
    abiFunctionSignature: 'withdraw(uint256,address,address)',
    abiParameters: [amountRaw.toString(), walletAddress, walletAddress],
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  logger.info({ txId: withdrawTxInfo?.id }, 'Vault withdrawal submitted, waiting for confirmation...');
  const withdrawTx = await waitForDcwTransaction(withdrawTxInfo.id);
  logger.info('Vault withdrawal confirmed.');

  return {
    action: 'YIELD_WITHDRAW',
    vault: AEGIS_VAULT_ADDRESS,
    amount,
    receiver: walletAddress,
    txId: withdrawTx?.id,
    txHash: withdrawTx?.txHash,
    status: withdrawTx?.state ?? 'COMPLETE',
  };
}
