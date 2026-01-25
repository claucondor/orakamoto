// Contract addresses - Update these for different networks
export const CONTRACTS = {
  // Deployer address on testnet
  DEPLOYER: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC',

  // USDCx deployer (different from our deployer)
  USDCX_DEPLOYER: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',

  // Contract names
  // V3 uses pm-amm-core-v2, exponential fees (3% → 20%), and dynamic liquidity
  MULTI_MARKET_POOL: 'multi-market-pool-v3',
  // @deprecated - Use multi-market-pool-v3 instead
  MULTI_MARKET_POOL_V2: 'multi-market-pool-v2',
  // @deprecated - Use multi-market-pool-v3 instead (block-height bug in Nakamoto)
  MULTI_MARKET_POOL_V1: 'multi-market-pool',
  USDCX: 'usdcx',
  LP_TOKEN: 'sip013-lp-token',

  // Full contract identifiers
  get POOL_CONTRACT() {
    return `${this.DEPLOYER}.${this.MULTI_MARKET_POOL}`;
  },
  get POOL_CONTRACT_V1() {
    return `${this.DEPLOYER}.${this.MULTI_MARKET_POOL_V1}`;
  },
  get USDCX_CONTRACT() {
    return `${this.USDCX_DEPLOYER}.${this.USDCX}`;
  },
  get LP_TOKEN_CONTRACT() {
    return `${this.DEPLOYER}.${this.LP_TOKEN}`;
  },
};

// Network configuration
export const NETWORK_CONFIG = {
  TESTNET_API: 'https://api.testnet.hiro.so',
  MAINNET_API: 'https://api.hiro.so',
  EXPLORER_TESTNET: 'https://explorer.hiro.so/txid',
  EXPLORER_MAINNET: 'https://explorer.hiro.so/txid',
};

// Token decimals
export const DECIMALS = {
  USDCX: 6,
  LP: 6,
};

// Format a number with the given decimals
export function formatTokenAmount(amount: bigint | number, decimals: number = DECIMALS.USDCX): string {
  const num = typeof amount === 'bigint' ? Number(amount) : amount;
  const divisor = Math.pow(10, decimals);
  return (num / divisor).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Parse a token amount to smallest unit
export function parseTokenAmount(amount: string | number, decimals: number = DECIMALS.USDCX): bigint {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const multiplier = Math.pow(10, decimals);
  return BigInt(Math.floor(num * multiplier));
}

// Format price as percentage (0-100)
export function formatPrice(price: number): string {
  // Price is in 6 decimals (1000000 = 100%)
  const percentage = (price / 10000).toFixed(1);
  return `${percentage}%`;
}

// Format address for display
export function formatAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Format block height to approximate time
export function blocksToTime(blocks: number): string {
  // Stacks with Nakamoto: ~10 seconds per block = 6 blocks per minute
  const minutes = Math.floor(blocks / 6);
  if (minutes < 1) return `~${blocks * 10} sec`;
  if (minutes < 60) return `~${minutes} min`;
  if (minutes < 1440) return `~${Math.floor(minutes / 60)} hours`;
  return `~${Math.floor(minutes / 1440)} days`;
}

// Calculate time until block
export function timeUntilBlock(targetBlock: number, currentBlock: number): string {
  const blocksRemaining = targetBlock - currentBlock;
  if (blocksRemaining <= 0) return 'Ended';
  return blocksToTime(blocksRemaining);
}
