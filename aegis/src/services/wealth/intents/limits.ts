import { z } from 'zod';
import { db } from '../../../db/prisma.js';
import { usdcAmountSchema } from '../../../utils/validation.js';

const supportedTokens = z.enum(['USDC', 'EURC', 'cirBTC']);

export const limitOrderSchema = z.object({
  tokenIn: supportedTokens,
  tokenOut: supportedTokens,
  amountIn: usdcAmountSchema,
  targetPrice: usdcAmountSchema,
  condition: z.enum(['LTE', 'GTE']).default('LTE'),
}).refine((data) => data.tokenIn !== data.tokenOut, {
  message: 'tokenIn and tokenOut must be different',
});

export type LimitOrderIntent = z.infer<typeof limitOrderSchema>;

export async function registerLimitOrder(agentId: string, intent: LimitOrderIntent) {
  return db.limitOrder.create({
    data: {
      agentId,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountIn: intent.amountIn,
      targetPrice: intent.targetPrice,
      condition: intent.condition,
      status: 'PENDING',
    },
  });
}

export async function cancelLimitOrder(agentId: string, orderId: string) {
  return db.limitOrder.updateMany({
    where: {
      id: orderId,
      agentId,
      status: 'PENDING',
    },
    data: {
      status: 'CANCELLED',
    },
  });
}
