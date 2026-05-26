import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createCircuitBreaker } from '../../utils/circuitbreaker.js';
import type { MarketplaceInspectOptions } from '../../utils/types.js';
import { fetch as undiciFetch } from 'undici';
import { assertAllowedServiceUrl, createPinnedServiceDispatcher } from '../../utils/validation.js';

/**
 * Inspects a service endpoint to determine its x402 payment requirements.
 * Performs a preflight request to read the 402 payment headers without
 * actually making a payment.
 */
async function _inspectServicePayment(options: MarketplaceInspectOptions): Promise<{
  serviceUrl: string;
  requiresPayment: boolean;
  protocol: string | null;
  priceUsdc: string | null;
  acceptedChains: string[];
  paymentScheme: string | null;
  sellerAddress: string | null;
}> {
  logger.info({ url: options.serviceUrl }, 'Inspecting x402 service payment requirements');

  const serviceTarget = await assertAllowedServiceUrl(options.serviceUrl);
  const dispatcher = serviceTarget.pinnedIp ? createPinnedServiceDispatcher(serviceTarget.pinnedIp) : undefined;

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
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

    const response = await undiciFetch(serviceTarget.url, {
      method: options.method ?? 'GET',
      headers,
      ...(dispatcher ? { dispatcher } : {}),
      signal: AbortSignal.timeout(15_000),
      ...(options.data !== undefined ? { body: JSON.stringify(options.data) } : {}),
    });

    if (response.status === 402) {
      const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
      const wwwAuthenticate = response.headers.get('WWW-Authenticate');

      let protocol: string | null = null;
      let priceUsdc: string | null = null;
      let acceptedChains: string[] = [];
      let paymentScheme: string | null = null;
      let sellerAddress: string | null = null;
      let rawAccepts: any[] = [];

      if (wwwAuthenticate?.includes('Payment')) {
        protocol = 'MPP';
      } else if (paymentRequired) {
        protocol = 'x402';
      }

      if (paymentRequired) {
        try {
          const decoded = JSON.parse(Buffer.from(paymentRequired, 'base64').toString());
          if (decoded.accepts && Array.isArray(decoded.accepts)) {
            rawAccepts = decoded.accepts;
          }
        } catch {
        }
      }

      if (rawAccepts.length === 0) {
        try {
          const body = await response.json() as Record<string, unknown>;
          if (body.accepts && Array.isArray(body.accepts)) {
            rawAccepts = body.accepts;
          }
          if (body.x402Version) protocol = 'x402';
        } catch {
        }
      }

      for (const accept of rawAccepts) {
        if (accept.network && typeof accept.network === 'string') {
          acceptedChains.push(accept.network);
        }
        
        if (accept.maxAmountRequired && typeof accept.maxAmountRequired === 'string') {
          priceUsdc = accept.maxAmountRequired;
        } else if (accept.amount && typeof accept.amount === 'string') {
          priceUsdc = (Number(accept.amount) / 1000000).toString();
        }

        if (accept.scheme && typeof accept.scheme === 'string') {
          paymentScheme = accept.scheme;
        }
        if (accept.address && typeof accept.address === 'string') {
          sellerAddress = accept.address;
        }
      }

      return {
        serviceUrl: options.serviceUrl,
        requiresPayment: true,
        protocol,
        priceUsdc,
        acceptedChains: [...new Set(acceptedChains)],
        paymentScheme,
        sellerAddress,
      };
    }

    return {
      serviceUrl: options.serviceUrl,
      requiresPayment: false,
      protocol: null,
      priceUsdc: null,
      acceptedChains: [],
      paymentScheme: null,
      sellerAddress: null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AppError(504, 'Service inspection timed out after 15 seconds', 'INSPECT_TIMEOUT');
    }

    throw new AppError(
      502,
      `Failed to inspect service: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'INSPECT_FAILED',
    );
  } finally {
    dispatcher?.destroy();
  }
}

export const inspectServicePayment = createCircuitBreaker(
  { name: 'marketplace-inspect', threshold: 5, resetTimeoutMs: 30_000 },
  _inspectServicePayment,
);
