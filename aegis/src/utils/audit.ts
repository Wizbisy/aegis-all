import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { db } from '../db/prisma.js';
import { logger } from './logger.js';
import { getRequestId } from './requestid.js';

type AuditMetadata = Prisma.InputJsonObject;

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex');
}

export async function startAuditAction(input: {
  agentId: string;
  action: string;
  amountUsdc?: string;
  idempotencyKey?: string;
  metadata?: AuditMetadata;
}) {
  const requestId = getRequestId();
  
  return db.auditLog.create({
    data: {
      agentId: input.agentId,
      action: input.action,
      requestId,
      ...(input.amountUsdc ? { amountUsdc: input.amountUsdc } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      metadata: input.metadata ?? {},
      status: 'PENDING',
    },
  });
}

export async function completeAuditAction(id: string, input: { signature?: string; result?: unknown; metadata?: AuditMetadata }) {
  await db.auditLog.update({
    where: { id },
    data: {
      status: 'SUCCESS',
      ...(input.signature ? { signature: input.signature } : {}),
      resultHash: hashJson(input.result),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  });
}

export async function failAuditAction(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  await db.auditLog.update({
    where: { id },
    data: {
      status: 'FAILED',
      error: message.slice(0, 1000),
    },
  });
}

export async function logAuditAction(agentId: string, action: string, signature: string | null, details: AuditMetadata) {
  try {
    await db.auditLog.create({
      data: {
        agentId,
        action,
        signature,
        metadata: details,
        status: 'SUCCESS'
      }
    });
    logger.debug(`Audit log written for action ${action} by agent ${agentId}`);
  } catch (e) {
    logger.error({ error: e }, 'CRITICAL: Failed to write to secure audit log');
  }
}
