import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';

import {
  transferSchema,
  paySchema,
  bridgeSchema,
  bridgeStatusSchema,
} from '../src/routes/actions.js';

import {
  createCircuitBreaker,
  getCircuitState,
  resetCircuit,
} from '../src/utils/circuitbreaker.js';

import {
  AppError,
  toHttpError,
  NotFoundError,
  InfrastructureError,
} from '../src/utils/errors.js';

import { hash, stableJson } from '../src/utils/idempotency.js';

import { getClientIp } from '../src/utils/ratelimit.js';

import {
  requestContext,
  requestIdMiddleware,
  getRequestId,
} from '../src/utils/requestid.js';

import {
  createApiToken,
  createVerificationCode,
  hashApiToken,
  hashVerificationCode,
  isValidTokenShape,
  safeTokenCompare,
} from '../src/auth/tokens.js';

import {
  toUsdcNumber,
  evmAddressSchema,
  usdcAmountSchema,
  serviceUrlSchema,
} from '../src/utils/validation.js';

import { config } from '../src/config.js';
import type { Context, Next } from 'hono';

describe('Action Workflows (Validation Core)', () => {
  describe('transferSchema', () => {
    it('allows valid transfer intents', () => {
      const payload = {
        destination: '0x8E8F5064f20D235F899c7553F1BEE77A235F4828',
        amount: '150.00'
      };
      assert.strictEqual(transferSchema.safeParse(payload).success, true);
    });

    it('blocks transfers with malformed amounts', () => {
      const payload = {
        destination: '0x8E8F5064f20D235F899c7553F1BEE77A235F4828',
        amount: '-150.00'
      };
      assert.strictEqual(transferSchema.safeParse(payload).success, false);
    });

    it('blocks transfers missing critical fields', () => {
      assert.strictEqual(transferSchema.safeParse({ amount: '10' }).success, false);
      assert.strictEqual(transferSchema.safeParse({ destination: '0x123' }).success, false);
    });
  });

  describe('paySchema (Micropayments)', () => {
    it('allows valid x402 payment intents', () => {
      const original = config.NODE_ENV;
      Reflect.set(config, 'NODE_ENV', 'production');
      try {
        const payload = {
          serviceUrl: 'https://api.openai.com/v1/chat/completions',
          maxAmount: '0.05',
          method: 'POST',
          data: { model: 'gpt-4' }
        };
        assert.strictEqual(paySchema.safeParse(payload).success, true);
      } finally {
        Reflect.set(config, 'NODE_ENV', original);
      }
    });

    it('blocks payment to unencrypted or internal URLs', () => {
      const original = config.NODE_ENV;
      Reflect.set(config, 'NODE_ENV', 'production');
      try {
        const internal = { serviceUrl: 'http://169.254.169.254/meta', maxAmount: '1' };
        assert.strictEqual(paySchema.safeParse(internal).success, false);
      } finally {
        Reflect.set(config, 'NODE_ENV', original);
      }
    });

    it('enforces maximum header constraints', () => {
      const original = config.NODE_ENV;
      Reflect.set(config, 'NODE_ENV', 'production');
      try {
        const headers = Array(15).fill({ key: 'X-Custom', value: 'Test' });
        const payload = {
          serviceUrl: 'https://example.com',
          maxAmount: '1.0',
          headers
        };
        assert.strictEqual(paySchema.safeParse(payload).success, false);
      } finally {
        Reflect.set(config, 'NODE_ENV', original);
      }
    });
  });

  describe('bridgeSchema', () => {
    it('allows valid cross-chain bridge intents', () => {
      const payload = {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        amount: '1000'
      };
      assert.strictEqual(bridgeSchema.safeParse(payload).success, true);
    });

    it('allows bridge intents with explicit recipients', () => {
      const payload = {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        recipient: '0x8E8F5064f20D235F899c7553F1BEE77A235F4828',
        amount: '500'
      };
      assert.strictEqual(bridgeSchema.safeParse(payload).success, true);
    });

    it('blocks bridge intents with zero or negative amounts', () => {
      const payload = {
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        amount: '0'
      };
      assert.strictEqual(bridgeSchema.safeParse(payload).success, false);
    });
  });

  describe('bridgeStatusSchema', () => {
    it('validates 64-character EVM transaction hashes', () => {
      assert.strictEqual(
        bridgeStatusSchema.safeParse({ txHash: '0x4878649abe08d9faaa6f7b948502e4144ec4fb1859e108f6367d65254c7b983c' }).success,
        true
      );
    });

    it('rejects improperly formatted transaction hashes', () => {
      assert.strictEqual(bridgeStatusSchema.safeParse({ txHash: '0x123' }).success, false);
      assert.strictEqual(bridgeStatusSchema.safeParse({ txHash: '4878649abe08d9faaa6f7b948502e4144ec4fb1859e108f6367d65254c7b983c' }).success, false);
    });
  });
});

describe('Circuit Breaker Utility', () => {
  beforeEach(() => {
    resetCircuit('test-service');
  });

  it('allows successful calls when CLOSED', async () => {
    let callCount = 0;
    const fn = async () => { callCount++; return 'success'; };
    const wrapped = createCircuitBreaker({ name: 'test-service', threshold: 3, resetTimeoutMs: 1000 }, fn);

    const result = await wrapped();

    assert.strictEqual(result, 'success');
    assert.strictEqual(callCount, 1);

    const state = getCircuitState('test-service');
    assert.strictEqual(state?.state, 'CLOSED');
    assert.strictEqual(state?.successCount, 1);
    assert.strictEqual(state?.failureCount, 0);
  });

  it('transitions to OPEN after reaching the failure threshold', async () => {
    const fn = async () => { throw new Error('Network failure'); };
    const wrapped = createCircuitBreaker({ name: 'test-service', threshold: 2, resetTimeoutMs: 1000 }, fn);

    await assert.rejects(wrapped(), /Network failure/);
    assert.strictEqual(getCircuitState('test-service')?.state, 'CLOSED');
    assert.strictEqual(getCircuitState('test-service')?.failureCount, 1);

    await assert.rejects(wrapped(), /Network failure/);
    assert.strictEqual(getCircuitState('test-service')?.state, 'OPEN');
    assert.strictEqual(getCircuitState('test-service')?.failureCount, 2);

    await assert.rejects(wrapped(), (err: InfrastructureError) => {
      assert.strictEqual(err.code, 'CIRCUIT_OPEN');
      return true;
    });
  });

  it('transitions to HALF_OPEN and recovers after timeout', async () => {
    let shouldFail = true;
    const fn = async () => {
      if (shouldFail) throw new Error('Fail');
      return 'recovered';
    };

    const wrapped = createCircuitBreaker({ name: 'test-service', threshold: 1, resetTimeoutMs: 100 }, fn);

    await assert.rejects(wrapped(), /Fail/);
    assert.strictEqual(getCircuitState('test-service')?.state, 'OPEN');

    await new Promise(resolve => setTimeout(resolve, 150));

    shouldFail = false;
    const result = await wrapped();

    assert.strictEqual(result, 'recovered');
    assert.strictEqual(getCircuitState('test-service')?.state, 'CLOSED');
    assert.strictEqual(getCircuitState('test-service')?.successCount, 1);
    assert.strictEqual(getCircuitState('test-service')?.failureCount, 0);
  });
});

describe('Error Utilities', () => {
  it('maps AppError objects consistently', () => {
    const error = new NotFoundError('User', '123');
    const httpError = toHttpError(error);

    assert.strictEqual(httpError.status, 404);
    assert.strictEqual(httpError.body.success, false);
    assert.strictEqual(httpError.body.code, 'NOT_FOUND');
    assert.strictEqual(httpError.body.error, 'User (123) not found');

    const body = httpError.body as { metadata?: Record<string, unknown> };
    assert.strictEqual(body.metadata?.resource, 'User');
    assert.strictEqual(body.metadata?.id, '123');
  });

  it('maps unknown errors to 500 Internal Server Error', () => {
    const error = new Error('Database disconnected');
    const httpError = toHttpError(error);

    assert.strictEqual(httpError.status, 500);
    assert.strictEqual(httpError.body.success, false);
    assert.strictEqual(httpError.body.code, 'INTERNAL_SERVER_ERROR');
    assert.strictEqual(httpError.body.error, 'Internal server error');
  });

  it('respects the expose property to hide sensitive details', () => {
    const error = new AppError(500, 'Secret DB connection failure', 'DB_ERROR', {}, false);
    const httpError = toHttpError(error);

    assert.strictEqual(httpError.status, 500);
    assert.strictEqual(httpError.body.success, false);
    assert.strictEqual(httpError.body.code, 'DB_ERROR');
    assert.strictEqual(httpError.body.error, 'Internal server error');
  });

  it('formats Zod validation issues', () => {
    const zodError = new Error('Zod validation failed');
    zodError.name = 'ZodError';
    Reflect.set(zodError, 'issues', [{ path: ['email'], message: 'Invalid email' }]);

    const httpError = toHttpError(zodError);

    assert.strictEqual(httpError.status, 400);
    assert.strictEqual(httpError.body.success, false);
    assert.strictEqual(httpError.body.code, 'VALIDATION_ERROR');
    assert.strictEqual(httpError.body.error, 'Validation failed');

    const body = httpError.body as { metadata?: { issues: Array<{ path: string[] }> } };
    assert.strictEqual(body.metadata?.issues[0]?.path[0], 'email');
  });
});

describe('Idempotency Determinism Utility', () => {
  describe('stableJson', () => {
    it('serializes primitives consistently', () => {
      assert.strictEqual(stableJson(null), 'null');
      assert.strictEqual(stableJson(42), '42');
      assert.strictEqual(stableJson('hello'), '"hello"');
      assert.strictEqual(stableJson(true), 'true');
    });

    it('serializes arrays without reordering', () => {
      assert.strictEqual(stableJson([1, 2, 3]), '[1,2,3]');
      assert.strictEqual(stableJson(['b', 'a', 'c']), '["b","a","c"]');
    });

    it('serializes objects by sorting keys alphabetically', () => {
      const objA = { z: 1, a: 2, m: 3 };
      const objB = { a: 2, m: 3, z: 1 };

      assert.strictEqual(stableJson(objA), '{"a":2,"m":3,"z":1}');
      assert.strictEqual(stableJson(objA), stableJson(objB));
    });

    it('handles nested structures recursively', () => {
      const payloadA = {
        amount: '100.00',
        destination: '0xabc',
        metadata: {
          tag: 'yield',
          chainId: 1,
        },
        tags: ['b', 'a'],
      };

      const payloadB = {
        metadata: {
          chainId: 1,
          tag: 'yield',
        },
        tags: ['b', 'a'],
        amount: '100.00',
        destination: '0xabc',
      };

      const expected = '{"amount":"100.00","destination":"0xabc","metadata":{"chainId":1,"tag":"yield"},"tags":["b","a"]}';
      assert.strictEqual(stableJson(payloadA), expected);
      assert.strictEqual(stableJson(payloadA), stableJson(payloadB));
    });

    it('returns different strings for array variations', () => {
      assert.notStrictEqual(stableJson(['a', 'b']), stableJson(['b', 'a']));
    });

    it('handles empty structures', () => {
      assert.strictEqual(stableJson({}), '{}');
      assert.strictEqual(stableJson([]), '[]');
    });
  });

  describe('hash', () => {
    it('produces deterministic SHA-256 hex strings', () => {
      const result1 = hash('payload-data');
      const result2 = hash('payload-data');
      const expected = '4878649abe08d9faaa6f7b948502e4144ec4fb1859e108f6367d65254c7b983c';

      assert.strictEqual(result1, expected);
      assert.strictEqual(result1, result2);
      assert.strictEqual(result1.length, 64);
    });

    it('produces unique hashes for different inputs', () => {
      assert.notStrictEqual(hash('data1'), hash('data2'));
    });
  });
});

describe('Rate Limit Utility', () => {
  describe('getClientIp', () => {
    it('extracts IP from connection when proxy headers are not trusted', () => {
      const original = config.TRUST_PROXY_HEADERS;
      Reflect.set(config, 'TRUST_PROXY_HEADERS', false);

      try {
        const ctx = {
          env: { incoming: { socket: { remoteAddress: '192.168.1.5' } } },
          req: { header: () => '10.0.0.1' },
        } as unknown as Context;

        const ip = getClientIp(ctx);
        assert.strictEqual(ip, '192.168.1.5');
      } finally {
        Reflect.set(config, 'TRUST_PROXY_HEADERS', original);
      }
    });

    it('prioritizes cf-connecting-ip when proxy headers are trusted', () => {
      const original = config.TRUST_PROXY_HEADERS;
      Reflect.set(config, 'TRUST_PROXY_HEADERS', true);

      try {
        const ctx = {
          req: {
            header: (name: string) => {
              if (name === 'cf-connecting-ip') return '203.0.113.1';
              if (name === 'x-forwarded-for') return '198.51.100.1, 10.0.0.1';
              return null;
            }
          }
        } as unknown as Context;

        const ip = getClientIp(ctx);
        assert.strictEqual(ip, '203.0.113.1');
      } finally {
        Reflect.set(config, 'TRUST_PROXY_HEADERS', original);
      }
    });

    it('falls back to x-forwarded-for when cf-connecting-ip is missing', () => {
      const original = config.TRUST_PROXY_HEADERS;
      Reflect.set(config, 'TRUST_PROXY_HEADERS', true);

      try {
        const ctx = {
          req: {
            header: (name: string) => {
              if (name === 'cf-connecting-ip') return null;
              if (name === 'x-forwarded-for') return '198.51.100.1, 10.0.0.1';
              return null;
            }
          }
        } as unknown as Context;

        const ip = getClientIp(ctx);
        assert.strictEqual(ip, '198.51.100.1');
      } finally {
        Reflect.set(config, 'TRUST_PROXY_HEADERS', original);
      }
    });
  });
});

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fakeContext(overrides: {
  requestIdHeader?: string | null;
} = {}): {
  ctx: Context;
  headers: Record<string, string>;
  store: Record<string, unknown>;
} {
  const headers: Record<string, string> = {};
  const store: Record<string, unknown> = {};

  const ctx = {
    req: {
      header: (name: string) =>
        name.toLowerCase() === 'x-request-id'
          ? (overrides.requestIdHeader ?? undefined)
          : undefined,
    },
    set: (key: string, value: unknown) => { store[key] = value; },
    get: (key: string) => store[key],
    header: (name: string, value: string) => { headers[name] = value; },
  } as unknown as Context;

  return { ctx, headers, store };
}

/** Invoke the middleware directly. */
async function runMiddleware(
  ctx: Context,
  next: Next = async () => {},
): Promise<void> {
  await (requestIdMiddleware as unknown as (c: Context, next: Next) => Promise<void>)(ctx, next);
}

describe('Request ID Utility', () => {
  describe('getRequestId', () => {
    it('returns "unknown" when called with no arguments outside a context', () => {
      const id = getRequestId();
      assert.strictEqual(id, 'unknown');
    });

    it('returns the id from a context-like object that has a .get() method', () => {
      const contextMap = new Map<string, string>([['requestId', 'ctx-001']]);
      assert.strictEqual(getRequestId(contextMap), 'ctx-001');
    });

    it('returns "unknown" when context .get() yields undefined', () => {
      const empty = new Map<string, string>();
      assert.strictEqual(getRequestId(empty), 'unknown');
    });

    it('retrieves the id from AsyncLocalStorage when running inside a context', async () => {
      await requestContext.run({ requestId: 'als-789' }, async () => {
        assert.strictEqual(getRequestId(), 'als-789');
      });
    });

    it('prioritises AsyncLocalStorage over a passed context object', async () => {
      const contextMap = new Map<string, string>([['requestId', 'ctx-will-lose']]);
      await requestContext.run({ requestId: 'als-wins' }, async () => {
        assert.strictEqual(getRequestId(contextMap), 'als-wins');
      });
    });

    it('still returns the context value if AsyncLocalStorage store has no requestId', async () => {
      const contextMap = new Map<string, string>([['requestId', 'ctx-fallback']]);
      await requestContext.run({ requestId: '' }, async () => {
        assert.strictEqual(getRequestId(contextMap), 'ctx-fallback');
      });
    });

    it('works with a plain object whose .get() mimics Hono Context', () => {
      const fake = { get: (key: string) => (key === 'requestId' ? 'obj-123' : undefined) };
      assert.strictEqual(getRequestId(fake), 'obj-123');
    });
  });

  describe('requestIdMiddleware', () => {
    it('passes through a valid inbound X-Request-Id header', async () => {
      const { ctx, headers, store } = fakeContext({ requestIdHeader: 'abcd1234-ef56-7890-abcd-ef1234567890' });
      await runMiddleware(ctx);
      assert.strictEqual(store['requestId'], 'abcd1234-ef56-7890-abcd-ef1234567890');
      assert.strictEqual(headers['X-Request-Id'], 'abcd1234-ef56-7890-abcd-ef1234567890');
    });

    it('accepts a short alphanumeric id (min 8 chars)', async () => {
      const { ctx, store } = fakeContext({ requestIdHeader: 'abc12345' });
      await runMiddleware(ctx);
      assert.strictEqual(store['requestId'], 'abc12345');
    });

    it('accepts a 128-char id (upper boundary)', async () => {
      const long = 'a'.repeat(128);
      const { ctx, store } = fakeContext({ requestIdHeader: long });
      await runMiddleware(ctx);
      assert.strictEqual(store['requestId'], long);
    });

    it('accepts ids containing hyphens and underscores', async () => {
      const { ctx, store } = fakeContext({ requestIdHeader: 'req_id-test_1234' });
      await runMiddleware(ctx);
      assert.strictEqual(store['requestId'], 'req_id-test_1234');
    });

    it('generates a UUID when no X-Request-Id header is present', async () => {
      const { ctx, store, headers } = fakeContext({ requestIdHeader: null });
      await runMiddleware(ctx);
      assert.ok(UUID_V4_RE.test(store['requestId'] as string), 'should be a v4 UUID');
      assert.strictEqual(store['requestId'], headers['X-Request-Id']);
    });

    it('generates a UUID when the inbound id is too short (< 8 chars)', async () => {
      const { ctx, store } = fakeContext({ requestIdHeader: 'short' });
      await runMiddleware(ctx);
      assert.ok(UUID_V4_RE.test(store['requestId'] as string));
    });

    it('generates a UUID when the inbound id is too long (> 128 chars)', async () => {
      const { ctx, store } = fakeContext({ requestIdHeader: 'x'.repeat(129) });
      await runMiddleware(ctx);
      assert.ok(UUID_V4_RE.test(store['requestId'] as string));
    });

    it('generates a UUID when the inbound id contains forbidden characters', async () => {
      for (const bad of ['req id!!', 'req<script>', 'req id spaces', '../../etc']) {
        const { ctx, store } = fakeContext({ requestIdHeader: bad.padEnd(8, '0') });
        await runMiddleware(ctx);
        assert.ok(
          UUID_V4_RE.test(store['requestId'] as string),
          `"${bad}" should have been rejected`,
        );
      }
    });

    it('strips whitespace from inbound header before validating', async () => {
      const { ctx, store } = fakeContext({ requestIdHeader: '  valid_id_12345678  ' });
      await runMiddleware(ctx);
      assert.strictEqual(store['requestId'], 'valid_id_12345678');
    });

    it('always sets the X-Request-Id response header', async () => {
      const { ctx, headers } = fakeContext({});
      await runMiddleware(ctx);
      assert.ok(headers['X-Request-Id'], 'X-Request-Id must be present in response');
    });

    it('makes the request id available via AsyncLocalStorage inside next()', async () => {
      const { ctx } = fakeContext({ requestIdHeader: 'propagated-id-123' });
      let captured: string | undefined;
      await runMiddleware(ctx, async () => {
        captured = requestContext.getStore()?.requestId;
      });
      assert.strictEqual(captured, 'propagated-id-123');
    });

    it('generated UUIDs are also propagated through AsyncLocalStorage', async () => {
      const { ctx } = fakeContext({ requestIdHeader: null });
      let captured: string | undefined;
      await runMiddleware(ctx, async () => {
        captured = requestContext.getStore()?.requestId;
      });
      assert.ok(captured);
      assert.ok(UUID_V4_RE.test(captured!));
    });

    it('AsyncLocalStorage store is isolated between sequential requests', async () => {
      const ids: string[] = [];
      for (const header of ['first-request-id', 'second-request-id']) {
        const { ctx } = fakeContext({ requestIdHeader: header });
        await runMiddleware(ctx, async () => {
          ids.push(requestContext.getStore()!.requestId);
        });
      }
      assert.deepStrictEqual(ids, ['first-request-id', 'second-request-id']);
    });

    it('AsyncLocalStorage store is not leaked after middleware completes', async () => {
      const { ctx } = fakeContext({ requestIdHeader: 'should-not-leak' });
      await runMiddleware(ctx);
      assert.strictEqual(requestContext.getStore(), undefined);
    });

    it('calls next() exactly once', async () => {
      const { ctx } = fakeContext({});
      let calls = 0;
      await runMiddleware(ctx, async () => { calls++; });
      assert.strictEqual(calls, 1);
    });

    it('maintains independent stores for concurrent requests', async () => {
      const results = await Promise.all(
        ['concurrent-a', 'concurrent-b', 'concurrent-c'].map(
          (id) =>
            new Promise<string>((resolve) => {
              const { ctx } = fakeContext({ requestIdHeader: id });
              runMiddleware(ctx, async () => {
                await new Promise((r) => setTimeout(r, 5));
                resolve(requestContext.getStore()!.requestId);
              });
            }),
        ),
      );
      assert.deepStrictEqual(results, ['concurrent-a', 'concurrent-b', 'concurrent-c']);
    });

    it('generates unique UUIDs across multiple invocations', async () => {
      const generated = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const { ctx, store } = fakeContext({ requestIdHeader: null });
        await runMiddleware(ctx);
        generated.add(store['requestId'] as string);
      }
      assert.strictEqual(generated.size, 50, 'all 50 generated ids should be unique');
    });
  });
});

describe('Auth Tokens Utility', () => {
  it('generates an API token with the correct prefix and length', () => {
    const token = createApiToken();
    assert.strictEqual(token.startsWith('aegis_live_'), true);
    assert.ok(token.length >= 43);
  });

  it('generates a highly random 6-character hex verification code', () => {
    const code1 = createVerificationCode();
    const code2 = createVerificationCode();

    assert.strictEqual(code1.length, 6);
    assert.match(code1, /^[0-9A-F]{6}$/);
    assert.strictEqual(code1 === code2, false);
  });

  it('hashes API tokens deterministically', () => {
    const token = 'aegis_live_abcdef123456';
    const hash1 = hashApiToken(token);
    const hash2 = hashApiToken(token);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  it('hashes verification codes deterministically and ignores case/whitespace', () => {
    const raw = 'a8f93d';
    const sloppy = '  A8F93D  ';

    const hash1 = hashVerificationCode(raw);
    const hash2 = hashVerificationCode(sloppy);

    assert.strictEqual(hash1, hash2);
  });

  it('validates the shape of API tokens correctly', () => {
    assert.strictEqual(isValidTokenShape(createApiToken()), true);
    assert.strictEqual(isValidTokenShape('aegis_live_short'), false);
    assert.strictEqual(isValidTokenShape('invalid_prefix_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), false);
  });

  it('safely compares tokens avoiding timing attacks', () => {
    const tokenA = 'aegis_live_abcdef1234567890abcdef1234567890';
    const tokenB = 'aegis_live_abcdef1234567890abcdef1234567890';
    const tokenC = 'aegis_live_abcdef1234567890abcdef1234567891';

    assert.strictEqual(safeTokenCompare(tokenA, tokenB), true);
    assert.strictEqual(safeTokenCompare(tokenA, tokenC), false);
    assert.strictEqual(safeTokenCompare(tokenA, 'short'), false);
  });
});

describe('Validation Utility', () => {
  describe('toUsdcNumber', () => {
    it('handles whole numbers', () => {
      assert.strictEqual(toUsdcNumber('100'), 100.000000);
    });

    it('handles partial fractions', () => {
      assert.strictEqual(toUsdcNumber('100.5'), 100.500000);
    });

    it('handles precise fractions', () => {
      assert.strictEqual(toUsdcNumber('100.123456'), 100.123456);
    });

    it('truncates overflow fractions', () => {
      assert.strictEqual(toUsdcNumber('100.12345678'), 100.123456);
    });
  });

  describe('evmAddressSchema', () => {
    it('accepts valid EVM addresses', () => {
      assert.strictEqual(
        evmAddressSchema.safeParse('0x8E8F5064f20D235F899c7553F1BEE77A235F4828').success,
        true
      );
    });

    it('rejects addresses with invalid lengths', () => {
      assert.strictEqual(
        evmAddressSchema.safeParse('0x8E8F5064f20D235F899c7553F1BEE77A235F482').success,
        false
      );
    });

    it('rejects addresses without 0x prefix', () => {
      assert.strictEqual(
        evmAddressSchema.safeParse('8E8F5064f20D235F899c7553F1BEE77A235F4828').success,
        false
      );
    });
  });

  describe('usdcAmountSchema', () => {
    it('accepts valid amounts', () => {
      assert.strictEqual(usdcAmountSchema.safeParse('100.00').success, true);
      assert.strictEqual(usdcAmountSchema.safeParse('0.1').success, true);
      assert.strictEqual(usdcAmountSchema.safeParse('1000000').success, true);
    });

    it('rejects negative numbers', () => {
      assert.strictEqual(usdcAmountSchema.safeParse('-10.00').success, false);
    });

    it('rejects zero amounts', () => {
      assert.strictEqual(usdcAmountSchema.safeParse('0').success, false);
      assert.strictEqual(usdcAmountSchema.safeParse('0.000000').success, false);
    });

    it('rejects excessive precision', () => {
      assert.strictEqual(usdcAmountSchema.safeParse('1.1234567').success, false);
    });

    it('rejects amounts above the 1 million cap', () => {
      assert.strictEqual(usdcAmountSchema.safeParse('1000001').success, false);
    });
  });

  describe('serviceUrlSchema (SSRF Prevention)', () => {
    it('accepts valid external HTTPS endpoints', () => {
      const original = config.NODE_ENV;
      Reflect.set(config, 'NODE_ENV', 'production');
      try {
        assert.strictEqual(serviceUrlSchema.safeParse('https://api.github.com/v1/data').success, true);
        assert.strictEqual(serviceUrlSchema.safeParse('https://docs.aegisintent.xyz').success, true);
      } finally {
        Reflect.set(config, 'NODE_ENV', original);
      }
    });

    it('rejects internal IP addresses and loopbacks', () => {
      const original = config.NODE_ENV;
      Reflect.set(config, 'NODE_ENV', 'production');
      try {
        assert.strictEqual(serviceUrlSchema.safeParse('https://127.0.0.1/admin').success, false);
        assert.strictEqual(serviceUrlSchema.safeParse('https://169.254.169.254/latest/meta-data').success, false);
        assert.strictEqual(serviceUrlSchema.safeParse('https://10.0.0.5/internal').success, false);
        assert.strictEqual(serviceUrlSchema.safeParse('https://192.168.1.100').success, false);
        assert.strictEqual(serviceUrlSchema.safeParse('https://0.0.0.0').success, false);
        assert.strictEqual(serviceUrlSchema.safeParse('https://::1').success, false);
      } finally {
        Reflect.set(config, 'NODE_ENV', original);
      }
    });

    it('rejects unencrypted HTTP traffic', () => {
      const original = config.NODE_ENV;
      Reflect.set(config, 'NODE_ENV', 'production');
      try {
        assert.strictEqual(serviceUrlSchema.safeParse('http://api.github.com').success, false);
      } finally {
        Reflect.set(config, 'NODE_ENV', original);
      }
    });

    it('rejects embedded credentials', () => {
      const original = config.NODE_ENV;
      Reflect.set(config, 'NODE_ENV', 'production');
      try {
        assert.strictEqual(serviceUrlSchema.safeParse('https://admin:password@api.example.com').success, false);
      } finally {
        Reflect.set(config, 'NODE_ENV', original);
      }
    });
  });
});
