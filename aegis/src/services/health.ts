import { db } from '../db/prisma.js';
import { config, resolveArcRpcUrl } from '../config.js';
import { logger } from '../utils/logger.js';
import { getDcwClient } from '../circle/dcw.js';

export async function checkSystemHealth() {
  const start = Date.now();
  const checks: Record<string, any> = {};

  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: 'OK', latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: 'ERROR', error: (err as Error).message };
  }

  try {
    const circleStart = Date.now();
    const client = getDcwClient();
    await client.listWallets({ pageSize: 1 });
    checks.circleApi = { status: 'OK', latencyMs: Date.now() - circleStart };
  } catch (err) {
    checks.circleApi = { status: 'ERROR', error: (err as Error).message };
  }

  try {
    const rpcStart = Date.now();
    const rpcUrl = await resolveArcRpcUrl();
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json() as { result?: string };
      checks.rpcNode = { 
        status: 'OK', 
        latencyMs: Date.now() - rpcStart,
        blockNumber: data.result ? parseInt(data.result, 16) : 'unknown'
      };
    } else {
      checks.rpcNode = { status: 'ERROR', statusCode: response.status };
    }
  } catch (err) {
    checks.rpcNode = { status: 'ERROR', error: (err as Error).message };
  }

  const mem = process.memoryUsage();
  checks.system = {
    uptime: process.uptime(),
    memory: {
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    },
    version: process.version,
    platform: process.platform,
  };

  const overallStatus = Object.values(checks).every(c => (c as any).status !== 'ERROR') ? 'HEALTHY' : 'DEGRADED';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - start,
    checks,
  };
}
