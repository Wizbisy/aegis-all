import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
export const requestIdMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const inbound = c.req.header('X-Request-Id')?.trim();
  const requestId = inbound && /^[\w\-]{8,128}$/.test(inbound) ? inbound : randomUUID();

  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);

  await requestContext.run({ requestId }, async () => {
    await next();
  });
});
export function getRequestId(c?: { get: (key: string) => unknown }): string {
  const store = requestContext.getStore();
  if (store?.requestId) return store.requestId;

  if (c) return (c.get('requestId') as string) ?? 'unknown';
  return 'unknown';
}
