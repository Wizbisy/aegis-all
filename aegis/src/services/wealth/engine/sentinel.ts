import { logger } from '../../../utils/logger.js';
import { db } from '../../../db/prisma.js';
import { fetchLivePrice } from './oracle.js';
import { executeBackgroundIntent } from './executor.js';

export async function runWealthSentinel() {
  logger.info('Wealth Sentinel tick started');

  try {
    const pendingLimits = await db.limitOrder.findMany({ where: { status: 'PENDING' } });

    const now = new Date();
    const activeDcas = await db.dcaSchedule.findMany({
      where: { status: 'ACTIVE', nextExecution: { lte: now } },
    });

    if (pendingLimits.length === 0 && activeDcas.length === 0) {
      logger.debug('No pending intents found. Sentinel tick complete.');
      return;
    }

    logger.info({ pendingLimits: pendingLimits.length, dueDcas: activeDcas.length }, 'Processing active intents');

    for (const order of pendingLimits) {
      try {
        const wallet = await db.agent.findUnique({
          where: { id: order.agentId },
          select: { walletAddress: true },
        });
        if (!wallet?.walletAddress) {
          logger.warn({ orderId: order.id, agentId: order.agentId }, 'Agent wallet not provisioned, skipping order');
          continue;
        }

        const currentPrice = await fetchLivePrice(order.tokenIn, order.tokenOut, wallet.walletAddress);
        const target = Number(order.targetPrice);

        const conditionMet =
          (order.condition === 'LTE' && currentPrice <= target) ||
          (order.condition === 'GTE' && currentPrice >= target);

        if (!conditionMet) continue;

        logger.info({ orderId: order.id, currentPrice, target, condition: order.condition }, 'Limit Order condition met');


        const tx = await executeBackgroundIntent(
          order.agentId,
          wallet.walletAddress,
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
        const wallet = await db.agent.findUnique({
          where: { id: dca.agentId },
          select: { walletAddress: true },
        });
        if (!wallet?.walletAddress) {
          logger.warn({ dcaId: dca.id, agentId: dca.agentId }, 'Agent wallet not provisioned, skipping DCA');
          continue;
        }

        logger.info({ dcaId: dca.id, tokenIn: dca.tokenIn, tokenOut: dca.tokenOut }, 'Executing DCA schedule');

        await executeBackgroundIntent(
          dca.agentId,
          wallet.walletAddress,
          dca.tokenIn,
          dca.tokenOut,
          dca.amountInPerTx.toString(),
          dca.id,
          'DCA',
        );

        const nextTime = new Date();
        nextTime.setHours(nextTime.getHours() + dca.frequencyHours);

        await db.dcaSchedule.update({
          where: { id: dca.id },
          data: { nextExecution: nextTime },
        });
      } catch (err) {
        logger.error({ err, dcaId: dca.id }, 'DCA execution failed, will retry next tick');
      }
    }

    logger.info('Wealth Sentinel tick complete');
  } catch (err) {
    logger.error({ err }, 'Wealth Sentinel encountered a critical error');
  }
}
