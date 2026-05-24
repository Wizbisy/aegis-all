import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createApiToken, hashApiToken } from '../auth/tokens.js';
import { ensureAgentWallet } from '../circle/dcw.js';
import { db } from '../db/prisma.js';
import { agentAuth } from '../auth/middleware.js';
import { fail } from '../utils/response.js';
import type { AppBindings } from '../utils/types.js';
import { getClientIp, slidingWindowRateLimit } from '../utils/ratelimit.js';
import { createVerificationCode, hashVerificationCode } from '../auth/tokens.js';
import { sendOtpEmail } from '../utils/notifier.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { safeTokenCompare } from '../auth/tokens.js';

export const connectRouter = new Hono<AppBindings>();

connectRouter.use('*', slidingWindowRateLimit({
  name: 'connect',
  limit: 10,
  windowMs: 10 * 60 * 1000,
  key: getClientIp,
}));

connectRouter.get('/', (c) => {
  return c.json({
    success: true,
    routes: {
      start: 'POST /v1/connect/start',
      complete: 'POST /v1/connect/complete',
      revoke: 'POST /v1/connect/revoke',
    },
  });
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function startConnectChallenge(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (config.NODE_ENV === 'production' && !config.RESEND_API_KEY) {
    throw new AppError(503, 'Email delivery not configured', 'EMAIL_NOT_CONFIGURED');
  }

  const existingChallenge = await db.connectChallenge.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingChallenge && existingChallenge.consumedAt === null && existingChallenge.expiresAt > new Date()) {
    return {
      challengeId: existingChallenge.id,
      expiresAt: existingChallenge.expiresAt,
    };
  }

  const otp = createVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const challenge = await db.connectChallenge.upsert({
    where: { email: normalizedEmail },
    update: {
      otpHash: hashVerificationCode(otp),
      expiresAt,
      consumedAt: null,
      attempts: 0,
    },
    create: {
      email: normalizedEmail,
      otpHash: hashVerificationCode(otp),
      expiresAt,
    },
  });

  try {
    await sendOtpEmail(normalizedEmail, otp, expiresAt);
  } catch (error) {
    logger.warn({ error, email: normalizedEmail }, 'Failed to send OTP email; fallback to logs');
  }

  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    ...(config.NODE_ENV !== 'production' ? { otp } : {}),
  };
}

async function completeConnectChallenge(email: string, challengeId: string, otp: string) {
  const normalizedEmail = normalizeEmail(email);
  
  const result = await db.$transaction(async (tx) => {
    const challenge = await tx.connectChallenge.findUnique({
      where: { email: normalizedEmail },
    });

    if (!challenge || challenge.id !== challengeId) {
      throw new AppError(400, 'Invalid verification challenge', 'INVALID_CHALLENGE');
    }

    if (challenge.consumedAt) {
      throw new AppError(400, 'Challenge already used', 'CHALLENGE_USED');
    }

    if (challenge.attempts >= 5) {
      throw new AppError(400, 'Too many failed attempts', 'TOO_MANY_ATTEMPTS');
    }

    if (challenge.expiresAt < new Date()) {
      throw new AppError(400, 'Challenge expired', 'CHALLENGE_EXPIRED');
    }

    const isValidOtp = safeTokenCompare(challenge.otpHash, hashVerificationCode(otp));
    if (!isValidOtp) {
      await tx.connectChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppError(400, 'Invalid verification code', 'INVALID_OTP');
    }

    await tx.connectChallenge.updateMany({
      where: { id: challenge.id, email: normalizedEmail, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const agent = await tx.agent.upsert({
      where: { email: normalizedEmail },
      update: {},
      create: {
        email: normalizedEmail,
        policy: { create: {} },
      },
    });

    await tx.agentApiToken.updateMany({
      where: {
        agentId: agent.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const rawToken = createApiToken();
    const tokenHash = hashApiToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await tx.agentApiToken.create({
      data: {
        agentId: agent.id,
        tokenHash,
        label: 'default',
        allowedIps: [],
        expiresAt,
      },
    });

    return {
      agent: {
        id: agent.id,
        email: agent.email,
        walletId: agent.walletId,
        walletAddress: agent.walletAddress,
      },
      tokenIssued: true,
      token: rawToken,
      tokenExpiresAt: expiresAt,
    };
  });

  const wallet = await ensureAgentWallet(result.agent.id, normalizedEmail);

  return {
    ...result,
    agent: {
      ...result.agent,
      walletId: wallet.walletId,
      walletAddress: wallet.walletAddress,
    },
  };
}

connectRouter.post('/start', zValidator('json', z.object({
  email: z.string().email(),
})), async (c) => {
  const { email } = c.req.valid('json');

  try {
    const result = await startConnectChallenge(email);
    return c.json({
      success: true,
      ...result,
      message: 'Verification code prepared. Complete the challenge before a token is issued.',
    });
  } catch (err) {
    return fail(c, err);
  }
});

connectRouter.post('/complete', zValidator('json', z.object({
  email: z.string().email(),
  challengeId: z.string().uuid(),
  otp: z.string().trim().regex(/^[A-Fa-f0-9]{6}$/, 'OTP must be a 6-character hex code'),
})), async (c) => {
  const { email, challengeId, otp } = c.req.valid('json');

  try {
    const result = await completeConnectChallenge(email, challengeId, otp);
    return c.json({
      success: true,
      ...result,
      message: 'Verification succeeded. Store this token securely; it is shown only once.',
    });
  } catch (err) {
    return fail(c, err);
  }
});

connectRouter.post('/revoke', agentAuth, async (c) => {
  try {
    const agent = c.get('agent');
    await db.agentApiToken.updateMany({
      where: {
        agentId: agent.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return c.json({
      success: true,
      message: 'All active tokens for this agent have been revoked.',
    });
  } catch (err) {
    return fail(c, err);
  }
});
