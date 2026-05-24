import { serve } from '@hono/node-server' 
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { readFile } from 'fs/promises'
import { config, getCorsAllowedOrigins, isProduction, resolveArcRpcUrl } from './config.js'
import { connectRouter } from './routes/connect.js'
import { actionsRouter } from './routes/actions.js'
import { policyRouter } from './routes/policy.js'
import { marketplaceRouter } from './routes/marketplace.js'
import { statsRouter } from './routes/stats.js'
import { webhooksRouter } from './routes/webhooks.js'
import { adminRouter } from './routes/admin/index.js'
import { db } from './db/prisma.js'
import type { AppBindings } from './utils/types.js'
import { fail } from './utils/response.js'
import { logger } from './utils/logger.js'
import { getClientIp, slidingWindowRateLimit } from './utils/ratelimit.js'
import { requestIdMiddleware } from './utils/requestid.js'
import { runYieldDistributor } from './services/yield/distributor.js'
import { runWealthSentinel } from './services/wealth/engine/sentinel.js'

const app = new Hono<AppBindings>()
let resolvedArcRpcUrl = config.ARC_RPC_URL ?? config.ARC_TESTNET_RPC_URL ?? ''
const corsAllowedOrigins = getCorsAllowedOrigins()

app.use('*', cors({
  origin: (origin) => {
    if (corsAllowedOrigins.length === 0) {
      return undefined
    }

    if (!origin) {
      return undefined
    }
    return corsAllowedOrigins.includes(origin) ? origin : undefined
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Aegis-Email', 'X-Request-Id'],
  exposeHeaders: ['Retry-After', 'X-Request-Id'],
}))
app.use('*', requestIdMiddleware)
app.use('*', honoLogger())
app.use('*', async (c, next) => {
  const contentLengthRaw = c.req.header('content-length')
  if (contentLengthRaw) {
    const contentLength = Number(contentLengthRaw)
    if (Number.isFinite(contentLength) && contentLength > config.REQUEST_BODY_MAX_BYTES) {
      return c.json({ success: false, error: 'Request body too large', code: 'REQUEST_BODY_TOO_LARGE' }, 413)
    }
  }
  await next()
})
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('X-Permitted-Cross-Domain-Policies', 'none')
  c.header('X-Download-Options', 'noopen')
  if (isProduction()) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  }
  await next()
})
app.use('*', slidingWindowRateLimit({
  name: 'global',
  limit: 300,
  windowMs: 60 * 1000,
  key: getClientIp,
}))
app.onError((err, c) => fail(c, err))

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'aegis',
    message: 'Aegis is running.',
  })
})

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    uptime: process.uptime(),
    arcRpcConfigured: Boolean(resolvedArcRpcUrl),
  })
})

app.get('/ready', async (c) => {
  const database = await db.agent
    .findFirst({ select: { id: true } })
    .then(() => ({ ok: true }))
    .catch((error: unknown) => {
      logger.error({ error }, 'Database readiness check failed')
      return { ok: false }
    })

  return c.json({
    ready: database.ok && Boolean(config.ENTITY_SECRET) && Boolean(config.CIRCLE_API_KEY),
    checks: {
      database,
      dcwConfigured: Boolean(config.ENTITY_SECRET),
      circleApiConfigured: Boolean(config.CIRCLE_API_KEY),
      arcRpcConfigured: Boolean(resolvedArcRpcUrl),
    },
  }, database.ok && Boolean(config.ENTITY_SECRET) ? 200 : 503)
})

app.get('/SKILL.md', async (c) => {
  try {
    const skill = await readFile(new URL('../public/SKILL.md', import.meta.url), 'utf8')
    return c.text(skill, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
  } catch {
    return c.text('SKILL.md not found', 404)
  }
})

app.route('/v1/connect', connectRouter)
app.route('/v1/actions', actionsRouter)
app.route('/v1/marketplace', marketplaceRouter)
app.route('/v1/policy', policyRouter)
app.route('/v1/stats', statsRouter)
app.route('/v1/webhooks', webhooksRouter)
app.route('/v1/admin', adminRouter)
app.notFound((c) => c.json({ success: false, error: 'Resource not found' }, 404))

const port = config.PORT
const arcRpcUrl = await resolveArcRpcUrl()
resolvedArcRpcUrl = arcRpcUrl
process.env.ARC_RPC_URL = arcRpcUrl
process.env.ARC_TESTNET_RPC_URL = arcRpcUrl

logger.info(`Starting Aegis API server on port ${port}...`)

const server = serve({
  fetch: app.fetch,
  port
})

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Shutting down Aegis API')
  server.close()
  await db.$disconnect().catch((error: unknown) => logger.error({ error }, 'Database disconnect failed'))
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

let distributorTimer: NodeJS.Timeout | null = null;
if (process.env.YIELD_ADMIN_PRIVATE_KEY) {
  logger.info('Yield Admin Private Key found. Starting background yield distributor cron (2% APY).');
  distributorTimer = setInterval(async () => {
    try {
      await runYieldDistributor(process.env.YIELD_ADMIN_PRIVATE_KEY as `0x${string}`, 0.02);
    } catch (err) {
      logger.error({ err }, 'Background yield distribution failed');
    }
  }, 60 * 60 * 1000);
}

const WEALTH_SENTINEL_INTERVAL_MS = 5 * 60 * 1000;
logger.info(`Starting Wealth Sentinel cron (every ${WEALTH_SENTINEL_INTERVAL_MS / 1000}s)`);
const sentinelTimer = setInterval(async () => {
  try {
    await runWealthSentinel();
  } catch (err) {
    logger.error({ err }, 'Wealth Sentinel cron failed');
  }
}, WEALTH_SENTINEL_INTERVAL_MS);
