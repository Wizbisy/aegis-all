import type { HttpBindings } from '@hono/node-server';

export interface AgentContext {
  id: string;
  email: string;
  walletId?: string | null;
  walletAddress?: string | null;
}

export type AppBindings = {
  Bindings: HttpBindings;
  Variables: {
    agent: AgentContext;
    validatedBody: unknown;
    idempotencyRecordId: string;
    idempotencyKeyHash: string;
    requestId: string;
  };
};

export interface PolicyLimits {
  daily?: string;
  weekly?: string;
  monthly?: string;
  perTx?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface MarketplaceSearchOptions {
  keyword?: string;
  category?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface MarketplaceInspectOptions {
  serviceUrl: string;
  method?: HttpMethod;
  data?: unknown;
  headers?: string[];
}

export interface MarketplacePayOptions extends MarketplaceInspectOptions {
  walletAddress: string;
  maxAmount: string;
  estimate?: boolean;
}

export interface BridgeQuoteInput {
  toChain: string;
  fromChain?: string;
}

export interface BridgeTransferInput extends BridgeQuoteInput {
  walletAddress: string;
  amount: string;
  recipient?: string;
  idempotencyKey?: string;
}

export interface BridgeStatusInput {
  txHash: string;
  chain?: string;
}

export interface YieldVault {
  id: string;
  name: string;
  chain: string;
  contractAddress: string;
  asset: 'USDC';
  enabled: boolean;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface YieldPosition {
  vaultId: string;
  agentId: string;
  amountUsdc: string;
  status: 'ACTIVE' | 'WITHDRAWN';
}

export type SupportedSwapToken = 'USDC' | 'EURC' | 'cirBTC';

export interface SwapInput {
  agentId: string;
  tokenIn: SupportedSwapToken;
  tokenOut: SupportedSwapToken;
  amountIn: string;
  slippageBps?: number;
  idempotencyKey?: string;
}

export interface SwapQuoteResult {
  tokenIn: SupportedSwapToken;
  tokenOut: SupportedSwapToken;
  amountIn: string;
  estimatedOutput: string;
  fees: Array<{
    type: string;
    amount: string;
    token: string;
  }>;
}

export interface SwapExecutionResult {
  status: 'SUCCESS' | 'FAILED';
  txHash: string;
  amountIn: string;
  amountOut: string;
  explorerUrl: string;
}


