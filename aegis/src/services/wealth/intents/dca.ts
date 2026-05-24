import { z } from 'zod';
import { db } from '../../../db/prisma.js';
import { usdcAmountSchema } from '../../../utils/validation.js';

const supportedTokens = z.enum(['USDC', 'EURC', 'cirBTC']);

export const dcaSchema = z.object({
  tokenIn: supportedTokens,
  tokenOut: supportedTokens,
  amountInPerTx: usdcAmountSchema,
  frequencyHours: z.number().int().min(1).max(720),
}).refine((data) => data.tokenIn !== data.tokenOut, {
  message: 'tokenIn and tokenOut must be different',
});

export type DcaIntent = z.infer<typeof dcaSchema>;

export async function registerDcaSchedule(agentId: string, intent: DcaIntent) {
  const nextExecution = new Date();
  nextExecution.setHours(nextExecution.getHours() + intent.frequencyHours);

  return db.dcaSchedule.create({
    data: {
      agentId,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountInPerTx: intent.amountInPerTx,
      frequencyHours: intent.frequencyHours,
      nextExecution,
      status: 'ACTIVE',
    },
  });
}

export async function cancelDcaSchedule(agentId: string, scheduleId: string) {
  return db.dcaSchedule.updateMany({
    where: {
      id: scheduleId,
      agentId,
      status: 'ACTIVE',
    },
    data: {
      status: 'CANCELLED',
    },
  });
}
