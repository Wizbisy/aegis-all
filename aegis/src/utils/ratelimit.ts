import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { shouldTrustProxyHeaders } from '../config.js';
import { AppError, RateLimitError } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function evictOldestBucket() {
  const oldestKey = buckets.keys().next().value as string | undefined;
  if (oldestKey) {
    buckets.delete(oldestKey);
  }
}

function setHotBucket(key: string, bucket: Bucket) {
  if (buckets.has(key)) {
    buckets.delete(key);
  }
  buckets.set(key, bucket);
}

export function slidingWindowRateLimit(options: {
  name: string;
  limit: number;
  windowMs: number;
  key: (c: Context) => string;
}) {
  return createMiddleware(async (c: Context, next: Next) => {
    const now = Date.now();
    
    if (buckets.size > MAX_BUCKETS * 0.9) {
      pruneExpiredBuckets(now);
    }
    
    const key = `${options.name}:${options.key(c)}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      while (buckets.size >= MAX_BUCKETS) {
        evictOldestBucket();
      }
      setHotBucket(key, bucket);
    } else {
      setHotBucket(key, bucket);
    }

    bucket.count += 1;
    
    // Standard Rate Limit Headers
    const remaining = Math.max(0, options.limit - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    
    c.header('X-RateLimit-Limit', String(options.limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetSeconds));

    if (bucket.count > options.limit) {
      c.header('Retry-After', String(resetSeconds));
      throw new RateLimitError('Rate limit exceeded', { 
        limit: options.limit,
        windowMs: options.windowMs,
        retryAfter: resetSeconds
      });
    }

    await next();
  });
}

export function getClientIp(c: Context) {
  const cfIp = c.req.header('cf-connecting-ip')?.trim();
  const xRealIp = c.req.header('x-real-ip')?.trim();
  if (shouldTrustProxyHeaders()) {
    const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    return cfIp || forwardedFor || xRealIp || 'unknown';
  }

  return cfIp || xRealIp || 'unknown';
}
