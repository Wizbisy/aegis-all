import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { toUsdcNumber, evmAddressSchema, usdcAmountSchema, serviceUrlSchema } from '../src/utils/validation.js';
import { config } from '../src/config.js';

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
