import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { hash, stableJson } from '../src/utils/idempotency.js';

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
