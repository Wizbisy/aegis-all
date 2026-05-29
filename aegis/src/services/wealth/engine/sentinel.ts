import { logger } from '../../../utils/logger.js';
import { db } from '../../../db/prisma.js';
import { fetchLivePrice } from './oracle.js';
import { executeBackgroundIntent } from './executor.js';

let sentinelInProgress = false;
const LIMIT_ORDER_RECHECK_MINUTES = 1;

export async function runWealthSentinel() {
  if (sentinelInProgress) {
    logger.warn('Wealth Sentinel tick skipped because a previous tick is still running');
    return;
  }

  sentinelInProgress = true;
  logger.info('Wealth Sentinel tick started');

  try {
    const now = new Date();
    const threshold = new Date(Date.now() - 15 * 60 * 1000);

    await db.limitOrder.updateMany({
      where: { status: 'EXECUTING', updatedAt: { lt: threshold } },
      data: { status: 'PENDING', eligibleAt: now },
    });
    await db.dcaSchedule.updateMany({
      where: { status: 'EXECUTING', updatedAt: { lt: threshold } },
      data: { status: 'ACTIVE' },
    });

    const pendingLimits = await db.limitOrder.findMany({
      where: { status: 'PENDING', eligibleAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        agent: {
          select: { walletAddress: true },
        },
      },
    });

    const activeDcas = await db.dcaSchedule.findMany({
      where: { status: 'ACTIVE', nextExecution: { lte: now } },
      orderBy: { nextExecution: 'asc' },
      take: 100,
      include: {
        agent: {
          select: { walletAddress: true },
        },
      },
    });

    if (pendingLimits.length === 0 && activeDcas.length === 0) {
      logger.debug('No pending intents found. Sentinel tick complete.');
      return;
    }

    logger.info({ pendingLimits: pendingLimits.length, dueDcas: activeDcas.length }, 'Processing active intents');

    for (const order of pendingLimits) {
      try {
        const walletAddress = order.agent?.walletAddress;
        if (!walletAddress) {
          logger.warn({ orderId: order.id, agentId: order.agentId }, 'Agent wallet not provisioned, skipping order');
          continue;
        }

        const currentPrice = await fetchLivePrice(order.tokenIn, order.tokenOut, walletAddress);
        const target = Number(order.targetPrice);

        const conditionMet =
          (order.condition === 'LTE' && currentPrice <= target) ||
          (order.condition === 'GTE' && currentPrice >= target);

        if (!conditionMet) {
          const nextCheck = new Date();
          nextCheck.setMinutes(nextCheck.getMinutes() + LIMIT_ORDER_RECHECK_MINUTES);
          await db.$executeRaw`UPDATE "LimitOrder" SET "eligibleAt" = ${nextCheck} WHERE id = ${order.id}`;
          continue;
        }

        logger.info({ orderId: order.id, currentPrice, target, condition: order.condition }, 'Limit Order condition met');

        const claimed = await db.limitOrder.updateMany({
          where: { id: order.id, status: 'PENDING' },
          data: { status: 'EXECUTING' },
        });
        if (claimed.count === 0) {
          logger.info({ orderId: order.id }, 'Limit Order already claimed by another worker');
          continue;
        }

        const tx = await executeBackgroundIntent(
          order.agentId,
          walletAddress,
          order.tokenIn,
          order.tokenOut,
          order.amountIn.toString(),
          order.id,
          'LIMIT_ORDER',
        );

        await db.limitOrder.update({
          where: { id: order.id },
          data: { status: 'EXECUTED', txHash: tx.txHash },
        });
      } catch (err) {
        logger.error({ err, orderId: order.id }, 'Limit Order execution failed');
        await db.limitOrder.update({
          where: { id: order.id },
          data: { status: 'FAILED' },
        });
      }
    }

    for (const dca of activeDcas) {
      try {
        const walletAddress = dca.agent?.walletAddress;
        if (!walletAddress) {
          logger.warn({ dcaId: dca.id, agentId: dca.agentId }, 'Agent wallet not provisioned, skipping DCA');
          continue;
        }

        const claimed = await db.dcaSchedule.updateMany({
          where: { id: dca.id, status: 'ACTIVE', nextExecution: { lte: now } },
          data: { status: 'EXECUTING' },
        });
        if (claimed.count === 0) {
          logger.info({ dcaId: dca.id }, 'DCA already claimed by another worker');
          continue;
        }

        logger.info({ dcaId: dca.id, tokenIn: dca.tokenIn, tokenOut: dca.tokenOut }, 'Executing DCA schedule');

        await executeBackgroundIntent(
          dca.agentId,
          walletAddress,
          dca.tokenIn,
          dca.tokenOut,
          dca.amountInPerTx.toString(),
          dca.id,
          'DCA',
        );

        const nextTime = new Date();
        nextTime.setHours(nextTime.getHours() + dca.frequencyHours);

        const newOrdersExecuted = dca.ordersExecuted + 1;
        const isCompleted = dca.totalOrders > 0 && newOrdersExecuted >= dca.totalOrders;

        await db.dcaSchedule.update({
          where: { id: dca.id },
          data: { 
            status: isCompleted ? 'COMPLETED' : 'ACTIVE', 
            nextExecution: nextTime, 
            failures: 0,
            ordersExecuted: newOrdersExecuted
          },
        });
      } catch (err: any) {
        const errorMsg = String(err?.message || err || '').toLowerCase();
        const isDeterministic = errorMsg.includes('insufficient funds') || errorMsg.includes('balance');

        if (isDeterministic) {
          logger.error({ err, dcaId: dca.id }, 'DCA execution failed (Deterministic). Pausing schedule.');
          await db.dcaSchedule.update({
            where: { id: dca.id },
            data: { status: 'PAUSED_INSUFFICIENT_FUNDS' },
          });
        } else {
          const failures = (dca.failures || 0) + 1;
          if (failures >= 5) {
             logger.error({ err, dcaId: dca.id }, 'DCA failed 5 times (Max Retries). Skipping to next full interval.');
             const nextTime = new Date();
             nextTime.setHours(nextTime.getHours() + dca.frequencyHours);
             await db.dcaSchedule.update({
               where: { id: dca.id },
               data: { status: 'ACTIVE', nextExecution: nextTime, failures: 0 },
             });
          } else {
             const backoffMinutes = 5 * Math.pow(3, failures - 1);
             logger.error({ err, dcaId: dca.id, failures, backoffMinutes }, 'DCA failed (Transient). Applying exponential backoff.');
             const retryTime = new Date();
             retryTime.setMinutes(retryTime.getMinutes() + backoffMinutes);
             await db.dcaSchedule.update({
               where: { id: dca.id },
               data: { status: 'ACTIVE', nextExecution: retryTime, failures },
             });
          }
        }
      }
    }

    logger.info('Wealth Sentinel tick complete');
  } catch (err) {
    logger.error({ err }, 'Wealth Sentinel encountered a critical error');
  } finally {
    sentinelInProgress = false;
  }
}