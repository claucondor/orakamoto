import {
  callReadOnlyFunction,
  cvToValue,
  uintCV,
  stringUtf8CV,
  principalCV,
  ClarityType,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { CONTRACTS, NETWORK_CONFIG } from './constants';

const network = new StacksTestnet();

// Types for contract responses
export interface Market {
  marketId: number;
  creator: string;
  question: string;
  deadline: number;
  resolutionDeadline: number;
  yesReserve: bigint;
  noReserve: bigint;
  totalLiquidity: bigint;
  accumulatedFees: bigint;
  isResolved: boolean;
  winningOutcome: number | null;
  resolutionBlock: number;
  createdAt: number;
  liquidityParameter: bigint;
}

export interface MarketPrices {
  yesPrice: number;
  noPrice: number;
  totalLiquidity: bigint;
}

export interface UserPosition {
  marketId: number;
  yesBalance: bigint;
  noBalance: bigint;
  lpBalance: bigint;
}

// Helper to parse Clarity values
function parseMarket(data: any, marketId: number): Market {
  return {
    marketId,
    creator: data.creator.value,
    question: data.question.value,
    deadline: Number(data.deadline.value),
    resolutionDeadline: Number(data['resolution-deadline'].value),
    yesReserve: BigInt(data['yes-reserve'].value),
    noReserve: BigInt(data['no-reserve'].value),
    totalLiquidity: BigInt(data['total-liquidity'].value),
    accumulatedFees: BigInt(data['accumulated-fees'].value),
    isResolved: data['is-resolved'].value,
    winningOutcome: data['winning-outcome'].type === ClarityType.OptionalSome
      ? Number(data['winning-outcome'].value.value)
      : null,
    resolutionBlock: Number(data['resolution-block'].value),
    createdAt: Number(data['created-at'].value),
    liquidityParameter: BigInt(data['liquidity-parameter'].value),
  };
}

// Get market count
export async function getMarketCount(): Promise<number> {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.DEPLOYER,
      contractName: CONTRACTS.MULTI_MARKET_POOL,
      functionName: 'get-market-count',
      functionArgs: [],
      senderAddress: CONTRACTS.DEPLOYER,
    });
    const value = cvToValue(result);
    return value.value ? Number(value.value) : 0;
  } catch (error) {
    console.error('Error getting market count:', error);
    return 0;
  }
}

// Get market by ID
export async function getMarket(marketId: number): Promise<Market | null> {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.DEPLOYER,
      contractName: CONTRACTS.MULTI_MARKET_POOL,
      functionName: 'get-market',
      functionArgs: [uintCV(marketId)],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    if (value.type === 'err' || !value.value) {
      return null;
    }

    return parseMarket(value.value, marketId);
  } catch (error) {
    console.error('Error getting market:', error);
    return null;
  }
}

// Get market prices
export async function getMarketPrices(marketId: number): Promise<MarketPrices | null> {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.DEPLOYER,
      contractName: CONTRACTS.MULTI_MARKET_POOL,
      functionName: 'get-prices',
      functionArgs: [uintCV(marketId)],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    if (value.type === 'err' || !value.value) {
      return null;
    }

    return {
      yesPrice: Number(value.value['yes-price'].value),
      noPrice: Number(value.value['no-price'].value),
      totalLiquidity: BigInt(value.value['total-liquidity'].value),
    };
  } catch (error) {
    console.error('Error getting market prices:', error);
    return null;
  }
}

// Get all markets (paginated)
export async function getAllMarkets(): Promise<Market[]> {
  const count = await getMarketCount();
  const markets: Market[] = [];

  // Fetch markets in parallel (batches of 5)
  const batchSize = 5;
  for (let i = 1; i <= count; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, count + 1); j++) {
      batch.push(getMarket(j));
    }
    const results = await Promise.all(batch);
    markets.push(...results.filter((m): m is Market => m !== null));
  }

  return markets;
}

// Get user's outcome balance
export async function getOutcomeBalance(
  marketId: number,
  owner: string,
  outcome: number
): Promise<bigint> {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.DEPLOYER,
      contractName: CONTRACTS.MULTI_MARKET_POOL,
      functionName: 'get-outcome-balance',
      functionArgs: [uintCV(marketId), principalCV(owner), uintCV(outcome)],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    return BigInt(value.value || 0);
  } catch (error) {
    console.error('Error getting outcome balance:', error);
    return BigInt(0);
  }
}

// Get user's LP balance
export async function getLPBalance(marketId: number, owner: string): Promise<bigint> {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.DEPLOYER,
      contractName: CONTRACTS.LP_TOKEN,
      functionName: 'get-balance',
      functionArgs: [uintCV(marketId), principalCV(owner)],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    return BigInt(value.value || 0);
  } catch (error) {
    console.error('Error getting LP balance:', error);
    return BigInt(0);
  }
}

// Get user positions for a market
export async function getUserPosition(marketId: number, owner: string): Promise<UserPosition> {
  const [yesBalance, noBalance, lpBalance] = await Promise.all([
    getOutcomeBalance(marketId, owner, 0),
    getOutcomeBalance(marketId, owner, 1),
    getLPBalance(marketId, owner),
  ]);

  return {
    marketId,
    yesBalance,
    noBalance,
    lpBalance,
  };
}

// Get USDCx balance
export async function getUSDCxBalance(address: string): Promise<bigint> {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.USDCX_DEPLOYER,
      contractName: CONTRACTS.USDCX,
      functionName: 'get-balance',
      functionArgs: [principalCV(address)],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    return BigInt(value.value || 0);
  } catch (error) {
    console.error('Error getting USDCx balance:', error);
    return BigInt(0);
  }
}

// Get faucet remaining allowance
export async function getFaucetRemaining(address: string): Promise<bigint> {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.USDCX_DEPLOYER,
      contractName: CONTRACTS.USDCX,
      functionName: 'get-faucet-remaining',
      functionArgs: [principalCV(address)],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    return BigInt(value.value || 0);
  } catch (error) {
    console.error('Error getting faucet remaining:', error);
    return BigInt(0);
  }
}

// Calculate tokens out for a trade
export async function calculateTokensOut(
  marketId: number,
  amountIn: bigint,
  buyYes: boolean
): Promise<bigint> {
  try {
    const market = await getMarket(marketId);
    if (!market) return BigInt(0);

    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.DEPLOYER,
      contractName: CONTRACTS.MULTI_MARKET_POOL,
      functionName: 'calculate-tokens-out-pmamm',
      functionArgs: [
        uintCV(Number(amountIn)),
        uintCV(Number(market.yesReserve)),
        uintCV(Number(market.noReserve)),
        uintCV(Number(market.liquidityParameter)),
        buyYes ? uintCV(1) : uintCV(0),
      ],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    return BigInt(value || 0);
  } catch (error) {
    console.error('Error calculating tokens out:', error);
    return BigInt(0);
  }
}

// Get current block height
export async function getCurrentBlockHeight(): Promise<number> {
  try {
    const response = await fetch(`${NETWORK_CONFIG.TESTNET_API}/v2/info`);
    const data = await response.json();
    return data.stacks_tip_height;
  } catch (error) {
    console.error('Error getting block height:', error);
    return 0;
  }
}

// Check if market is active
export async function isMarketActive(marketId: number): Promise<boolean> {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.DEPLOYER,
      contractName: CONTRACTS.MULTI_MARKET_POOL,
      functionName: 'is-market-active',
      functionArgs: [uintCV(marketId)],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    return value.value === true;
  } catch (error) {
    console.error('Error checking market active:', error);
    return false;
  }
}

// Get claim status
export async function getClaimStatus(marketId: number, owner: string) {
  try {
    const result = await callReadOnlyFunction({
      network,
      contractAddress: CONTRACTS.DEPLOYER,
      contractName: CONTRACTS.MULTI_MARKET_POOL,
      functionName: 'get-claim-status',
      functionArgs: [uintCV(marketId), principalCV(owner)],
      senderAddress: CONTRACTS.DEPLOYER,
    });

    const value = cvToValue(result, true);
    if (!value.value) return null;

    return {
      isResolved: value.value['is-resolved'].value,
      resolutionBlock: Number(value.value['resolution-block'].value),
      disputeWindowEnds: Number(value.value['dispute-window-ends'].value),
      claimsEnabled: value.value['claims-enabled'].value,
      hasClaimed: value.value['has-claimed'].value,
      winningOutcome: value.value['winning-outcome'].type === ClarityType.OptionalSome
        ? Number(value.value['winning-outcome'].value.value)
        : null,
    };
  } catch (error) {
    console.error('Error getting claim status:', error);
    return null;
  }
}
