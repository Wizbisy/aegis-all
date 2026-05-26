import { getWalletBalance } from '../circle/wallet.js';
import { payForService, type PayForServiceOptions } from './pay.js';
import { getBridgeFee } from '../services/cctp/quotes.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { estimateTransactionFee } from '../circle/dcw.js';

/**
 * Estimates the cost of a USDC transfer without executing it.
 * Validates the destination, amount, and checks the wallet balance.
 */
export async function estimateTransfer(walletId: string, destinationAddress: string, amount: string) {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new AppError(400, 'Amount must be a positive number', 'INVALID_AMOUNT');
  }

  logger.debug({ walletId, destination: destinationAddress, amount }, 'Estimating transfer');

  const [balances, fees] = await Promise.all([
    getWalletBalance(walletId),
    estimateTransactionFee({ walletId, destinationAddress, amount }),
  ]);

  const usdcBalance = balances.find(
    (token: { token?: { symbol?: string } }) => token.token?.symbol === 'USDC',
  );

  const available = Number(usdcBalance?.amount ?? '0');
  
  const estimatedGasUsdc = fees.medium?.networkFee || '0.00771808'; 
  const totalCostUsdc = String(parsedAmount + Number(estimatedGasUsdc));

  return {
    action: 'TRANSFER_USDC',
    destination: destinationAddress,
    amount,
    estimatedGasUsdc,
    totalCostUsdc,
    sufficientBalance: available >= Number(totalCostUsdc),
    currentBalanceUsdc: String(available),
    feeLevels: fees, 
    note: 'fee estimation is based on current network conditions and may change at execution time',
  };
}

/**
 * Estimates the cost of an x402 paid service call without executing payment.
 */
export async function estimatePaidService(options: PayForServiceOptions) {
  return payForService({ ...options, estimate: true });
}

/**
 * Estimates the cost of a CCTP bridge transfer.
 * Includes balance verification if walletId is provided.
 */
export async function estimateBridge(toChain: string, amount: string, walletId?: string, fromChain?: string) {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new AppError(400, 'Amount must be a positive number', 'INVALID_AMOUNT');
  }

  logger.debug({ fromChain, toChain, amount, walletId }, 'Estimating CCTP bridge transfer');

  if (!fromChain) {
    throw new AppError(400, 'fromChain is required', 'BRIDGE_FROM_CHAIN_REQUIRED');
  }

  const feeQuote = await getBridgeFee({
    toChain,
    fromChain,
  });
  const totalCost = parsedAmount + Number(feeQuote.estimatedFeeUsdc);

  let balanceInfo = {};
  if (walletId) {
    try {
      const balances = await getWalletBalance(walletId);
      const usdcBalance = balances.find(
        (token: { token?: { symbol?: string } }) => token.token?.symbol === 'USDC',
      );
      const available = Number(usdcBalance?.amount ?? '0');
      balanceInfo = {
        sufficientBalance: available >= totalCost,
        currentBalanceUsdc: String(available),
      };
    } catch (err) {
      logger.warn({ walletId, err }, 'Failed to fetch balance for bridge estimation');
    }
  }

  return {
    action: 'CCTP_BRIDGE_USDC',
    fromChain: feeQuote.fromChain,
    toChain: feeQuote.toChain,
    amount,
    estimatedFeeUsdc: feeQuote.estimatedFeeUsdc,
    totalCostUsdc: String(totalCost),
    ...balanceInfo,
    note: feeQuote.note,
  };
}
