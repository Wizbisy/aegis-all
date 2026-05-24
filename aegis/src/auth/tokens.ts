import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const TOKEN_PREFIX = 'aegis_live_';

export function createApiToken() {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function createVerificationCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

export function hashApiToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashVerificationCode(code: string) {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function isValidTokenShape(token: string) {
  return token.startsWith(TOKEN_PREFIX) && token.length >= TOKEN_PREFIX.length + 32;
}

export function safeTokenCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
