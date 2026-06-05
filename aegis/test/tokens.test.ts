import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  createApiToken,
  createVerificationCode,
  hashApiToken,
  hashVerificationCode,
  isValidTokenShape,
  safeTokenCompare,
} from '../src/auth/tokens.js';

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
