import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { AppError, toHttpError, NotFoundError } from '../src/utils/errors.js';

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
