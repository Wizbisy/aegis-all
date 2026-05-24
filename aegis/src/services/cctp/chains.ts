import { AppError } from '../../utils/errors.js';

/**
 * Maps user-facing chain identifiers to Bridge Kit chain names.
 * Bridge Kit uses string chain names, not numeric chain IDs.
 */
const CHAIN_MAP: Record<string, string> = {
  // Testnets
  'ARC-TESTNET': 'Arc_Testnet',
  'ARC_TESTNET': 'Arc_Testnet',
  'BASE-SEPOLIA': 'Base_Sepolia',
  'BASE_SEPOLIA': 'Base_Sepolia',
  'ETH-SEPOLIA': 'Ethereum_Sepolia',
  'ETH_SEPOLIA': 'Ethereum_Sepolia',
  'ARB-SEPOLIA': 'Arbitrum_Sepolia',
  'ARB_SEPOLIA': 'Arbitrum_Sepolia',
  'OP-SEPOLIA': 'Optimism_Sepolia',
  'OP_SEPOLIA': 'Optimism_Sepolia',
  'POLYGON-AMOY': 'Polygon_Amoy',
  'POLYGON_AMOY': 'Polygon_Amoy',
  'AVAX-FUJI': 'Avalanche_Fuji',
  'AVAX_FUJI': 'Avalanche_Fuji',

  // Mainnets disabled (Aegis operates exclusively on Arc Testnet)
};

/**
 * Resolves a user provided chain identifier to a Bridge Kit chain name.
 * Case insensitive matching.
 */
export function resolveBridgeChain(userChain: string): string {
  const normalised = userChain.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const resolved = CHAIN_MAP[normalised];
  if (!resolved) {
    const supported = [...new Set(Object.values(CHAIN_MAP))].sort().join(', ');
    throw new AppError(
      400,
      `Unsupported bridge chain "${userChain}". Supported chains: ${supported}`,
      'BRIDGE_UNSUPPORTED_CHAIN',
    );
  }
  return resolved;
}

export function listSupportedChains(): string[] {
  return [...new Set(Object.values(CHAIN_MAP))].sort();
}

/**
 * Returns a rough fee estimate in USDC for a given bridge route.
 * These are baseline estimates: actual fees come from the Bridge Kit at runtime.
 */
export function estimateBridgeFee(fromChain: string, toChain: string): { estimatedFeeUsdc: string; note: string } {
  return {
    estimatedFeeUsdc: '0.10',
    note: `Estimated fee for ${fromChain} → ${toChain}. Actual fee determined by Bridge Kit at runtime and includes gas + attestation costs. Fast mode (~8-20s) is the default.`,
  };
}
