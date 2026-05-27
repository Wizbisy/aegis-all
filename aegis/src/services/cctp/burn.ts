import { BridgeKit, EthereumSepolia, ArbitrumSepolia, BaseSepolia, OptimismSepolia, PolygonAmoy, AvalancheFuji } from '@circle-fin/bridge-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { createPublicClient, http } from 'viem';
import { config } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { createCircuitBreaker } from '../../utils/circuitbreaker.js';
import { resolveBridgeChain } from './chains.js';
import type { BridgeTransferInput } from '../../utils/types.js';

let bridgeKit: BridgeKit | null = null;

function injectAlchemyRPCs() {
  if (!config.ALCHEMY_API_KEY) return;
  const key = config.ALCHEMY_API_KEY;

  (EthereumSepolia as any).rpcEndpoints = [`https://eth-sepolia.g.alchemy.com/v2/${key}`, ...EthereumSepolia.rpcEndpoints];
  (ArbitrumSepolia as any).rpcEndpoints = [`https://arb-sepolia.g.alchemy.com/v2/${key}`, ...ArbitrumSepolia.rpcEndpoints];
  (BaseSepolia as any).rpcEndpoints = [`https://base-sepolia.g.alchemy.com/v2/${key}`, ...BaseSepolia.rpcEndpoints];
  (OptimismSepolia as any).rpcEndpoints = [`https://opt-sepolia.g.alchemy.com/v2/${key}`, ...OptimismSepolia.rpcEndpoints];
  (PolygonAmoy as any).rpcEndpoints = [`https://polygon-amoy.g.alchemy.com/v2/${key}`, ...PolygonAmoy.rpcEndpoints];
  (AvalancheFuji as any).rpcEndpoints = [`https://avax-fuji.g.alchemy.com/v2/${key}`, ...AvalancheFuji.rpcEndpoints];
  logger.info('Injected custom Alchemy RPC endpoints into BridgeKit chains');
}

function getBridgeKit(): BridgeKit {
  if (!bridgeKit) {
    injectAlchemyRPCs();
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

function extractTxHash(message: unknown): string | undefined {
  const str = message instanceof Error ? message.message : String(message);
  const match = str.match(/hash\s+"(0x[a-fA-F0-9]{64})"/);
  return match?.[1];
}

/**
 * Returns an Alchemy RPC URL for the given resolved chain name.
 * Falls back to the chain definition's first RPC if Alchemy isn't available.
 */
function getChainRpcUrl(resolvedChainName: string): string | null {
  const key = config.ALCHEMY_API_KEY;
  if (key) {
    const alchemyMap: Record<string, string> = {
      'Ethereum_Sepolia': `https://eth-sepolia.g.alchemy.com/v2/${key}`,
      'Arbitrum_Sepolia': `https://arb-sepolia.g.alchemy.com/v2/${key}`,
      'Base_Sepolia': `https://base-sepolia.g.alchemy.com/v2/${key}`,
      'Optimism_Sepolia': `https://opt-sepolia.g.alchemy.com/v2/${key}`,
      'Polygon_Amoy': `https://polygon-amoy.g.alchemy.com/v2/${key}`,
      'Avalanche_Fuji': `https://avax-fuji.g.alchemy.com/v2/${key}`,
    };
    if (alchemyMap[resolvedChainName]) return alchemyMap[resolvedChainName];
  }

  const chainMap: Record<string, { rpcEndpoints: readonly string[] }> = {
    'Ethereum_Sepolia': EthereumSepolia,
    'Arbitrum_Sepolia': ArbitrumSepolia,
    'Base_Sepolia': BaseSepolia,
    'Optimism_Sepolia': OptimismSepolia,
    'Polygon_Amoy': PolygonAmoy,
    'Avalanche_Fuji': AvalancheFuji,
  };
  return chainMap[resolvedChainName]?.rpcEndpoints[0] ?? null;
}

/**
 * Polls for a transaction receipt using our own RPC .
 * Circle's MPC wallets can take 30-90s to broadcast. BridgeKit's internal Viem timeout
 * is too short, so we poll independently with a 5-minute window.
 */
async function waitForTxOnChain(txHash: string, resolvedChainName: string, timeoutMs = 300_000): Promise<boolean> {
  const rpcUrl = getChainRpcUrl(resolvedChainName);
  if (!rpcUrl) {
    logger.warn({ chain: resolvedChainName }, 'No RPC URL available for chain — cannot poll for receipt');
    return false;
  }

  const client = createPublicClient({ transport: http(rpcUrl) });
  const startTime = Date.now();

  logger.info({ txHash, chain: resolvedChainName, rpcUrl: rpcUrl.replace(/\/v2\/.*/, '/v2/***') }, 'Polling for transaction receipt via dedicated RPC...');

  while (Date.now() - startTime < timeoutMs) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt) {
        logger.info({ txHash, status: receipt.status, blockNumber: Number(receipt.blockNumber) }, 'Transaction confirmed onchain!');
        return receipt.status === 'success';
      }
    } catch {
    }
    await new Promise(r => setTimeout(r, 10_000));
  }

  logger.error({ txHash, chain: resolvedChainName, elapsedMs: Date.now() - startTime }, 'Transaction not confirmed after polling timeout');
  return false;
}

/**
 * Executes a CCTP bridge transfer from Arc Testnet to a target chain.
 * The full CCTP lifecycle is: approve → burn → fetchAttestation → mint.
 * Bridge Kit handles all four steps in a single kit.bridge() call.
 */
async function _bridgeUsdc(input: BridgeTransferInput): Promise<unknown> {
  if (!input.fromChain) {
    throw new AppError(400, 'fromChain is required', 'BRIDGE_FROM_CHAIN_REQUIRED');
  }

  const fromChain = resolveBridgeChain(input.fromChain);
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

  let attempts = 0;
  const maxAttempts = 3;
  let previousResult: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      let result;
      if (previousResult) {
        result = await kit.retry(previousResult, {
          from: adapter,
          to: adapter
        });
      } else {
        result = await kit.bridge({
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
      }

      const bridgeResult = result as { state?: string; steps?: Array<{ name?: string; state?: string; txHash?: string; error?: any; errorMessage?: string }> };

      if (bridgeResult.state === 'error') {
        const steps = bridgeResult.steps ?? [];
        const failedStep = steps.find((step) => step.state === 'error');
        const failedError = failedStep?.errorMessage || failedStep?.error?.message || failedStep?.error?.shortMessage || String(failedStep?.error || 'Unknown error');

        if (/WaitForTransactionReceiptTimeoutError/i.test(failedError) || /Timed out while waiting for transaction/i.test(failedError)) {
          const txHash = extractTxHash(failedError) ?? failedStep?.txHash;
          logger.warn({ txHash, step: failedStep?.name, attempt: attempts }, 'BridgeKit timed out waiting for receipt. Polling via Alchemy...');

          if (attempts >= maxAttempts) {
            throw new AppError(502, `Bridge permanently timed out after ${maxAttempts} attempts at step "${failedStep?.name}". Last Tx: ${txHash}`, 'BRIDGE_TIMEOUT');
          }

          if (txHash) {
            const confirmed = await waitForTxOnChain(txHash, fromChain);
            if (confirmed) {
              logger.info({ txHash, step: failedStep?.name }, 'Tx confirmed onchain! Patching step state and re-calling kit.retry()...');
              if (failedStep) {
                failedStep.state = 'success';
                delete failedStep.error;
              }
              previousResult = bridgeResult;
              continue;
            }
          }

          throw new AppError(502, `Bridge step "${failedStep?.name}" timed out and tx could not be confirmed onchain. Tx: ${txHash}`, 'BRIDGE_TIMEOUT');
        }

        logger.error({ failedStep: failedStep?.name, error: failedError, result }, 'CCTP bridge transfer failed');
        throw new AppError(502, `Bridge failed at step "${failedStep?.name ?? 'unknown'}": ${failedError}`, 'BRIDGE_EXECUTION_FAILED');
      }

      const steps = bridgeResult.steps ?? [];
      const burnStep = steps.find((s) => s.name?.toLowerCase() === 'burn');
      const txHash = burnStep?.txHash ?? steps.find((s) => s.txHash)?.txHash;

      logger.info({ state: bridgeResult.state, txHash }, 'CCTP bridge transfer completed');
      return { ...result, txHash };
    } catch (err: any) {
      if (/WaitForTransactionReceiptTimeoutError/i.test(err.message || String(err))) {
        const txHash = extractTxHash(err.message || String(err));
        logger.warn({ error: err.message, txHash, attempt: attempts }, 'Bridge threw timeout exception. Polling via Alchemy...');

        if (attempts >= maxAttempts) throw err;

        if (txHash) {
          const confirmed = await waitForTxOnChain(txHash, fromChain);
          if (confirmed) {
            logger.info({ txHash }, 'Tx confirmed onchain! Patching error result and re-calling kit.retry()...');
            if (err.result) {
              const failedStep = err.result.steps?.find((s: any) => s.state === 'error');
              if (failedStep) {
                failedStep.state = 'success';
                delete failedStep.error;
              }
              previousResult = err.result;
            }
            continue;
          }
        }

        throw new AppError(502, `Bridge timed out and tx could not be confirmed. Tx: ${txHash}`, 'BRIDGE_TIMEOUT');
      }
      throw err;
    }
  }
}

export const bridgeUsdc = createCircuitBreaker(
  { name: 'cctp-bridge', threshold: 3, resetTimeoutMs: 60_000 },
  _bridgeUsdc,
);
