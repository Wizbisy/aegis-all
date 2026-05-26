import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().max(65535),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  DATABASE_URL: z.string().min(1),
  ARC_RPC_URL: z.string().url().optional(),
  ARC_TESTNET_RPC_URL: z.string().url().optional(),
  ARC_CHAIN: z.enum(['ARC-TESTNET']),
  ALCHEMY_API_KEY: z.string().optional(),
  AEGIS_VAULT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  SYNTHRA_NFT_POSITION_MANAGER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  SYNTHRA_PAIRED_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  SYNTHRA_PAIRED_TOKEN_DECIMALS: z.coerce.number().int().positive(),
  SYNTHRA_PAIRED_TOKEN_SYMBOL: z.string().min(1),
  SYNTHRA_ORDER_ROUTER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  SYNTHRA_LIQUIDITY_ROUTER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  SYNTHRA_VAULT_HANDLER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  USDC_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default('0x3600000000000000000000000000000000000000'),
  CIRCLE_API_KEY: z.string().default(''),
  CIRCLE_DISCOVERY_API_URL: z.string().url(),
  ENTITY_SECRET: z.string().min(32),
  CIRCLE_USDC_TOKEN_ID: z.string().uuid(),
  CIRCLE_WEBHOOK_SECRET: z.union([z.literal(''), z.string().min(16)]).default(''),
  KIT_KEY: z.string().default(''),
  TRUST_PROXY_HEADERS: z.preprocess((value) => {
    if (value === true || value === false) {
      return value;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return value;
  }, z.boolean().default(false)),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  REQUEST_BODY_MAX_BYTES: z.coerce.number().int().positive().max(10 * 1024 * 1024).default(1_048_576),
  RESEND_API_KEY: z.string().default(''),
  RESEND_API_URL: z.string().url(),
  RESEND_FROM_EMAIL: z.string()
    .regex(/^.*<.+@.+>$/, 'Invalid "Name <email@domain.com>" format')
    .or(z.string().email())
    .default(''),
  ADMIN_API_KEY: z.union([
    z.literal(''),
    z.string().min(24, 'ADMIN_API_KEY must be a high-entropy secret'),
  ]).default(''),
  AUTH_EXEMPT_PATHS: z.string().min(1, 'AUTH_EXEMPT_PATHS must be defined in the environment'),
}).superRefine((value, ctx) => {
  if (!value.ARC_RPC_URL && !value.ARC_TESTNET_RPC_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Set ARC_RPC_URL or ARC_TESTNET_RPC_URL',
      path: ['ARC_RPC_URL'],
    });
  }
});

export const config = envSchema.parse(process.env);

export async function resolveArcRpcUrl(): Promise<string> {
  return config.ARC_RPC_URL ?? config.ARC_TESTNET_RPC_URL!;
}

export function getCorsAllowedOrigins() {
  if (!config.CORS_ALLOWED_ORIGINS.trim()) {
    return [];
  }

  const origins = config.CORS_ALLOWED_ORIGINS
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (isProduction() && origins.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS must list explicit origins in production; "*" is not allowed');
  }

  return origins;
}

export function shouldTrustProxyHeaders() {
  return config.TRUST_PROXY_HEADERS;
}

export function getAuthExemptPaths(): string[] {
  return config.AUTH_EXEMPT_PATHS
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function isProduction() {
  return config.NODE_ENV === 'production';
}

