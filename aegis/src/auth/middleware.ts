import { createMiddleware } from 'hono/factory';
import { config, getAuthExemptPaths } from '../config.js';
import { db } from '../db/prisma.js';
import type { AppBindings } from '../utils/types.js';
import { AppError } from '../utils/errors.js';
import { getClientIp } from '../utils/ratelimit.js';
import { logger } from '../utils/logger.js';
import { hashApiToken, isValidTokenShape, safeTokenCompare } from './tokens.js';
import { getRequestId } from '../utils/requestid.js';

function normalizeIpValue(value: string) {
  return value.trim();
}

function ipv4ToNumber(ip: string) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  const [a, b, c, d] = parts as [number, number, number, number];
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}

function ipMatchesCidr(ip: string, cidr: string) {
  const [network = '', prefixLengthRaw = ''] = cidr.split('/');
  const prefixLength = Number(prefixLengthRaw);
  const ipNumeric = ipv4ToNumber(ip);
  const networkNumeric = ipv4ToNumber(network);

  if (ipNumeric === null || networkNumeric === null || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    return false;
  }

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipNumeric & mask) === (networkNumeric & mask);
}

function isIpAllowed(clientIp: string, allowedIps: unknown) {
  if (!Array.isArray(allowedIps) || allowedIps.length === 0) {
    return true;
  }

  const normalizedClientIp = normalizeIpValue(clientIp);
  return allowedIps.some((entry) => {
    if (typeof entry !== 'string') {
      return false;
    }

    const normalized = entry.trim();
    if (!normalized || normalized === '*') {
      return true;
    }

    if (normalized.includes('/')) {
      return ipMatchesCidr(normalizedClientIp, normalized);
    }

    return normalized === normalizedClientIp;
  });
}

async function writeAuthLog(input: {
  agentId?: string;
  tokenId?: string;
  ipAddress: string;
  userAgent?: string;
  outcome: 'SUCCESS' | 'DENIED';
  reason?: string;
}) {
  try {
    const requestId = getRequestId();
    await db.authLog.create({
      data: {
        ipAddress: input.ipAddress,
        outcome: input.outcome,
        requestId,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.tokenId ? { tokenId: input.tokenId } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to write auth log');
  }
}

export const agentAuth = createMiddleware<AppBindings>(async (c, next) => {
  const authExemptPaths = getAuthExemptPaths();
  const authHeader = c.req.header('Authorization');
  const ipAddress = getClientIp(c);
  const userAgent = c.req.header('user-agent') ?? undefined;

  if (!authHeader?.startsWith('Bearer ')) {
    await writeAuthLog({ ipAddress, outcome: 'DENIED', reason: 'Missing bearer token', ...(userAgent ? { userAgent } : {}) });
    throw new AppError(401, 'Unauthorized: Missing Bearer token', 'UNAUTHORIZED');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!isValidTokenShape(token)) {
    await writeAuthLog({ ipAddress, outcome: 'DENIED', reason: 'Invalid token shape', ...(userAgent ? { userAgent } : {}) });
    throw new AppError(401, 'Unauthorized: Invalid token', 'UNAUTHORIZED');
  }

  const tokenHash = hashApiToken(token);
  const apiToken = await db.agentApiToken.findUnique({
    where: { tokenHash },
    include: { agent: true },
  });

  if (!apiToken || apiToken.revokedAt) {
    await writeAuthLog({ ipAddress, outcome: 'DENIED', reason: 'Token not found or revoked', ...(userAgent ? { userAgent } : {}) });
    throw new AppError(401, 'Unauthorized: Agent not found', 'UNAUTHORIZED');
  }

  if (!apiToken.agent.isActive) {
    await writeAuthLog({
      agentId: apiToken.agent.id,
      tokenId: apiToken.id,
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
      outcome: 'DENIED',
      reason: 'Agent suspended',
    });
    throw new AppError(403, 'Forbidden: Agent is suspended', 'AGENT_SUSPENDED');
  }

  if (apiToken.expiresAt <= new Date()) {
    await db.agentApiToken.update({
      where: { id: apiToken.id },
      data: { revokedAt: new Date(), revokedReason: 'EXPIRED' },
    });
    await writeAuthLog({
      agentId: apiToken.agent.id,
      tokenId: apiToken.id,
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
      outcome: 'DENIED',
      reason: 'Token expired',
    });
    throw new AppError(401, 'Unauthorized: Token expired', 'TOKEN_EXPIRED');
  }

  if (!isIpAllowed(ipAddress, apiToken.allowedIps)) {
    await writeAuthLog({
      agentId: apiToken.agent.id,
      tokenId: apiToken.id,
      ipAddress,
      ...(userAgent ? { userAgent } : {}),
      outcome: 'DENIED',
      reason: 'IP not allowed',
    });
    throw new AppError(403, 'Forbidden: IP not allowed for this token', 'TOKEN_IP_NOT_ALLOWED');
  }

  await db.agentApiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  });

  await writeAuthLog({
    agentId: apiToken.agent.id,
    tokenId: apiToken.id,
    ipAddress,
    ...(userAgent ? { userAgent } : {}),
    outcome: 'SUCCESS',
  });

  const isExempt = authExemptPaths.some(path => c.req.path === path);
  if (!isExempt) {
    const clientProvidedEmail = c.req.header('X-Aegis-Email');
    if (!clientProvidedEmail) {
      throw new AppError(400, 'Missing X-Aegis-Email header for verification', 'MISSING_EMAIL_HEADER');
    }

    if (clientProvidedEmail.toLowerCase().trim() !== apiToken.agent.email.toLowerCase()) {
      await writeAuthLog({
        agentId: apiToken.agent.id,
        tokenId: apiToken.id,
        ipAddress,
        ...(userAgent ? { userAgent } : {}),
        outcome: 'DENIED',
        reason: 'Email mismatch in verification',
      });
      throw new AppError(403, 'Forbidden: Token does not belong to the provided email', 'EMAIL_MISMATCH');
    }
  }

  c.set('agent', {
    id: apiToken.agent.id,
    email: apiToken.agent.email,
    walletId: apiToken.agent.walletId,
    walletAddress: apiToken.agent.walletAddress,
  });

  await next();
});

export const adminAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const configured = config.ADMIN_API_KEY;

  if (!configured) {
    throw new AppError(503, 'Admin API is not configured', 'ADMIN_AUTH_NOT_CONFIGURED');
  }

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Unauthorized: Missing admin Bearer token', 'UNAUTHORIZED');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!safeTokenCompare(token, configured)) {
    throw new AppError(401, 'Unauthorized: Invalid admin token', 'UNAUTHORIZED');
  }

  await next();
});
