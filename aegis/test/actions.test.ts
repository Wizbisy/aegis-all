import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  transferSchema,
  paySchema,
  bridgeSchema,
  bridgeStatusSchema
} from '../src/routes/actions.js';
import { config } from '../src/config.js';

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
      assert.strictEqual(bridgeStatusSchema.safeParse({ txHash: '4878649abe08d9faaa6f7b948502e4144ec4fb1859e108f6367d65254c7b983c' }).success, false); // Missing 0x
    });
  });
});
