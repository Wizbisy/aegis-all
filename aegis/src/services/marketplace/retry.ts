import { AppError } from '../../utils/errors.js';

export function assertRetrySafe(previousStatus: string, previousError?: string | null) {
  if (previousStatus === 'SUCCESS') {
    throw new AppError(409, 'This marketplace payment already succeeded and must not be retried', 'PAYMENT_ALREADY_COMPLETED');
  }

  if (previousError?.toLowerCase().includes('payment was submitted')) {
    throw new AppError(409, 'Payment may already have moved funds. Check Circle payment logs before retrying.', 'PAYMENT_RETRY_UNSAFE');
  }
}
