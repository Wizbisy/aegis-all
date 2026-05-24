import { AppError, InfrastructureError } from './errors.js';
import { logger } from './logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  name: string;
  /** Number of consecutive failures before opening the circuit. */
  threshold: number;
  /** How long (ms) the circuit stays open before allowing a trial request. */
  resetTimeoutMs: number;
}

interface CircuitRecord {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  successCount: number;
}

const circuits = new Map<string, CircuitRecord>();

function getOrCreate(name: string): CircuitRecord {
  let record = circuits.get(name);
  if (!record) {
    record = { state: 'CLOSED', failureCount: 0, lastFailureAt: 0, successCount: 0 };
    circuits.set(name, record);
  }
  return record;
}

/**
 * Wraps an async function with a circuit breaker.
 * When consecutive failures exceed `threshold`, the circuit opens
 * and subsequent calls are rejected instantly for `resetTimeoutMs`.
 * After the timeout, a single trial call is allowed (HALF_OPEN).
 */
export function createCircuitBreaker<TArgs extends unknown[], TResult>(
  options: CircuitBreakerOptions,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  const { name, threshold, resetTimeoutMs } = options;

  return async (...args: TArgs): Promise<TResult> => {
    const record = getOrCreate(name);
    const now = Date.now();

    if (record.state === 'OPEN') {
      if (now - record.lastFailureAt >= resetTimeoutMs) {
        record.state = 'HALF_OPEN';
        logger.info({ circuit: name }, 'Circuit breaker transitioning to HALF_OPEN');
      } else {
        const remaining = Math.ceil((resetTimeoutMs - (now - record.lastFailureAt)) / 1000);
        throw new InfrastructureError(
          `Service "${name}" is currently unavailable (circuit open). Try again in ${remaining}s.`,
          'CIRCUIT_OPEN',
          { circuit: name, retryAfter: remaining }
        );
      }
    }

    try {
      const result = await fn(...args);

      record.failureCount = 0;
      record.successCount += 1;
      if (record.state === 'HALF_OPEN') {
        record.state = 'CLOSED';
        logger.info({ circuit: name }, 'Circuit breaker closed after successful trial');
      }

      return result;
    } catch (error) {
      record.failureCount += 1;
      record.lastFailureAt = now;

      if (record.state === 'HALF_OPEN') {
        record.state = 'OPEN';
        logger.warn({ circuit: name }, 'Circuit breaker re-opened after failed trial');
      } else if (record.failureCount >= threshold) {
        record.state = 'OPEN';
        logger.warn({ circuit: name, failures: record.failureCount }, 'Circuit breaker opened');
      }

      throw error;
    }
  };
}

export function getCircuitState(name: string): CircuitRecord | null {
  return circuits.get(name) ?? null;
}

export function resetCircuit(name: string) {
  circuits.delete(name);
}
