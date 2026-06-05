import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { getClientIp } from '../src/utils/ratelimit.js';
import { config } from '../src/config.js';
import type { Context } from 'hono';

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
