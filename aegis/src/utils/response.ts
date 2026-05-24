import type { Context } from 'hono';
import { logger } from './logger.js';
import { toHttpError } from './errors.js';

export function ok<T>(c: Context, data: T, status = 200) {
  return c.json({ success: true, data }, status as never);
}

export function created<T>(c: Context, data: T) {
  return ok(c, data, 201);
}

export function fail(c: Context, error: unknown) {
  const httpError = toHttpError(error);
  if (httpError.status >= 500) {
    logger.error({ error }, 'Request failed');
  }
  return c.json(httpError.body, httpError.status as never);
}
