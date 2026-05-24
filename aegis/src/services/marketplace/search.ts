import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { createCircuitBreaker } from '../../utils/circuitbreaker.js';
import { AppError } from '../../utils/errors.js';
import type { MarketplaceSearchOptions } from '../../utils/types.js';

/**
 * Searches the official Circle services marketplace for x402-compatible paid APIs.
 * Connects to Circle's real time Discovery API to provide agents with a live
 * catalog of validated service providers.
 */

const DISCOVERY_API_URL = config.CIRCLE_DISCOVERY_API_URL;

async function _searchServices(options: MarketplaceSearchOptions | string): Promise<{
  services: any[];
  total: number;
  limit: number;
  offset: number;
}> {
  const normalizedOptions: MarketplaceSearchOptions = typeof options === 'string'
    ? { keyword: options }
    : options;

  const limit = normalizedOptions.limit ?? 20;
  const offset = normalizedOptions.offset ?? 0;

  logger.info({ options: normalizedOptions }, 'Searching Circle marketplace');

  const params = new URLSearchParams();
  if (normalizedOptions.keyword) params.set('query', normalizedOptions.keyword);
  if (normalizedOptions.category) params.set('category', normalizedOptions.category);
  if (normalizedOptions.type) params.set('type', normalizedOptions.type);
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  try {
    const response = await fetch(`${DISCOVERY_API_URL}?${params.toString()}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new AppError(502, `Circle API returned HTTP ${response.status}`, 'DISCOVERY_API_ERROR');
    }

    const data = await response.json() as any;
    
    // Map Circle's resource model to our internal ServiceEntry format
    const mappedServices = (data.items || []).map((item: any) => ({
      id: item.resource, // Use URL as unique ID
      name: item.metadata?.provider?.name || 'Unknown Service',
      description: item.metadata?.provider?.description || item.metadata?.description || '',
      url: item.resource,
      priceUsdc: item.accepts?.[0]?.amount 
        ? (Number(item.accepts[0].amount) / 1000000).toString() // Circle amounts are often in micro-USDC (6 decimals)
        : '0.00',
      category: item.metadata?.provider?.category || 'General',
      chain: item.accepts?.[0]?.network || 'Unknown',
      type: item.type || 'x402',
      metadata: item.metadata,
      accepts: item.accepts,
    }));

    return {
      services: mappedServices,
      total: data.pagination?.total || mappedServices.length,
      limit,
      offset,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, 'Failed to fetch from Circle API');
    throw new AppError(502, 'Failed to reach Circle API', 'DISCOVERY_UNREACHABLE');
  }
}

export const searchServices = createCircuitBreaker(
  { name: 'marketplace-search', threshold: 5, resetTimeoutMs: 30_000 },
  _searchServices,
);
