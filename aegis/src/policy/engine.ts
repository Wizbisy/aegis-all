import { db } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PolicyLimits } from '../utils/types.js';

function toPolicyNumber(value: unknown) {
  const numeric = Number(String(value ?? 0));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getUtcDayStart(date = new Date()) {
  const boundary = new Date(date);
  boundary.setUTCHours(0, 0, 0, 0);
  return boundary;
}

function getUtcWeekStart(date = new Date()) {
  const boundary = getUtcDayStart(date);
  const dayOfWeek = boundary.getUTCDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  boundary.setUTCDate(boundary.getUTCDate() + offset);
  return boundary;
}

function getUtcMonthStart(date = new Date()) {
  const boundary = getUtcDayStart(date);
  boundary.setUTCDate(1);
  return boundary;
}

async function getSpendSince(tx: { auditLog: { aggregate: typeof db.auditLog.aggregate } }, agentId: string, createdAt: Date) {
  const totals = await tx.auditLog.aggregate({
    where: {
      agentId,
      status: { in: ['PENDING', 'SUCCESS'] },
      amountUsdc: { not: null },
      action: { not: 'YIELD_WITHDRAW' },
      createdAt: { gte: createdAt },
    },
    _sum: { amountUsdc: true },
  });

  return toPolicyNumber(totals._sum.amountUsdc);
}

export async function getSpendingLimits() {
  return db.agentPolicy.findMany({ orderBy: { updatedAt: 'desc' } });
}

export async function upsertLocalPolicy(agentId: string, limits: Required<PolicyLimits>) {
  logger.warn({ agentId }, 'Updating local Aegis spending policy');
  return db.agentPolicy.upsert({
    where: { agentId },
    update: {
      perTxLimitUsdc: limits.perTx,
      dailyLimitUsdc: limits.daily,
      weeklyLimitUsdc: limits.weekly,
      monthlyLimitUsdc: limits.monthly,
    },
    create: {
      agentId,
      perTxLimitUsdc: limits.perTx,
      dailyLimitUsdc: limits.daily,
      weeklyLimitUsdc: limits.weekly,
      monthlyLimitUsdc: limits.monthly,
    },
  });
}

export async function assertPolicyAllows(agentId: string, amountUsdc: string) {
  const amount = Number(amountUsdc);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'amountUsdc must be a positive numeric value', 'INVALID_POLICY_AMOUNT');
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1
      FROM "Agent"
      WHERE "id" = ${agentId}
      FOR UPDATE
    `;

    const policy = await tx.agentPolicy.upsert({
      where: { agentId },
      update: {},
      create: { agentId },
    });

    if (amount > toPolicyNumber(policy.perTxLimitUsdc)) {
      throw new AppError(403, `Transfer exceeds per-transaction policy limit of ${policy.perTxLimitUsdc} USDC`, 'POLICY_PER_TX_LIMIT');
    }

    const spentToday = await getSpendSince(tx, agentId, getUtcDayStart());
    if (spentToday + amount > toPolicyNumber(policy.dailyLimitUsdc)) {
      throw new AppError(403, `Action exceeds daily policy limit of ${policy.dailyLimitUsdc} USDC`, 'POLICY_DAILY_LIMIT');
    }

    const spentThisWeek = await getSpendSince(tx, agentId, getUtcWeekStart());
    if (spentThisWeek + amount > toPolicyNumber(policy.weeklyLimitUsdc)) {
      throw new AppError(403, `Action exceeds weekly policy limit of ${policy.weeklyLimitUsdc} USDC`, 'POLICY_WEEKLY_LIMIT');
    }

    const spentThisMonth = await getSpendSince(tx, agentId, getUtcMonthStart());
    if (spentThisMonth + amount > toPolicyNumber(policy.monthlyLimitUsdc)) {
      throw new AppError(403, `Action exceeds monthly policy limit of ${policy.monthlyLimitUsdc} USDC`, 'POLICY_MONTHLY_LIMIT');
    }

    return policy;
  });
}

/**
 * Calculates the exact dynamic spending headroom (remaining limits)
 * for an agent across daily, weekly, and monthly windows.
 */
export async function getPolicyHeadroom(agentId: string) {
  const policy = await db.agentPolicy.upsert({
    where: { agentId },
    update: {},
    create: { agentId },
  });

  const [spentToday, spentThisWeek, spentThisMonth] = await Promise.all([
    getSpendSince(db as any, agentId, getUtcDayStart()),
    getSpendSince(db as any, agentId, getUtcWeekStart()),
    getSpendSince(db as any, agentId, getUtcMonthStart()),
  ]);

  const maxPerTx = toPolicyNumber(policy.perTxLimitUsdc);
  const maxDaily = toPolicyNumber(policy.dailyLimitUsdc);
  const maxWeekly = toPolicyNumber(policy.weeklyLimitUsdc);
  const maxMonthly = toPolicyNumber(policy.monthlyLimitUsdc);

  return {
    perTxLimitUsdc: maxPerTx.toString(),
    dailyLimitUsdc: maxDaily.toString(),
    weeklyLimitUsdc: maxWeekly.toString(),
    monthlyLimitUsdc: maxMonthly.toString(),
    spentToday: spentToday.toString(),
    spentThisWeek: spentThisWeek.toString(),
    spentThisMonth: spentThisMonth.toString(),
    remainingDaily: Math.max(0, maxDaily - spentToday).toString(),
    remainingWeekly: Math.max(0, maxWeekly - spentThisWeek).toString(),
    remainingMonthly: Math.max(0, maxMonthly - spentThisMonth).toString(),
  };
}
