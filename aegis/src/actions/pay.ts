import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { createCircuitBreaker } from '../utils/circuitbreaker.js';
import { getDcwClient } from '../circle/dcw.js';
import { db } from '../db/prisma.js';
import { assertAllowedServiceUrl, createPinnedServiceDispatcher } from '../utils/validation.js';
import { fetch as undiciFetch } from 'undici';

/**
 * Executes autonomous x402/MPP micropayments for AI agents.
 * Provides a hardened and compliant implementation of the payment negotiation flow:
 * 1. Preflight: Probes the service URL to identify payment requirements (x402/MPP).
 * 2. Validation: Verifies requirements against agent spending policies and limits.
 * 3. Authorization: Signs a unique payment challenge using Circle DCW.
 * 4. Fulfill: Returns the verifiable signature/authorization payload for API access.
 */
export interface PayForServiceOptions {
  serviceUrl: string;
  walletAddress: string;
  maxAmount: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: unknown;
  headers?: string[];
  estimate?: boolean;
}

export interface PaymentResult {
  serviceUrl: string;
  method: string;
  status: 'completed' | 'estimated' | 'free';
  paymentProtocol: string | null;
  chargedUsdc: string | null;
  response: unknown;
}

async function _payForService(options: PayForServiceOptions): Promise<PaymentResult> {
  const method = options.method ?? 'GET';
  logger.info({ url: options.serviceUrl, method, maxAmount: options.maxAmount }, 'Initiating x402 payment');

  const serviceTarget = await assertAllowedServiceUrl(options.serviceUrl);
  const dispatcher = serviceTarget.pinnedIp ? createPinnedServiceDispatcher(serviceTarget.pinnedIp) : undefined;

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      for (const header of options.headers) {
        const colonIndex = header.indexOf(':');
        if (colonIndex > 0) {
          const name = header.slice(0, colonIndex).trim();
          const value = header.slice(colonIndex + 1).trim();
          headers[name] = value;
        }
      }
    }

    const preflightResponse = await undiciFetch(serviceTarget.url, {
      method,
      headers,
      ...(dispatcher ? { dispatcher } : {}),
      signal: AbortSignal.timeout(15_000),
      ...(options.data !== undefined && method !== 'GET' ? { body: JSON.stringify(options.data) } : {}),
    });

    if (preflightResponse.status !== 402) {
      const responseBody = await preflightResponse.text();
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        parsedBody = responseBody;
      }

      return {
        serviceUrl: options.serviceUrl,
        method,
        status: 'free',
        paymentProtocol: null,
        chargedUsdc: null,
        response: parsedBody,
      };
    }

    const paymentRequired = preflightResponse.headers.get('PAYMENT-REQUIRED');
    const wwwAuth = preflightResponse.headers.get('WWW-Authenticate');

    let protocol = 'x402';
    if (wwwAuth?.includes('Payment')) {
      protocol = 'MPP';
    }

    let requiredAmount = '0';
    let acceptedOption: any = null;
    const contentType = preflightResponse.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      try {
        const body402 = await preflightResponse.json() as Record<string, unknown>;
        if (body402.accepts && Array.isArray(body402.accepts)) {
          acceptedOption = (body402.accepts as Array<Record<string, unknown>>)[0];
          if (acceptedOption?.maxAmountRequired && typeof acceptedOption.maxAmountRequired === 'string') {
            requiredAmount = acceptedOption.maxAmountRequired;
          } else if (acceptedOption?.amount && typeof acceptedOption.amount === 'string') {
            requiredAmount = (Number(acceptedOption.amount) / 1000000).toString();
          }
        }
      } catch (err: any) {
        logger.debug({ url: options.serviceUrl, error: err?.message }, 'Failed to parse JSON body of 402 response');
      }
    }

    const maxAmount = Number(options.maxAmount);
    const required = Number(requiredAmount);
    if (!Number.isFinite(required) || required < 0) {
      throw new AppError(400, 'Invalid payment amount requested by service', 'INVALID_PAYMENT_AMOUNT');
    }

    if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
      throw new AppError(400, 'Invalid maxAmount supplied', 'INVALID_PAYMENT_MAX_AMOUNT');
    }

    if (required > maxAmount) {
      throw new AppError(
        402,
        `Service requires ${requiredAmount} USDC but maxAmount cap is ${options.maxAmount} USDC`,
        'PAYMENT_EXCEEDS_MAX',
      );
    }

    if (options.estimate) {
      return {
        serviceUrl: options.serviceUrl,
        method,
        status: 'estimated',
        paymentProtocol: protocol,
        chargedUsdc: requiredAmount,
        response: null,
      };
    }

    const agent = await db.agent.findUnique({
      where: { walletAddress: options.walletAddress },
      select: { walletId: true },
    });

    if (!agent?.walletId) {
      throw new AppError(404, 'Authorized wallet not found for address', 'WALLET_NOT_FOUND');
    }

    const client = getDcwClient();
    const challenge = JSON.stringify({
      serviceUrl: options.serviceUrl,
      requiredAmount,
      protocol,
      timestamp: Date.now(),
    });

    logger.info(
      { protocol, requiredAmount, walletAddress: options.walletAddress },
      'Authorizing x402 payment via DCW signing',
    );

    const signResponse = await client.signMessage({
      walletId: agent.walletId,
      message: challenge,
    });

    const signature = signResponse.data?.signature;

    const paymentPayload = {
      x402Version: 2,
      resource: options.serviceUrl,
      accepted: acceptedOption,
      payload: {
        protocol,
        requiredAmount,
        signature,
        walletAddress: options.walletAddress,
        timestamp: Date.now(),
      },
    };

    const encodedHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

    return {
      serviceUrl: options.serviceUrl,
      method,
      status: 'completed',
      paymentProtocol: protocol,
      chargedUsdc: requiredAmount,
      response: {
        message: 'Payment authorized successfully.',
        headers: {
          'Payment-Signature': encodedHeader,
        },
        authorization: {
          protocol,
          requiredAmount,
          walletAddress: options.walletAddress,
          challenge,
          signature,
          encodedHeader,
        },
      },
    };
  } finally {
    dispatcher?.destroy();
  }
}

export const payForService = createCircuitBreaker(
  { name: 'x402-pay', threshold: 3, resetTimeoutMs: 60_000 },
  _payForService,
);
