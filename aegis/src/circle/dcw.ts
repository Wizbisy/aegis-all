import { randomUUID } from 'crypto';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { config, resolveArcRpcUrl } from '../config.js';
import { db } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';
import { AEGIS_VAULT_ADDRESS, AEGIS_VAULT_ABI } from '../services/yield/client.js';

type DcwClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>;

let client: DcwClient | null = null;

export function getDcwClient() {
  if (!client) {
    client = initiateDeveloperControlledWalletsClient({
      apiKey: config.CIRCLE_API_KEY,
      entitySecret: config.ENTITY_SECRET,
    });
  }

  return client;
}

export async function ensureAgentWallet(agentId: string, email: string) {
  const existing = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, walletId: true, walletAddress: true, walletSetId: true },
  });

  if (existing?.walletId && existing.walletAddress && existing.walletSetId) {
    return existing;
  }

  const walletSetResponse = await getDcwClient().createWalletSet({
    name: `Aegis ${email}`,
  });

  const walletSetId = walletSetResponse.data?.walletSet?.id;
  if (!walletSetId) {
    throw new Error('Failed to create developer controlled wallet set');
  }

  const walletResponse = await getDcwClient().createWallets({
    accountType: 'EOA',
    blockchains: [config.ARC_CHAIN],
    count: 1,
    walletSetId,
  });

  const wallet = walletResponse.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error('Failed to create developer controlled wallet');
  }

  const allowlistKey = process.env.ALLOWLIST_ADMIN_PRIVATE_KEY as `0x${string}` | undefined;
  if (allowlistKey && AEGIS_VAULT_ADDRESS) {
    try {
      const account = privateKeyToAccount(allowlistKey);
      const rpcUrl = await resolveArcRpcUrl();
      const viemClient = createWalletClient({
        account,
        chain: arcTestnet,
        transport: http(rpcUrl),
      }).extend(publicActions);
      
      logger.info({ agentWallet: wallet.address }, 'Auto allowlisting new agent wallet for yield vault');
      const hash = await viemClient.writeContract({
        address: AEGIS_VAULT_ADDRESS,
        abi: AEGIS_VAULT_ABI,
        functionName: 'setAllowlist',
        args: [wallet.address as `0x${string}`, true],
      });
      logger.info({ txHash: hash }, 'Submitted allowlist transaction');
    } catch (err) {
      logger.error({ err, agentWallet: wallet.address }, 'Failed to auto allowlist wallet');
    }
  }

  return db.agent.update({
    where: { id: agentId },
    data: {
      walletId: wallet.id,
      walletAddress: wallet.address,
      walletSetId,
    },
    select: { id: true, walletId: true, walletAddress: true, walletSetId: true },
  });
}

export async function getWalletTokenBalances(walletId: string) {
  const response = await getDcwClient().getWalletTokenBalance({ id: walletId });
  return response.data?.tokenBalances ?? [];
}

export async function listAgentWalletRecords() {
  return db.agent.findMany({
    where: { walletAddress: { not: null } },
    select: {
      id: true,
      email: true,
      walletId: true,
      walletAddress: true,
      walletSetId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function sendUsdcTransfer(input: {
  walletId: string;
  destinationAddress: string;
  amount: string;
  idempotencyKey?: string;
}): Promise<any> {
  const request: Record<string, unknown> = {
    amount: [input.amount],
    destinationAddress: input.destinationAddress,
    tokenId: config.CIRCLE_USDC_TOKEN_ID,
    walletId: input.walletId,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  };

  request.idempotencyKey = input.idempotencyKey ?? randomUUID();

  const response = await getDcwClient().createTransaction(request as never);

  return response.data;
}

export async function executeContractCall(input: {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
  idempotencyKey?: string;
}): Promise<any> {
  const request: Record<string, unknown> = {
    walletId: input.walletId,
    contractAddress: input.contractAddress,
    abiFunctionSignature: input.abiFunctionSignature,
    abiParameters: input.abiParameters,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  };

  request.idempotencyKey = input.idempotencyKey ?? randomUUID();

  const response = await getDcwClient().createContractExecutionTransaction(request as never);

  return response.data;
}

export async function estimateTransactionFee(input: {
  walletId: string;
  destinationAddress: string;
  amount: string;
}): Promise<any> {
  const response = await getDcwClient().estimateTransferFee({
    walletId: input.walletId,
    destinationAddress: input.destinationAddress,
    amount: [input.amount],
    tokenId: config.CIRCLE_USDC_TOKEN_ID,
  });

  return response.data;
}

export async function waitForDcwTransaction(txId: string, timeoutMs = 60000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await getDcwClient().getTransaction({ id: txId });
    const tx = response.data?.transaction;
    if (tx?.state === 'COMPLETE') return tx;
    if (tx?.state === 'FAILED') throw new Error(`Circle transaction failed: ${tx.errorReason || 'Unknown error'}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Circle transaction timed out');
}
