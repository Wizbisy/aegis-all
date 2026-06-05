import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { requestContext, getRequestId } from '../src/utils/requestid.js';

describe('Request ID Utility', () => {
  it('returns unknown outside context without parameters', () => {
    const id = getRequestId();
    assert.strictEqual(id, 'unknown');
  });

  it('returns context-provided id if explicit parameter passed', () => {
    const contextMap = new Map([['requestId', 'req-123']]);
    const id = getRequestId(contextMap);
    assert.strictEqual(id, 'req-123');
  });

  it('returns from AsyncLocalStorage when inside context execution', async () => {
    await requestContext.run({ requestId: 'async-456' }, async () => {
      const id = getRequestId();
      assert.strictEqual(id, 'async-456');
    });
  });

  it('prioritizes AsyncLocalStorage over passed context object', async () => {
    const contextMap = new Map([['requestId', 'req-123']]);
    await requestContext.run({ requestId: 'async-456' }, async () => {
      const id = getRequestId(contextMap);
      assert.strictEqual(id, 'async-456');
    });
  });
});
