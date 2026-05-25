import { db } from '../db/prisma.js';
import { config } from '../config.js';
import { getVaultState, getPublicClient } from '../services/yield/index.js';
import { logger } from './logger.js';

let cachedStats: { expiresAt: number; value: unknown } | null = null;

export async function getPlatformStats(ttlMs = 30_000) {
  const now = Date.now();
  if (cachedStats && cachedStats.expiresAt > now) return cachedStats.value;

  const [agents, audits, successfulAudits, failedAudits, volume, yieldDeposits, yieldWithdrawals, multiYieldLogs] = await Promise.all([
    db.agent.count(),
    db.auditLog.count(),
    db.auditLog.count({ where: { status: 'SUCCESS' } }),
    db.auditLog.count({ where: { status: 'FAILED' } }),
    db.auditLog.aggregate({
      where: { 
        status: 'SUCCESS', 
        amountUsdc: { not: null },
        action: { notIn: ['REGISTER_DCA_SCHEDULE', 'REGISTER_LIMIT_ORDER'] }
      },
      _sum: { amountUsdc: true },
    }),
    db.auditLog.aggregate({
      where: { status: 'SUCCESS', action: 'YIELD_DEPOSIT', amountUsdc: { not: null } },
      _sum: { amountUsdc: true },
    }),
    db.auditLog.aggregate({
      where: { status: 'SUCCESS', action: 'YIELD_WITHDRAW', amountUsdc: { not: null } },
      _sum: { amountUsdc: true },
    }),
    db.auditLog.findMany({
      where: { status: 'SUCCESS', action: 'MULTI_YIELD_DEPOSIT', amountUsdc: { not: null } }
    }),
  ]);

  let vaultState = null;
  try {
    vaultState = await getVaultState();
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch vault state for stats cache');
  }

  let synthraDeposited = 0;
  let aegisMultiDeposited = 0;
  for (const log of multiYieldLogs) {
    const amount = Number(log.amountUsdc);
    const synthraWeight = (log.metadata as any)?.synthraWeight ?? 0;
    const aegisWeight = (log.metadata as any)?.aegisWeight ?? 100;
    synthraDeposited += (amount * synthraWeight) / 100;
    aegisMultiDeposited += (amount * aegisWeight) / 100;
  }

  const aegisStandaloneDeposits = Number(yieldDeposits._sum.amountUsdc ?? 0);
  const totalWithdrawn = Number(yieldWithdrawals._sum.amountUsdc ?? 0);
  
  const aegisTotal = Math.max(0, aegisStandaloneDeposits + aegisMultiDeposited - totalWithdrawn);
  
  let synthraTotal = 0;
  try {
    const activeAgents = await db.agent.findMany({
      where: { isActive: true, walletAddress: { not: null } }
    });

    const client = await getPublicClient();
    const nftManagerAddress = config.SYNTHRA_NFT_POSITION_MANAGER_ADDRESS as `0x${string}`;

    if (nftManagerAddress && activeAgents.length > 0) {
      let totalLiquidity = 0n;

      await Promise.all(activeAgents.map(async (agent) => {
        const address = agent.walletAddress as `0x${string}`;
        try {
          const balance = await client.readContract({
            address: nftManagerAddress,
            abi: [{
              "inputs": [{"internalType": "address","name": "owner","type": "address"}],
              "name": "balanceOf",
              "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
              "stateMutability": "view",
              "type": "function"
            }],
            "functionName": 'balanceOf',
            "args": [address],
          });

          for (let i = 0n; i < balance; i++) {
            const tokenId = await client.readContract({
              address: nftManagerAddress,
              abi: [{
                "inputs": [{"internalType": "address","name": "owner","type": "address"},{"internalType": "uint256","name": "index","type": "uint256"}],
                "name": "tokenOfOwnerByIndex",
                "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
                "stateMutability": "view",
                "type": "function"
              }],
              "functionName": "tokenOfOwnerByIndex",
              "args": [address, i],
            });

            const positionData = await client.readContract({
              address: nftManagerAddress,
              abi: [{
                "inputs": [{"internalType": "uint256","name": "tokenId","type": "uint256"}],
                "name": "positions",
                "outputs": [
                  {"internalType": "uint96","name": "nonce","type": "uint96"},
                  {"internalType": "address","name": "operator","type": "address"},
                  {"internalType": "address","name": "token0","type": "address"},
                  {"internalType": "address","name": "token1","type": "address"},
                  {"internalType": "uint24","name": "fee","type": "uint24"},
                  {"internalType": "int24","name": "tickLower","type": "int24"},
                  {"internalType": "int24","name": "tickUpper","type": "int24"},
                  {"internalType": "uint128","name": "liquidity","type": "uint128"},
                  {"internalType": "uint256","name": "feeGrowthInside0LastX128","type": "uint256"},
                  {"internalType": "uint256","name": "feeGrowthInside1LastX128","type": "uint256"},
                  {"internalType": "uint128","name": "tokensOwed0","type": "uint128"},
                  {"internalType": "uint128","name": "tokensOwed1","type": "uint128"}
                ],
                "stateMutability": "view",
                "type": "function"
              }],
              "functionName": 'positions',
              "args": [tokenId as any],
            }) as any;

            const liquidity = BigInt(positionData[7].toString());
            totalLiquidity += liquidity;
          }
        } catch (agentErr) {
          logger.warn({ agentErr, email: agent.email }, 'Failed to fetch on-chain positions for agent');
        }
      }));

      synthraTotal = Number(totalLiquidity) / 37653925;
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch on-chain Synthra V3 positions for stats cache. Falling back to history.');
    synthraTotal = Math.max(0, synthraDeposited);
  }
  
  const aegisTvlFinal = vaultState ? Number(vaultState.totalAssets) : aegisTotal;
  const totalTvl = aegisTvlFinal + synthraTotal;

  const value = {
    agents,
    audits,
    successfulAudits,
    failedAudits,
    successfulVolumeUsdc: String(volume._sum.amountUsdc ?? 0),
    vaultTvlUsdc: String(totalTvl),
    aegisTvlUsdc: String(aegisTvlFinal),
    synthraTvlUsdc: String(synthraTotal),
    vaultApy: vaultState?.estimatedAPYPercent ?? 0,
  };

  cachedStats = { expiresAt: now + ttlMs, value };
  return value;
}

export function clearStatsCache() {
  cachedStats = null;
}
