import { db } from '../db/prisma.js';
import { listAgentWalletRecords } from './dcw.js';
import { getDcwClient } from './dcw.js';
import { logger } from '../utils/logger.js';

export async function getWalletBalance(walletId: string) {
  logger.info({ walletId }, 'Fetching multi-chain balance for walletId');
  const agent = await db.agent.findUnique({
    where: { walletId },
    select: { walletSetId: true },
  });

  logger.info({ agent }, 'Found agent for balance check');

  if (!agent?.walletSetId) {
    logger.warn('No walletSetId found for agent, falling back to single wallet balance');
    const client = getDcwClient();
    const response = await client.getWalletTokenBalance({ id: walletId });
    return response.data?.tokenBalances ?? [];
  }

  const client = getDcwClient();
  const walletsRes = await client.listWallets({
    walletSetId: agent.walletSetId,
  });

  const wallets = walletsRes.data?.wallets ?? [];
  logger.info({ walletCount: wallets.length }, 'Fetched wallets in wallet set');
  const allBalances: any[] = [];

  for (const w of wallets) {
    try {
      const balancesRes = await client.getWalletTokenBalance({ id: w.id });
      const balances = balancesRes.data?.tokenBalances ?? [];
      logger.info({ blockchain: w.blockchain, balanceCount: balances.length }, 'Fetched balance for wallet');
      for (const bal of balances) {
        allBalances.push({
          ...bal,
          walletId: w.id,
          blockchain: w.blockchain,
          address: w.address,
        });
      }
    } catch (e: any) {
      logger.error({ err: e.message, walletId: w.id }, 'Failed to get wallet balance in set');
    }
  }

  return allBalances;
}

export async function createAgentWallet() {
  throw new Error('Agent wallet creation now happens through developer controlled wallet provisioning.');
}

export async function listAgentWallets() {
  return listAgentWalletRecords();
}

export async function getPrimaryAgentWalletAddress() {
  const agent = await db.agent.findFirst({
    where: { walletAddress: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { walletAddress: true },
  });

  if (!agent?.walletAddress) {
    throw new Error('No developer controlled wallet address found. Provision an agent wallet first.');
  }

  return agent.walletAddress;
}
