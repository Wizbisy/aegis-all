import { Token } from '@synthra-swap/sdk/core';
import { FeeAmount, nearestUsableTick, Pool, Position, TICK_SPACINGS } from '@synthra-swap/sdk/v3';
import * as JSBI from 'jsbi';
import { createHash } from 'crypto';
import { parseUnits } from 'viem';
import { executeContractCall, waitForDcwTransaction } from '../../../circle/dcw.js';
import { config } from '../../../config.js';
import { AppError } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';
import { toUsdcNumber } from '../../../utils/validation.js';
import { depositToYieldVault } from '../../yield/deposit.js';
import { getPublicClient, USDC_ADDRESS, ERC20_ABI } from '../../yield/client.js';
import { validateAgentAllocation } from './allocator.js';

function deriveUUID(base: string, suffix: string): string {
  const hash = createHash('sha256').update(`${base}-${suffix}`).digest('hex');
  const y = ['8', '9', 'a', 'b'][parseInt(hash.charAt(19), 16) % 4]!;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${y}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const ARC_CHAIN_ID = 5042002;

interface MultiYieldInput {
  walletId: string;
  walletAddress: string;
  amountUsdc: string;
  aegisWeight: number;
  synthraWeight: number;
  idempotencyKey: string;
}

export async function executeMultiYieldDeposit(input: MultiYieldInput) {
  const { walletId, walletAddress, amountUsdc, aegisWeight, synthraWeight, idempotencyKey } = input;

  logger.info({ walletAddress, amountUsdc, aegisWeight, synthraWeight }, 'Initiating agentic multi yield aggregation');

  validateAgentAllocation(aegisWeight, synthraWeight);

  const totalUsdc = toUsdcNumber(amountUsdc);
  const aegisAmount = ((totalUsdc * aegisWeight) / 100).toFixed(6);
  const synthraAmount = ((totalUsdc * synthraWeight) / 100).toFixed(6);

  const results = {
    aegisVaultTx: null as string | null,
    synthraVaultTx: null as string | null,
  };

  if (Number(aegisAmount) > 0) {
    try {
      logger.info({ aegisAmount }, 'Depositing to AegisUSDC Custom Vault');
      const aegisResult = await depositToYieldVault({
        walletId,
        walletAddress,
        amount: aegisAmount,
        idempotencyKey: deriveUUID(idempotencyKey, 'aegis'),
      });
      results.aegisVaultTx = aegisResult.txHash;
    } catch (err) {
      logger.error({ err }, 'AegisUSDC deposit failed during multi yield aggregation');
      throw new AppError(
        502,
        `AegisUSDC vault deposit failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'AEGIS_VAULT_DEPOSIT_FAILED',
      );
    }
  }

  if (Number(synthraAmount) > 0) {
    try {
      logger.info({ synthraAmount }, 'Depositing to Synthra V3 Concentrated Liquidity via SDK');

      const synthraResult = await depositToSynthraV3({
        walletId,
        walletAddress,
        amountUsdc: synthraAmount,
        idempotencyKey: deriveUUID(idempotencyKey, 'synthra'),
      });
      results.synthraVaultTx = synthraResult.txHash;
    } catch (err) {
      logger.error({ err }, 'Synthra V3 deposit failed during multi yield aggregation');
      throw new AppError(
        502,
        `Synthra V3 deposit failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'SYNTHRA_V3_DEPOSIT_FAILED',
      );
    }
  }

  return {
    status: 'SUCCESS' as const,
    strategy: `${aegisWeight}-${synthraWeight}-DIVERSIFIED`,
    amounts: {
      aegisVault: aegisAmount,
      synthraVault: synthraAmount,
    },
    transactions: results,
  };
}

async function depositToSynthraV3(input: {
  walletId: string;
  walletAddress: string;
  amountUsdc: string;
  idempotencyKey: string;
}) {
  const { walletId, walletAddress, amountUsdc, idempotencyKey } = input;

  const nftManagerAddress = config.SYNTHRA_NFT_POSITION_MANAGER_ADDRESS;
  const secondTokenAddress = config.SYNTHRA_PAIRED_TOKEN_ADDRESS;
  const secondTokenDecimals = config.SYNTHRA_PAIRED_TOKEN_DECIMALS;
  const secondTokenSymbol = config.SYNTHRA_PAIRED_TOKEN_SYMBOL;

  const usdcToken = new Token(ARC_CHAIN_ID, USDC_ADDRESS, 6, 'USDC', 'USD Coin');
  const pairedToken = new Token(ARC_CHAIN_ID, secondTokenAddress, secondTokenDecimals, secondTokenSymbol);

  const client = await getPublicClient();
  const amountRaw = parseUnits(amountUsdc, 6);

  const fee = FeeAmount.MEDIUM;
  const tickSpacing = TICK_SPACINGS[fee];

  const tickLower = nearestUsableTick(tickSpacing, tickSpacing);
  const tickUpper = nearestUsableTick(tickSpacing * 10, tickSpacing);

  const sqrtRatioX96 = (JSBI as any).default?.BigInt?.('79228162514264337593543950336')
    ?? (JSBI as any).BigInt('79228162514264337593543950336');
  const dummyPool = new Pool(
    usdcToken,
    pairedToken,
    fee,
    sqrtRatioX96,
    (JSBI as any).default?.BigInt?.('0') ?? (JSBI as any).BigInt('0'),
    0,
  );

  Position.fromAmounts({
    pool: dummyPool,
    tickLower,
    tickUpper,
    amount0: amountRaw.toString(),
    amount1: 0,
    useFullPrecision: false,
  });

  const deadline = Math.floor(Date.now() / 1000) + 1200;
  
  const mintParams = [
    USDC_ADDRESS,
    secondTokenAddress,
    fee,
    tickLower,
    tickUpper,
    amountRaw.toString(),
    '0',
    '0',
    '0',
    walletAddress,
    deadline.toString()
  ];

  const currentAllowance = await client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [walletAddress as `0x${string}`, nftManagerAddress as `0x${string}`],
  });

  if (currentAllowance < amountRaw) {
    logger.info({ walletAddress, nftManagerAddress }, 'Approving USDC for Synthra V3 NonfungiblePositionManager');
    const approveTxInfo = await executeContractCall({
      walletId,
      contractAddress: USDC_ADDRESS,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [nftManagerAddress, amountRaw.toString()],
      idempotencyKey: deriveUUID(idempotencyKey, 'approve'),
    });
    await waitForDcwTransaction(approveTxInfo.id);
    logger.info('USDC approval for Synthra V3 confirmed');
  }

  logger.info('Executing Synthra V3 mint via Circle DCW natively');
  const mintTxInfo = await executeContractCall({
    walletId,
    contractAddress: nftManagerAddress,
    abiFunctionSignature: 'mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))',
    abiParameters: [mintParams],
    idempotencyKey: deriveUUID(idempotencyKey, 'mint'),
  });

  const mintTx = await waitForDcwTransaction(mintTxInfo.id);
  logger.info({ txHash: mintTx?.txHash }, 'Synthra V3 liquidity position minted successfully');

  return {
    action: 'SYNTHRA_V3_DEPOSIT',
    nftManagerAddress,
    amount: amountUsdc,
    txId: mintTx?.id,
    txHash: mintTx?.txHash,
    status: mintTx?.state ?? 'COMPLETE',
  };
}

export async function withdrawFromSynthraV3(input: {
  walletId: string;
  walletAddress: string;
  tokenId?: string;
  idempotencyKey: string;
}) {
  const { walletId, walletAddress, idempotencyKey } = input;
  let tokenId = input.tokenId;

  const nftManagerAddress = config.SYNTHRA_NFT_POSITION_MANAGER_ADDRESS;

  const client = await getPublicClient();

  if (!tokenId) {
    logger.info({ walletAddress }, 'Fetching Synthra V3 Position NFT ID for wallet');
    try {
      const balance = await client.readContract({
        address: nftManagerAddress as `0x${string}`,
        abi: [{
          "inputs": [{"internalType": "address","name": "owner","type": "address"}],
          "name": "balanceOf",
          "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        }],
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`],
      });
      
      if (balance === BigInt(0)) {
        throw new Error('No Synthra V3 liquidity positions found for this wallet');
      }

      const balanceNum = Number(balance.toString());
      const id = await client.readContract({
        address: nftManagerAddress as `0x${string}`,
        abi: [{
          "inputs": [{"internalType": "address","name": "owner","type": "address"},{"internalType": "uint256","name": "index","type": "uint256"}],
          "name": "tokenOfOwnerByIndex",
          "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        }],
        functionName: 'tokenOfOwnerByIndex',
        args: [walletAddress as `0x${string}`, BigInt(balanceNum - 1)],
      });
      tokenId = id.toString();
    } catch (err: any) {
      logger.error({ err }, 'Failed to fetch Synthra V3 token ID');
      throw new AppError(
        502,
        `Failed to fetch Synthra V3 position token ID: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'SYNTHRA_POSITION_LOOKUP_FAILED',
      );
    }
  }

  logger.info({ tokenId }, 'Fetching exact liquidity for Synthra V3 position');
  let currentLiquidity: string = '0';
  try {
    const positionData = await client.readContract({
      address: nftManagerAddress as `0x${string}`,
      abi: [{
        "inputs": [{"internalType": "uint256","name": "tokenId","type": "uint256"}],
        "name": "positions",
        "outputs": [
          {"internalType": "uint96","name": "nonce","type": "uint96"},
          {"internalType": "address","name": "operator","type": "address"},
          {"internalType": "address","name": "token0","type": "address"},
          {"internalType": "address","name": "token1","type": "address"},
          {"internalType": "uint24","name": "fee","type": "uint24"},
          {"internalType": "int24","name": "tickLower","type": "int24"},
          {"internalType": "int24","name": "tickUpper","type": "int24"},
          {"internalType": "uint128","name": "liquidity","type": "uint128"},
          {"internalType": "uint256","name": "feeGrowthInside0LastX128","type": "uint256"},
          {"internalType": "uint256","name": "feeGrowthInside1LastX128","type": "uint256"},
          {"internalType": "uint128","name": "tokensOwed0","type": "uint128"},
          {"internalType": "uint128","name": "tokensOwed1","type": "uint128"}
        ],
        "stateMutability": "view",
        "type": "function"
      }],
      functionName: 'positions',
      args: [BigInt(tokenId)],
    }) as any;
    
    currentLiquidity = positionData[7].toString();
    logger.info({ currentLiquidity }, 'Successfully retrieved position liquidity');
  } catch (err) {
    logger.error({ err }, 'Failed to fetch position liquidity');
    throw new AppError(
      502,
      `Failed to fetch Synthra V3 position liquidity: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'SYNTHRA_POSITION_LIQUIDITY_FAILED',
    );
  }

  if (currentLiquidity === '0') {
    logger.info({ tokenId }, 'Position already has 0 liquidity. Skipping onchain decrease transaction.');
    return {
      action: 'SYNTHRA_V3_WITHDRAW_SKIPPED',
      nftManagerAddress,
      tokenId,
      txId: null,
      txHash: null,
      status: 'COMPLETE',
    };
  }

  logger.info({ tokenId }, 'Executing Synthra V3 decreaseLiquidity via Circle DCW');
  const deadline = Math.floor(Date.now() / 1000) + 1200;
  
  const decreaseParams = [
    tokenId,
    currentLiquidity, 
    '0',
    '0',
    deadline.toString()
  ];

  const decreaseTxInfo = await executeContractCall({
    walletId,
    contractAddress: nftManagerAddress,
    abiFunctionSignature: 'decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))',
    abiParameters: [decreaseParams],
    idempotencyKey: deriveUUID(idempotencyKey, 'decrease'),
  });

  await waitForDcwTransaction(decreaseTxInfo.id);

  logger.info({ tokenId }, 'Executing Synthra V3 collect via Circle DCW');
  
  const collectParams = [
    tokenId,
    walletAddress,
    '340282366920938463463374607431768211455',
    '340282366920938463463374607431768211455'
  ];

  const collectTxInfo = await executeContractCall({
    walletId,
    contractAddress: nftManagerAddress,
    abiFunctionSignature: 'collect((uint256,address,uint128,uint128))',
    abiParameters: [collectParams],
    idempotencyKey: deriveUUID(idempotencyKey, 'collect'),
  });

  const collectTx = await waitForDcwTransaction(collectTxInfo.id);

  logger.info({ txHash: collectTx?.txHash }, 'Synthra V3 liquidity successfully harvested');

  return {
    action: 'SYNTHRA_V3_WITHDRAW',
    nftManagerAddress,
    tokenId,
    txId: collectTx?.id,
    txHash: collectTx?.txHash,
    status: collectTx?.state ?? 'COMPLETE',
  };
}
