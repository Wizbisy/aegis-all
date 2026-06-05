import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { createCircuitBreaker, getCircuitState, resetCircuit } from '../src/utils/circuitbreaker.js';
import { InfrastructureError } from '../src/utils/errors.js';

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
