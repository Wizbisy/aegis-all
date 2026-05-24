import { createHmac, timingSafeEqual } from 'crypto';
import { Hono } from 'hono';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export const webhooksRouter = new Hono();

function verifySignature(rawBody: string, signature: string | undefined) {
  if (!config.CIRCLE_WEBHOOK_SECRET) return false;
  if (!signature) return false;

  const normalizedSignature = signature.trim().startsWith('sha256=')
    ? signature.trim().slice('sha256='.length)
    : signature.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(normalizedSignature)) {
    return false;
  }

  const expected = createHmac('sha256', config.CIRCLE_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const left = Buffer.from(normalizedSignature, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

webhooksRouter.post('/circle', async (c) => {
  if (!config.CIRCLE_WEBHOOK_SECRET) {
    return c.json({ success: false, error: 'Webhook secret is not configured' }, 503);
  }

  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return c.json({ success: false, error: 'Unsupported content type' }, 415);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('circle-signature') ?? c.req.header('x-circle-signature');

  if (!verifySignature(rawBody, signature)) {
    return c.json({ success: false, error: 'Invalid webhook signature' }, 401);
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
  }

  logger.info({ eventType: typeof payload === 'object' && payload ? (payload as { type?: string }).type : undefined }, 'Circle webhook received');
  return c.json({ success: true });
});

webhooksRouter.get('/', (c) => {
  return c.json({
    success: true,
    routes: {
      circle: 'POST /v1/webhooks/circle',
    },
  });
});
