import { createHash } from 'crypto';
import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { db } from '../db/prisma.js';
import { AppError } from './errors.js';
import { getRequestId } from './requestid.js';

export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(',')}}`;
}

type CachedIdempotencyResponse = {
  responseStatus: number;
  responseBody: unknown;
};

type ReservedIdempotencyRecord = {
  recordId: string;
  cachedResponse?: CachedIdempotencyResponse;
};

async function reserveIdempotencyRecord(input: {
  agentId: string;
  providedNonce: number;
  rawKey: string;
  requestHash: string;
  route: string;
}): Promise<ReservedIdempotencyRecord> {
  const keyHash = hash(`${input.providedNonce}:${input.rawKey}`);
  const lockedUntil = new Date(Date.now() + 2 * 60 * 1000);
  const requestId = getRequestId();

  return db.$transaction(async (tx) => {
    const lockedAgent = await tx.$queryRaw<Array<{ actionNonce: number }>>`
      SELECT "actionNonce"
      FROM "Agent"
      WHERE "id" = ${input.agentId}
      FOR UPDATE
    `;

    const currentAgent = lockedAgent[0];
    if (!currentAgent) {
      throw new AppError(404, 'Agent not found', 'AGENT_NOT_FOUND');
    }

    const existing = await tx.idempotencyKey.findUnique({
      where: { agentId_keyHash: { agentId: input.agentId, keyHash } },
    });

    if (existing) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      if (existing.createdAt < twentyFourHoursAgo) {
        throw new AppError(403, 'Idempotency key has expired (valid for 24 hours only). Please use a fresh nonce and key.', 'IDEMPOTENCY_KEY_EXPIRED');
      }

      if (existing.requestHash !== input.requestHash || existing.route !== input.route) {
        throw new AppError(409, 'Idempotency-Key was already used for a different request', 'IDEMPOTENCY_CONFLICT');
      }

      if (existing.status === 'SUCCESS' && existing.responseBody !== null && existing.responseStatus !== null) {
        return {
          recordId: existing.id,
          cachedResponse: {
            responseStatus: existing.responseStatus,
            responseBody: existing.responseBody,
          },
        };
      }

      if (existing.status === 'PENDING' && existing.lockedUntil > new Date()) {
        throw new AppError(409, 'A request with this Idempotency-Key is still processing', 'IDEMPOTENCY_IN_PROGRESS');
      }

      throw new AppError(409, 'Idempotency-Key was already used for a different request state', 'IDEMPOTENCY_CONFLICT');
    }

    if (input.providedNonce !== currentAgent.actionNonce) {
      throw new AppError(409, 'Nonce mismatch. Please retry with the next available nonce.', 'NONCE_MISMATCH', {
        providedNonce: input.providedNonce,
      });
    }

    const record = await tx.idempotencyKey.create({
      data: {
        agentId: input.agentId,
        keyHash,
        route: input.route,
        requestHash: input.requestHash,
        lockedUntil,
        requestId,
      },
    });

    await tx.agent.update({
      where: { id: input.agentId },
      data: { actionNonce: { increment: 1 } },
    });

    return { recordId: record.id };
  });
}

export const idempotencyMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const agent = c.get('agent') as { id: string } | undefined;
  if (!agent) {
    throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
  }

  const rawKey = c.req.header('Idempotency-Key') || c.req.header('X-Idempotency-Key');
  
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!rawKey || !uuidV4Regex.test(rawKey)) {
    throw new AppError(400, 'X-Idempotency-Key must be a valid UUID v4 (e.g., 123e4567-e89b-12d3-a456-426614174000)', 'INVALID_IDEMPOTENCY_FORMAT');
  }

  const rawNonce = c.req.header('X-Aegis-Nonce');
  if (!rawNonce) {
    throw new AppError(400, 'X-Aegis-Nonce header is required for this mutation', 'NONCE_REQUIRED');
  }

  const providedNonce = parseInt(rawNonce, 10);
  if (isNaN(providedNonce)) {
    throw new AppError(400, 'X-Aegis-Nonce must be a valid integer', 'INVALID_NONCE_FORMAT');
  }

  let body: any;
  try {
    const contentLengthRaw = c.req.header('content-length');
    const contentLength = contentLengthRaw ? Number(contentLengthRaw) : null;

    if (contentLength === 0) {
      body = {};
    } else {
      body = await c.req.json();
    }
  } catch (err) {
    return c.json({
      success: false,
      error: 'JSON_PARSE_FAILED',
    }, 400);
  }
  
  c.set('validatedBody', body);

  const requestHash = hash(`${c.req.method}:${c.req.path}:${stableJson(body)}`);
  const reservation = await reserveIdempotencyRecord({
    agentId: agent.id,
    providedNonce,
    rawKey,
    requestHash,
    route: c.req.path,
  });

  if (reservation.cachedResponse) {
    return c.json(reservation.cachedResponse.responseBody as never, reservation.cachedResponse.responseStatus as never);
  }

  c.set('idempotencyRecordId', reservation.recordId);
  c.set('idempotencyKeyHash', hash(`${providedNonce}:${rawKey}`));

  await next();
});

export async function completeIdempotency(recordId: string, responseStatus: number, responseBody: unknown) {
  await db.idempotencyKey.update({
    where: { id: recordId },
    data: {
      status: 'SUCCESS',
      responseStatus,
      responseBody: responseBody as never,
    },
  });
}

export async function failIdempotency(recordId: string, responseStatus: number, responseBody: unknown) {
  await db.idempotencyKey.update({
    where: { id: recordId },
    data: {
      status: 'FAILED',
      responseStatus,
      responseBody: responseBody as never,
    },
  });
}
