import { AppError } from './errors.js';
import { config } from '../config.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, type Dispatcher } from 'undici';
import { z } from 'zod';

export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid EVM address');

const MAX_USDC = 1_000_000;
const USDC_DECIMALS = 6;

export const usdcAmountSchema = z.string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, 'Amount must be a positive USDC decimal with up to 6 decimals')
  .refine((value) => Number(value) > 0, 'Amount must be greater than 0')
  .refine((value) => Number(value) <= MAX_USDC, 'Amount exceeds maximum supported value');

export const idSchema = z.string().min(1).max(512);

export function toUsdcNumber(amount: string) {
  const [wholePart = '0', fractionalPart = ''] = amount.split('.');
  const normalizedFraction = fractionalPart.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);
  return Number(`${wholePart}.${normalizedFraction}`);
}

function isPrivateIpv4(host: string) {
  const octets = host.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = octets as [number, number];
  if (a === 0) return true;
  if (a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized === '0:0:0:0:0:0:0:0' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized.startsWith('fe80::')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return mapped === '0.0.0.0' || isPrivateIpv4(mapped);
  }
  return false;
}

function isDisallowedServiceHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === '0.0.0.0') return true;
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) === 6) return isPrivateIpv6(normalized);
  if (!normalized.includes('.')) return true;
  if (normalized.endsWith('.local') || normalized.endsWith('.internal') || normalized.endsWith('.lan') || normalized.endsWith('.home')) return true;
  if (isDisallowedIpLiteral(normalized)) return true;
  return false;
}

function isDisallowedIpLiteral(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === '0.0.0.0') return true;
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) === 6) return isPrivateIpv6(normalized);
  return false;
}

export async function assertAllowedServiceUrl(value: string) {
  const parsed = new URL(value);

  if (config.NODE_ENV !== 'production') {
    return {
      url: parsed,
      pinnedIp: null,
      allResolvedAddresses: [] as Array<{ address: string; family: number }>,
    };
  }

  if (isDisallowedServiceHost(parsed.hostname)) {
    throw new AppError(400, 'Service URL host is not allowed', 'SERVICE_URL_HOST_BLOCKED');
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(parsed.hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError(400, 'Service URL host could not be resolved', 'SERVICE_URL_UNRESOLVABLE');
  }

  if (resolved.length === 0) {
    throw new AppError(400, 'Service URL host could not be resolved', 'SERVICE_URL_UNRESOLVABLE');
  }

  for (const record of resolved) {
    if (record.family === 4 && isPrivateIpv4(record.address)) {
      throw new AppError(400, 'Service URL resolves to a private IPv4 address', 'SERVICE_URL_PRIVATE_IPV4');
    }
    if (record.family === 6 && isPrivateIpv6(record.address)) {
      throw new AppError(400, 'Service URL resolves to a private IPv6 address', 'SERVICE_URL_PRIVATE_IPV6');
    }
  }

  return {
    url: parsed,
    pinnedIp: resolved[0]!.address,
    allResolvedAddresses: resolved,
  };
}

export function createPinnedServiceDispatcher(pinnedIp: string): Dispatcher {
  return new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, [{ address: pinnedIp, family: isIP(pinnedIp) === 6 ? 6 : 4 }]);
      },
    },
  });
}

export const serviceUrlSchema = z.string()
  .trim()
  .max(2048, 'Service URL is too long')
  .url('Service URL must be a valid URL')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      if (config.NODE_ENV !== 'production') {
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      }

      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Service URL must use HTTPS')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }, 'Service URL must not include embedded credentials')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return !parsed.hash;
    } catch {
      return false;
    }
  }, 'Service URL must not include fragments')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      if (config.NODE_ENV !== 'production') {
        return true;
      }

      return !isDisallowedServiceHost(parsed.hostname);
    } catch {
      return false;
    }
  }, 'Service URL host is not allowed');

const blockedHeaderNames = new Set([
  'authorization',
  'cookie',
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

export const outboundHeaderSchema = z.string()
  .max(1152, 'Header line is too long')
  .regex(/^([A-Za-z0-9-]{1,64}):[ \t]*([^\r\n]{1,1024})$/, 'Header must follow "Name: Value" format')
  .refine((header) => {
    const [name] = header.split(':', 1);
    return !!name && !blockedHeaderNames.has(name.trim().toLowerCase());
  }, 'Header name is not allowed');

export const swapSchema = z.object({
  tokenIn: z.enum(['USDC', 'EURC', 'cirBTC']),
  tokenOut: z.enum(['USDC', 'EURC', 'cirBTC']),
  amount: z.string()
    .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, 'Amount must be a positive decimal with up to 6 decimals')
    .refine((value) => Number(value) > 0, 'Amount must be greater than 0')
    .refine((value) => Number(value) <= MAX_USDC, 'Amount exceeds maximum supported value'),
  slippageBps: z.number().int().nonnegative().max(500).optional(),
});

export const swapEstimateSchema = z.object({
  tokenIn: z.enum(['USDC', 'EURC', 'cirBTC']),
  tokenOut: z.enum(['USDC', 'EURC', 'cirBTC']),
  amount: z.string()
    .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, 'Amount must be a positive decimal with up to 6 decimals')
    .refine((value) => Number(value) > 0, 'Amount must be greater than 0')
    .refine((value) => Number(value) <= MAX_USDC, 'Amount exceeds maximum supported value'),
});

