import { Hono } from 'hono';
import { z } from 'zod';
import { agentAuth } from '../auth/middleware.js';
import { transferUsdc } from '../actions/transfer.js';
import { payForService } from '../actions/pay.js';
import { getWalletBalance } from '../circle/wallet.js';
import { db } from '../db/prisma.js';
import { assertPolicyAllows } from '../policy/engine.js';
import { bridgeUsdc, getBridgeFee, getBridgeStatus, listSupportedChains } from '../actions/bridge.js';
import { estimateTransfer, estimatePaidService, estimateBridge } from '../actions/simulate.js';
import { getSwapQuote, executeTokenSwap, getSwapHistory } from '../services/swap/index.js';
import { generateTaxLedger, harvestTaxLosses } from '../services/audit/index.js';
import { limitOrderSchema, registerLimitOrder, cancelLimitOrder, dcaSchema, registerDcaSchedule, cancelDcaSchedule, executeMultiYieldDeposit, getAgentWealthLedger, summarizePortfolioMetrics } from '../services/wealth/index.js';
import { getVaultState, listYieldVaults, getAgentVaultBalance, depositToYieldVault, withdrawFromYieldVault } from '../services/yield/index.js';
import { startAuditAction, completeAuditAction, failAuditAction } from '../utils/audit.js';
import { AppError } from '../utils/errors.js';
import { completeIdempotency, failIdempotency, idempotencyMiddleware } from '../utils/idempotency.js';
import { fail } from '../utils/response.js';
import type { AppBindings } from '../utils/types.js';
import { getClientIp, slidingWindowRateLimit } from '../utils/ratelimit.js';
import { evmAddressSchema, outboundHeaderSchema, serviceUrlSchema, usdcAmountSchema, swapSchema, swapEstimateSchema } from '../utils/validation.js';
import { validateAgentAllocation } from '../services/wealth/yield/allocator.js';

/**
 * Helper to handle successful completion of a financial action,
 * ensuring the audit log and idempotency record are both finalized.
 */
async function handleActionSuccess(c: any, auditId: string, idempotencyId: string, data: any) {
  await completeAuditAction(auditId, { 
    signature: data.txHash || data.hash || data.burnTxHash || data.serviceUrl, 
    result: data 
  });
  const body = { success: true, result: data };
  await completeIdempotency(idempotencyId, 200, body);
  return c.json(body);
}

/**
 * Helper to handle failures in financial actions, ensuring the 
 * audit log records the failure and the idempotency record is updated
 * with the correct error code and status.
 */
async function handleActionError(c: any, auditId: string, idempotencyId: string, err: any) {
  const { logger } = await import('../utils/logger.js');
  logger.error({ err, auditId }, 'Action failed');
  await failAuditAction(auditId, err);
  const status = err instanceof AppError ? err.status : 500;
  const body = err instanceof AppError 
    ? { success: false, error: err.message, code: err.code } 
    : { success: false, error: 'Internal server error' };
  await failIdempotency(idempotencyId, status, body);
  return fail(c, err);
}

export const actionsRouter = new Hono<AppBindings>();

const transferSchema = z.object({
  destination: evmAddressSchema,
  amount: usdcAmountSchema,
});

const paySchema = z.object({
  serviceUrl: serviceUrlSchema,
  maxAmount: usdcAmountSchema,
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  data: z.unknown().optional(),
  headers: z.array(outboundHeaderSchema).max(10).optional(),
});

const bridgeSchema = z.object({
  fromChain: z.string().min(2).max(40),
  toChain: z.string().min(2).max(40),
  recipient: evmAddressSchema.optional(),
  amount: usdcAmountSchema,
});

const bridgeFeeSchema = z.object({
  fromChain: z.string().min(2).max(40),
  toChain: z.string().min(2).max(40),
});

const bridgeStatusSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

async function resolveAgentWallet(agent: { id: string; walletId?: string | null; walletAddress?: string | null }) {
  if (agent.walletId && agent.walletAddress) {
    return { walletId: agent.walletId, walletAddress: agent.walletAddress };
  }

  const wallet = await db.agent.findUnique({
    where: { id: agent.id },
    select: { walletId: true, walletAddress: true },
  });

  if (!wallet?.walletId || !wallet.walletAddress) {
    throw new AppError(409, 'Agent wallet has not been provisioned', 'WALLET_NOT_PROVISIONED');
  }

  return { walletId: wallet.walletId, walletAddress: wallet.walletAddress };
}

// All routes in this router require the agent to provide their Bearer token
actionsRouter.use('*', agentAuth);
actionsRouter.use('*', slidingWindowRateLimit({
  name: 'actions',
  limit: 120,
  windowMs: 60 * 1000,
  key: (c) => c.get('agent')?.id ?? getClientIp(c),
}));

actionsRouter.get('/', (c) => {
  return c.json({
    success: true,
    routes: {
      wallet: 'GET /v1/actions/wallet',
      balance: 'GET /v1/actions/balance',
      transfer: 'POST /v1/actions/transfer',
      pay: 'POST /v1/actions/pay',
      bridge: 'POST /v1/actions/bridge',
      bridgeFee: 'POST /v1/actions/bridge/fee',
      bridgeStatus: 'POST /v1/actions/bridge/status',
      asyncStatus: 'GET /v1/actions/status/:auditId',
      bridgeChains: 'GET /v1/actions/bridge/chains',
      estimateTransfer: 'POST /v1/actions/estimate/transfer',
      estimatePay: 'POST /v1/actions/estimate/pay',
      estimateBridge: 'POST /v1/actions/estimate/bridge',
      policy: 'GET /v1/actions/policy',
      yieldVaults: 'GET /v1/actions/yield/vaults',
      yieldVault: 'GET /v1/actions/yield/vault',
      yieldBalance: 'GET /v1/actions/yield/balance',
      yieldDeposit: 'POST /v1/actions/yield/deposit',
      yieldWithdraw: 'POST /v1/actions/yield/withdraw',
      wealthLimitOrder: 'POST /v1/actions/wealth/limitOrder',
      wealthLimitOrderCancel: 'POST /v1/actions/wealth/limitOrder/cancel',
      wealthDca: 'POST /v1/actions/wealth/dca',
      wealthDcaCancel: 'POST /v1/actions/wealth/dca/cancel',
      wealthMultiYield: 'POST /v1/actions/wealth/multiYield',
      wealthIntents: 'GET /v1/actions/wealth/intents',
      wealthMetrics: 'GET /v1/actions/wealth/metrics',
    },
  });
});

// GET /actions/wallet -> Returns agent wallet metadata
actionsRouter.get('/wallet', async (c) => {
  try {
    const agent = c.get('agent');
    const wallet = await resolveAgentWallet(agent);
    return c.json({ success: true, wallet });
  } catch (err) {
    return fail(c, err);
  }
});

// GET /actions/balance -> Checks wallet balance
actionsRouter.get('/balance', async (c) => {
  try {
    const agent = c.get('agent');
    const wallet = await resolveAgentWallet(agent);
    const balance = await getWalletBalance(wallet.walletId);
    return c.json({ success: true, wallet, balance });
  } catch (err) {
    return fail(c, err);
  }
});

// GET /actions/policy -> Returns agent financial policy
actionsRouter.get('/nonce', async (c) => {
  const agent = c.get('agent');
  const record = await db.agent.findUnique({
    where: { id: agent.id },
    select: { actionNonce: true },
  });
  return c.json({ success: true, nonce: record?.actionNonce ?? 0 });
});

actionsRouter.get('/policy', async (c) => {
  try {
    const agent = c.get('agent');
    const policy = await db.agentPolicy.findUnique({
      where: { agentId: agent.id },
    });
    return c.json({ success: true, policy });
  } catch (err) {
    return fail(c, err);
  }
});

// GET /actions/swap/history -> Returns historical swaps executed by the agent
actionsRouter.get('/swap/history', async (c) => {
  try {
    const agent = c.get('agent');
    const limit = Number(c.req.query('limit') || '50');
    const history = await getSwapHistory(agent.id, limit);
    return c.json({ success: true, history });
  } catch (err) {
    return fail(c, err);
  }
});

// POST /actions/transfer -> Sends USDC on Arc
actionsRouter.post('/transfer', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = transferSchema.safeParse(c.get('validatedBody'));
  
  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid transfer payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const { destination, amount } = parsed.data;
  const agent = c.get('agent');
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'TRANSFER_USDC',
    amountUsdc: amount,
    idempotencyKey: idempotencyKeyHash,
    metadata: { destination },
  });

  try {
    await assertPolicyAllows(agent.id, amount, { excludeAuditId: audit.id });
    const wallet = await resolveAgentWallet(agent);
    const tx = await transferUsdc(wallet.walletId, destination, amount, idempotencyRecordId);
    return handleActionSuccess(c, audit.id, idempotencyRecordId, tx);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

actionsRouter.get('/bridge/chains', (c) => {
  return c.json({ success: true, chains: listSupportedChains() });
});

actionsRouter.post('/bridge/fee', async (c) => {
  const parsed = bridgeFeeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid bridge fee payload' }, 400);
  }

  try {
    const fee = await getBridgeFee({
      toChain: parsed.data.toChain,
      fromChain: parsed.data.fromChain,
    });
    return c.json({ success: true, fee });
  } catch (err) {
    return fail(c, err);
  }
});

actionsRouter.post('/bridge/status', async (c) => {
  const parsed = bridgeStatusSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid bridge status payload' }, 400);
  }

  try {
    const status = await getBridgeStatus({ txHash: parsed.data.txHash });
    return c.json({ success: true, status });
  } catch (err) {
    return fail(c, err);
  }
});

// GET /actions/status/:auditId -> Queries the status of an asynchronous action (e.g. bridge)
actionsRouter.get('/status/:auditId', async (c) => {
  const auditId = c.req.param('auditId');
  const agent = c.get('agent');

  try {
    const audit = await db.auditLog.findFirst({
      where: { id: auditId, agentId: agent.id },
    });

    if (!audit) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }

    return c.json({
      success: true,
      action: audit.action,
      status: audit.status,
      txHash: audit.signature,
      error: audit.error,
      createdAt: audit.createdAt,
      updatedAt: audit.updatedAt,
    });
  } catch (err) {
    return fail(c, err);
  }
});

// POST /actions/bridge -> Executes CCTP bridge
actionsRouter.post('/bridge', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = bridgeSchema.safeParse(c.get('validatedBody'));
  
  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid bridge payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const agent = c.get('agent');
  const wallet = await resolveAgentWallet(agent);
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'CCTP_BRIDGE_USDC',
    amountUsdc: parsed.data.amount,
    idempotencyKey: idempotencyKeyHash,
    metadata: { toChain: parsed.data.toChain, recipient: parsed.data.recipient ?? wallet.walletAddress },
  });

  try {
    await assertPolicyAllows(agent.id, parsed.data.amount, { excludeAuditId: audit.id });
    bridgeUsdc({
      walletAddress: wallet.walletAddress,
      fromChain: parsed.data.fromChain,
      toChain: parsed.data.toChain,
      amount: parsed.data.amount,
      idempotencyKey: idempotencyRecordId,
      ...(parsed.data.recipient ? { recipient: parsed.data.recipient } : {}),
    }).then(async (bridge) => {
      const steps = (bridge as any)?.steps as Array<{ name?: string; txHash?: string }> | undefined;
      const burnStep = steps?.find((s) => s.name?.toLowerCase() === 'burn');
      const txHash = burnStep?.txHash ?? steps?.find((s) => s.txHash)?.txHash;
      await completeAuditAction(audit.id, { 
        ...(txHash ? { signature: txHash } : {}),
        result: bridge 
      }).catch(() => {});
    }).catch(async (err) => {
      const { logger } = await import('../utils/logger.js');
      logger.error({ err, auditId: audit.id }, 'Async bridge execution failed');
      await failAuditAction(audit.id, err).catch(() => {});
    });

    const responseData = { 
      state: 'pending', 
      message: 'Bridge transfer is processing in the background. Poll GET /v1/actions/status/' + audit.id + ' to check progress.',
      auditId: audit.id,
    };
    const body = { success: true, result: responseData };
    
    await completeIdempotency(idempotencyRecordId, 202, body);
    await db.auditLog.update({ where: { id: audit.id }, data: { status: 'PROCESSING' }});

    return c.json(body, 202);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

// POST /actions/pay -> Executes an x402 Micropayment
actionsRouter.post('/pay', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = paySchema.safeParse(c.get('validatedBody'));
  
  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payment payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const agent = c.get('agent');
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'X402_PAY',
    amountUsdc: parsed.data.maxAmount,
    idempotencyKey: idempotencyKeyHash,
    metadata: { serviceUrl: parsed.data.serviceUrl },
  });

  try {
    await assertPolicyAllows(agent.id, parsed.data.maxAmount, { excludeAuditId: audit.id });
    const wallet = await resolveAgentWallet(agent);
    const tx = await payForService({
      serviceUrl: parsed.data.serviceUrl,
      walletAddress: wallet.walletAddress,
      maxAmount: parsed.data.maxAmount,
      ...(parsed.data.method ? { method: parsed.data.method } : {}),
      ...(parsed.data.data !== undefined ? { data: parsed.data.data } : {}),
      ...(parsed.data.headers ? { headers: parsed.data.headers } : {}),
    });
    return handleActionSuccess(c, audit.id, idempotencyRecordId, tx);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

// POST /actions/estimate/transfer -> Dry run transfer cost estimate
actionsRouter.post('/estimate/transfer', async (c) => {
  const parsed = transferSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid transfer payload' }, 400);
  }

  try {
    const agent = c.get('agent');
    const wallet = await resolveAgentWallet(agent);
    const estimate = await estimateTransfer(wallet.walletId, parsed.data.destination, parsed.data.amount);
    return c.json({ success: true, estimate });
  } catch (err) {
    return fail(c, err);
  }
});

// POST /actions/estimate/pay -> Dry run x402 payment cost estimate
actionsRouter.post('/estimate/pay', async (c) => {
  const parsed = paySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payment payload' }, 400);
  }

  try {
    const agent = c.get('agent');
    const wallet = await resolveAgentWallet(agent);
    const estimate = await estimatePaidService({
      serviceUrl: parsed.data.serviceUrl,
      walletAddress: wallet.walletAddress,
      maxAmount: parsed.data.maxAmount,
      ...(parsed.data.method ? { method: parsed.data.method } : {}),
      ...(parsed.data.data !== undefined ? { data: parsed.data.data } : {}),
      ...(parsed.data.headers ? { headers: parsed.data.headers } : {}),
    });
    return c.json({ success: true, estimate });
  } catch (err) {
    return fail(c, err);
  }
});

// POST /actions/estimate/bridge -> Dry run bridge cost estimate
actionsRouter.post('/estimate/bridge', async (c) => {
  const parsed = bridgeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid bridge payload' }, 400);
  }

  try {
    const agent = c.get('agent');
    const wallet = await resolveAgentWallet(agent);
    const estimate = await estimateBridge(parsed.data.toChain, parsed.data.amount, wallet.walletId, parsed.data.fromChain);
    return c.json({ success: true, estimate });
  } catch (err) {
    return fail(c, err);
  }
});

// POST /actions/swap/estimate -> Estimates  swap outputs and fees
actionsRouter.post('/swap/estimate', async (c) => {
  const parsed = swapEstimateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid swap estimate payload' }, 400);
  }

  try {
    const agent = c.get('agent');
    const wallet = await resolveAgentWallet(agent);
    const quote = await getSwapQuote({
      tokenIn: parsed.data.tokenIn,
      tokenOut: parsed.data.tokenOut,
      amountIn: parsed.data.amount,
      walletAddress: wallet.walletAddress,
    });
    return c.json({ success: true, quote });
  } catch (err) {
    return fail(c, err);
  }
});

// POST /actions/swap -> Performs token swap
actionsRouter.post('/swap', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = swapSchema.safeParse(c.get('validatedBody'));

  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid swap payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const { tokenIn, tokenOut, amount, slippageBps } = parsed.data;
  const agent = c.get('agent');
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'TOKEN_SWAP',
    amountUsdc: amount,
    idempotencyKey: idempotencyKeyHash,
    metadata: { tokenIn, tokenOut, slippageBps },
  });

  try {
    await assertPolicyAllows(agent.id, amount, { excludeAuditId: audit.id });
    
    const wallet = await resolveAgentWallet(agent);
    
    const swapTx = await executeTokenSwap({
      walletAddress: wallet.walletAddress,
      tokenIn,
      tokenOut,
      amountIn: amount,
      ...(slippageBps !== undefined ? { slippageBps } : {}),
    });

    return handleActionSuccess(c, audit.id, idempotencyRecordId, swapTx);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

// GET /actions/audit/ledger -> Generates the tax compliance ledger statement
actionsRouter.get('/audit/ledger', async (c) => {
  try {
    const agent = c.get('agent');
    const ledger = await generateTaxLedger(agent.id);
    return c.json({ success: true, ledger });
  } catch (err) {
    return fail(c, err);
  }
});

// POST /actions/audit/harvest -> Triggers the tax loss harvesting execution or simulation loop
actionsRouter.post('/audit/harvest', async (c) => {
  try {
    const agent = c.get('agent');
    const wallet = await resolveAgentWallet(agent);
    
    const body = await c.req.json().catch(() => ({}));
    const executionMode = body.executionMode === 'HARVEST' ? 'HARVEST' : 'SIMULATE';
    const taxBracket = body.taxBracket !== undefined ? Number(body.taxBracket) : undefined;

    const args: {
      agentId: string;
      walletAddress: string;
      executionMode: 'HARVEST' | 'SIMULATE';
      taxBracket?: number;
    } = {
      agentId: agent.id,
      walletAddress: wallet.walletAddress,
      executionMode,
    };

    if (taxBracket !== undefined) {
      args.taxBracket = taxBracket;
    }

    const report = await harvestTaxLosses(args);
    return c.json({ success: true, report });
  } catch (err) {
    return fail(c, err);
  }
});

const yieldDepositSchema = z.object({
  amount: usdcAmountSchema,
});

const yieldWithdrawSchema = z.object({
  amount: usdcAmountSchema,
});

actionsRouter.get('/yield/vaults', async (c) => {
  try {
    const vaults = listYieldVaults();
    return c.json({ success: true, vaults });
  } catch (err) {
    return fail(c, err);
  }
});

actionsRouter.get('/yield/vault', async (c) => {
  try {
    const state = await getVaultState();
    return c.json({ success: true, vault: state });
  } catch (err) {
    return fail(c, err);
  }
});

actionsRouter.get('/yield/balance', async (c) => {
  try {
    const agent = c.get('agent');
    const wallet = await resolveAgentWallet(agent);
    const balance = await getAgentVaultBalance(wallet.walletAddress);
    return c.json({ success: true, balance });
  } catch (err) {
    return fail(c, err);
  }
});

actionsRouter.post('/yield/deposit', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = yieldDepositSchema.safeParse(c.get('validatedBody'));

  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid yield deposit payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const agent = c.get('agent');
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'YIELD_DEPOSIT',
    amountUsdc: parsed.data.amount,
    idempotencyKey: idempotencyKeyHash,
    metadata: { vault: 'aegis-ausdc-v1' },
  });

  try {
    await assertPolicyAllows(agent.id, parsed.data.amount, { excludeAuditId: audit.id });
    const wallet = await resolveAgentWallet(agent);
    const result = await depositToYieldVault({
      walletId: wallet.walletId,
      walletAddress: wallet.walletAddress,
      amount: parsed.data.amount,
      idempotencyKey: idempotencyRecordId,
    });
    return handleActionSuccess(c, audit.id, idempotencyRecordId, result);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

actionsRouter.post('/yield/withdraw', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = yieldWithdrawSchema.safeParse(c.get('validatedBody'));

  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid yield withdraw payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const agent = c.get('agent');
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'YIELD_WITHDRAW',
    amountUsdc: parsed.data.amount,
    idempotencyKey: idempotencyKeyHash,
    metadata: { vault: 'aegis-ausdc-v1' },
  });

  try {
    const wallet = await resolveAgentWallet(agent);
    const result = await withdrawFromYieldVault({
      walletId: wallet.walletId,
      walletAddress: wallet.walletAddress,
      amount: parsed.data.amount,
      idempotencyKey: idempotencyRecordId,
    });
    return handleActionSuccess(c, audit.id, idempotencyRecordId, result);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

const wealthLimitOrderSchema = limitOrderSchema;
const wealthDcaSchema = dcaSchema;

const multiYieldSchema = z.object({
  amountUsdc: usdcAmountSchema,
  aegisWeight: z.number().int().min(0).max(100),
  synthraWeight: z.number().int().min(0).max(100),
}).superRefine((data, ctx) => {
  try {
    validateAgentAllocation(data.aegisWeight, data.synthraWeight);
  } catch (err) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err instanceof Error ? err.message : 'Invalid multi yield allocation',
      path: ['synthraWeight'],
    });
  }
});

const cancelIntentSchema = z.object({ id: z.string().uuid() });

actionsRouter.get('/wealth/intents', async (c) => {
  try {
    const agent = c.get('agent');
    const ledger = await getAgentWealthLedger(agent.id);
    return c.json({ success: true, ledger });
  } catch (err) {
    return fail(c, err);
  }
});

actionsRouter.get('/wealth/metrics', async (c) => {
  try {
    const agent = c.get('agent');
    const metrics = await summarizePortfolioMetrics(agent.id);
    return c.json({ success: true, metrics });
  } catch (err) {
    return fail(c, err);
  }
});

actionsRouter.post('/wealth/limitOrder', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = wealthLimitOrderSchema.safeParse(c.get('validatedBody'));

  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid limit order payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const agent = c.get('agent');
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'REGISTER_LIMIT_ORDER',
    amountUsdc: parsed.data.amountIn,
    idempotencyKey: idempotencyKeyHash,
    metadata: { tokenIn: parsed.data.tokenIn, tokenOut: parsed.data.tokenOut, targetPrice: parsed.data.targetPrice, condition: parsed.data.condition },
  });

  try {
    await assertPolicyAllows(agent.id, parsed.data.amountIn, { excludeAuditId: audit.id });
    const order = await registerLimitOrder(agent.id, parsed.data);
    return handleActionSuccess(c, audit.id, idempotencyRecordId, order);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

actionsRouter.post('/wealth/limitOrder/cancel', async (c) => {
  try {
    const agent = c.get('agent');
    const parsed = cancelIntentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ success: false, error: 'A valid limit order id is required' }, 400);
    }
    const result = await cancelLimitOrder(agent.id, parsed.data.id);
    return c.json({ success: true, cancelled: result.count > 0 });
  } catch (err) {
    return fail(c, err);
  }
});

actionsRouter.post('/wealth/dca', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = wealthDcaSchema.safeParse(c.get('validatedBody'));

  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid DCA payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const agent = c.get('agent');
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'REGISTER_DCA_SCHEDULE',
    amountUsdc: parsed.data.amountInPerTx,
    idempotencyKey: idempotencyKeyHash,
    metadata: { tokenIn: parsed.data.tokenIn, tokenOut: parsed.data.tokenOut, frequencyHours: parsed.data.frequencyHours },
  });

  try {
    await assertPolicyAllows(agent.id, parsed.data.amountInPerTx, { excludeAuditId: audit.id });
    const schedule = await registerDcaSchedule(agent.id, parsed.data);
    return handleActionSuccess(c, audit.id, idempotencyRecordId, schedule);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

actionsRouter.post('/wealth/dca/cancel', async (c) => {
  try {
    const agent = c.get('agent');
    const parsed = cancelIntentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ success: false, error: 'A valid DCA schedule id is required' }, 400);
    }
    const result = await cancelDcaSchedule(agent.id, parsed.data.id);
    return c.json({ success: true, cancelled: result.count > 0 });
  } catch (err) {
    return fail(c, err);
  }
});

actionsRouter.post('/wealth/multiYield', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  const parsed = multiYieldSchema.safeParse(c.get('validatedBody'));

  if (!parsed.success) {
    const body = { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid multi yield payload' };
    await failIdempotency(idempotencyRecordId, 400, body);
    return c.json(body, 400);
  }

  const agent = c.get('agent');
  const wallet = await resolveAgentWallet(agent);

  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'MULTI_YIELD_DEPOSIT',
    amountUsdc: parsed.data.amountUsdc,
    idempotencyKey: idempotencyKeyHash,
    metadata: { aegisWeight: parsed.data.aegisWeight, synthraWeight: parsed.data.synthraWeight },
  });

  try {
    await assertPolicyAllows(agent.id, parsed.data.amountUsdc, { excludeAuditId: audit.id });
    const result = await executeMultiYieldDeposit({
      walletId: wallet.walletId,
      walletAddress: wallet.walletAddress,
      amountUsdc: parsed.data.amountUsdc,
      aegisWeight: parsed.data.aegisWeight,
      synthraWeight: parsed.data.synthraWeight,
      idempotencyKey: idempotencyRecordId,
    });
    return handleActionSuccess(c, audit.id, idempotencyRecordId, result);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});

// POST /actions/wealth/yield/synthra/withdraw -> Manually close Synthra V3 position
actionsRouter.post('/wealth/yield/synthra/withdraw', idempotencyMiddleware, async (c) => {
  const idempotencyRecordId = c.get('idempotencyRecordId');
  const idempotencyKeyHash = c.get('idempotencyKeyHash');
  
  const agent = c.get('agent');
  const audit = await startAuditAction({
    agentId: agent.id,
    action: 'SYNTHRA_V3_WITHDRAW',
    amountUsdc: '0',
    idempotencyKey: idempotencyKeyHash,
    metadata: { tokenOut: 'USDC' },
  });

  try {
    const wallet = await resolveAgentWallet(agent);
    const { withdrawFromSynthraV3 } = await import('../services/wealth/yield/aggregator.js');
    
    const result = await withdrawFromSynthraV3({
      walletId: wallet.walletId,
      walletAddress: wallet.walletAddress,
      idempotencyKey: idempotencyKeyHash,
    });

    return handleActionSuccess(c, audit.id, idempotencyRecordId, result);
  } catch (err) {
    return handleActionError(c, audit.id, idempotencyRecordId, err);
  }
});
