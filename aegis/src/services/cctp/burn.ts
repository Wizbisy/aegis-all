import { BridgeKit } from '@circle-fin/bridge-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { config } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createCircuitBreaker } from '../../utils/circuitbreaker.js';
import { resolveBridgeChain } from './chains.js';
import type { BridgeTransferInput } from '../../utils/types.js';

let bridgeKit: BridgeKit | null = null;

function getBridgeKit(): BridgeKit {
  if (!bridgeKit) {
    bridgeKit = new BridgeKit();
    bridgeKit.on('*', (payload: unknown) => {
      logger.debug({ bridgeEvent: payload }, 'Bridge Kit event');
    });
  }
  return bridgeKit;
}

function getCircleWalletsAdapter() {
  if (!config.CIRCLE_API_KEY || !config.ENTITY_SECRET) {
    throw new AppError(503, 'Circle API credentials are not configured for bridging', 'BRIDGE_NOT_CONFIGURED');
  }

  return createCircleWalletsAdapter({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.ENTITY_SECRET,
  });
}

/**
 * Executes a CCTP bridge transfer from Arc Testnet to a target chain.
 * The full CCTP lifecycle is: approve → burn → fetchAttestation → mint.
 * Bridge Kit handles all four steps in a single kit.bridge() call.
 */
async function _bridgeUsdc(input: BridgeTransferInput): Promise<unknown> {
  const fromChain = resolveBridgeChain(input.fromChain ?? config.ARC_CHAIN);
  const toChain = resolveBridgeChain(input.toChain);

  if (fromChain === toChain) {
    throw new AppError(400, 'Source and destination chains must be different', 'BRIDGE_SAME_CHAIN');
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'Bridge amount must be a positive number', 'BRIDGE_INVALID_AMOUNT');
  }

  logger.info(
    { from: fromChain, to: toChain, amount: input.amount, recipient: input.recipient ?? input.walletAddress },
    'Initiating CCTP bridge transfer',
  );

  const adapter = getCircleWalletsAdapter();
  const kit = getBridgeKit();

  const result = await kit.bridge({
    from: {
      adapter,
      chain: fromChain as never,
      address: input.walletAddress,
    },
    to: {
      adapter,
      chain: toChain as never,
      address: input.recipient ?? input.walletAddress,
      useForwarder: true,
    },
    amount: input.amount,
  });

  if ((result as { state?: string }).state === 'error') {
    const steps = (result as { steps?: Array<{ name?: string; state?: string; error?: string }> }).steps ?? [];
    const failedStep = steps.find((step) => step.state === 'error');
    logger.error(
      { failedStep: failedStep?.name, error: failedStep?.error, result },
      'CCTP bridge transfer failed',
    );

    throw new AppError(
      502,
      `Bridge failed at step "${failedStep?.name ?? 'unknown'}": ${failedStep?.error ?? 'Unknown error'}`,
      'BRIDGE_EXECUTION_FAILED',
    );
  }

  logger.info({ state: (result as { state?: string }).state }, 'CCTP bridge transfer completed');
  return result;
}

export const bridgeUsdc = createCircuitBreaker(
  { name: 'cctp-bridge', threshold: 3, resetTimeoutMs: 60_000 },
  _bridgeUsdc,
);
