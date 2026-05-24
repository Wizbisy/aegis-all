import { parseUnits } from 'viem';
import { executeContractCall, waitForDcwTransaction } from '../../circle/dcw.js';
import { getPublicClient, AEGIS_VAULT_ADDRESS, AEGIS_VAULT_ABI, ERC20_ABI, USDC_ADDRESS } from './client.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createHash } from 'crypto';

function deriveUUID(base: string, suffix: string): string {
  const hash = createHash('sha256').update(`${base}-${suffix}`).digest('hex');
  const y = ['8', '9', 'a', 'b'][parseInt(hash.charAt(19), 16) % 4]!;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${y}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

interface DepositInput {
  walletId: string;
  walletAddress: string;
  amount: string;
  idempotencyKey?: string;
}

export async function depositToYieldVault(input: DepositInput) {
  if (!AEGIS_VAULT_ADDRESS) {
    throw new AppError(503, 'AEGIS_VAULT_ADDRESS is not configured', 'VAULT_NOT_CONFIGURED');
  }

  const { walletId, walletAddress, amount, idempotencyKey } = input;
  const amountRaw = parseUnits(amount, 6);
  const address = walletAddress as `0x${string}`;

  const client = await getPublicClient();

  const [isAllowlisted, paused, isEmergency] = await Promise.all([
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'isAllowlisted', args: [address] }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'paused' }),
    client.readContract({ address: AEGIS_VAULT_ADDRESS, abi: AEGIS_VAULT_ABI, functionName: 'isEmergencyActive' }),
  ]);

  if (!isAllowlisted) {
    throw new AppError(403, 'Wallet is not allowlisted on the Aegis vault', 'VAULT_NOT_ALLOWLISTED');
  }
  if (paused) {
    throw new AppError(503, 'Aegis vault is currently paused', 'VAULT_PAUSED');
  }
  if (isEmergency) {
    throw new AppError(503, 'Aegis vault is in emergency mode', 'VAULT_EMERGENCY');
  }

  const currentAllowance = await client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, AEGIS_VAULT_ADDRESS],
  });

  if (currentAllowance < amountRaw) {
    logger.info({ walletAddress, amount, vault: AEGIS_VAULT_ADDRESS }, 'Approving USDC spend for vault deposit');
    const approveTxInfo = await executeContractCall({
      walletId,
      contractAddress: USDC_ADDRESS,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [AEGIS_VAULT_ADDRESS, amountRaw.toString()],
      ...(idempotencyKey ? { idempotencyKey: deriveUUID(idempotencyKey, 'approve') } : {}),
    });
    logger.info({ txId: approveTxInfo?.id }, 'USDC approval submitted, waiting for confirmation...');
    await waitForDcwTransaction(approveTxInfo.id);
    logger.info('USDC approval confirmed.');
  }

  logger.info({ walletAddress, amount, vault: AEGIS_VAULT_ADDRESS }, 'Executing vault deposit');
  const depositTxInfo = await executeContractCall({
    walletId,
    contractAddress: AEGIS_VAULT_ADDRESS,
    abiFunctionSignature: 'deposit(uint256,address)',
    abiParameters: [amountRaw.toString(), walletAddress],
    ...(idempotencyKey ? { idempotencyKey: deriveUUID(idempotencyKey, 'deposit') } : {}),
  });

  logger.info({ txId: depositTxInfo?.id }, 'Vault deposit submitted, waiting for confirmation...');
  const depositTx = await waitForDcwTransaction(depositTxInfo.id);
  logger.info('Vault deposit confirmed.');

  return {
    action: 'YIELD_DEPOSIT',
    vault: AEGIS_VAULT_ADDRESS,
    amount,
    receiver: walletAddress,
    txId: depositTx?.id,
    txHash: depositTx?.txHash,
    status: depositTx?.state ?? 'COMPLETE',
  };
}
