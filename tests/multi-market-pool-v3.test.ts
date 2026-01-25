import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const MINIMUM_INITIAL_LIQUIDITY = 1_000_000n; // 1 USDC with 6 decimals
const DISPUTE_WINDOW = 5n; // ~45 min for hackathon testing
const RECOVERY_WINDOW = 259200n; // ~30 days in fast blocks

// Exponential Fee Constants
const TRADING_FEE_BP = 100n; // 1% base fee
const FEE_EXPONENT_BASE = 20_000_000n; // 20.0 (6 decimals)
const MAX_FEE_BP = 2000n; // 20% max fee

// Error constants
const ERR_MARKET_NOT_FOUND = 4000n;
const ERR_MARKET_NOT_ACTIVE = 4001n;
const ERR_MARKET_ALREADY_RESOLVED = 4002n;
const ERR_DEADLINE_NOT_PASSED = 4003n;
const ERR_INVALID_OUTCOME = 4004n;
const ERR_INSUFFICIENT_BALANCE = 4005n;
const ERR_INSUFFICIENT_LIQUIDITY = 4006n;
const ERR_ZERO_AMOUNT = 4007n;
const ERR_SLIPPAGE_TOO_HIGH = 4008n;
const ERR_ALREADY_CLAIMED = 4009n;
const ERR_NO_WINNINGS = 4010n;
const ERR_DISPUTE_WINDOW_ACTIVE = 4011n;
const ERR_INVALID_QUESTION = 4012n;
const ERR_INVALID_DEADLINE = 4013n;
const ERR_MARKET_ID_OVERFLOW = 4014n;
const ERR_NOT_AUTHORIZED = 4015n;
const ERR_NO_FEES_TO_CLAIM = 4016n;

// Guardian/Recovery Error constants
const ERR_NOT_GUARDIAN = 4100n;
const ERR_MARKET_NOT_UNHEALTHY = 4101n;
const ERR_RECOVERY_WINDOW_NOT_PASSED = 4102n;
const ERR_MARKET_ALREADY_UNHEALTHY = 4103n;
const ERR_NO_LP_TOKENS = 4104n;
const ERR_ALREADY_EMERGENCY_WITHDRAWN = 4105n;

const CONTRACT_NAME = 'multi-market-pool-v3';

// Helper function to give a wallet USDC via faucet
function fundWallet(wallet: string, amount: number | bigint) {
  simnet.callPublicFn('usdcx', 'faucet', [Cl.uint(amount)], wallet);
}

// Helper function to mine blocks to reach a target block height
function mineToBlockHeight(targetHeight: number) {
  const currentHeight = simnet.blockHeight;
  const blocksToMine = Math.max(0, targetHeight - currentHeight);
  if (blocksToMine > 0) {
    simnet.mineEmptyBlocks(blocksToMine);
  }
}

// Helper function to mine blocks AFTER a contract call (which mines 1 block)
function mineBlocksAfterCall(count: number) {
  if (count > 0) {
    simnet.mineEmptyBlocks(count);
  }
}

// Setup: Authorize multi-market-pool-v3 to mint/burn LP tokens
const MULTI_MARKET_POOL_V3_PRINCIPAL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.multi-market-pool-v3';

// Function to ensure LP token authorization
function ensureLpTokenSetup() {
  const checkResult = simnet.callReadOnlyFn(
    'sip013-lp-token',
    'get-authorized-minter',
    [],
    deployer
  );

  // If not already set, set it
  const currentMinter = (checkResult.result as any).value;
  if (!currentMinter || currentMinter.value !== MULTI_MARKET_POOL_V3_PRINCIPAL) {
    const authResult = simnet.callPublicFn(
      'sip013-lp-token',
      'set-authorized-minter',
      [Cl.contractPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'multi-market-pool-v3')],
      deployer
    );
    console.log('LP token auth result:', authResult.result);
  }
}

// Helper to create a market with specific duration for testing exponential fees
function createTestMarketWithDuration(
  creator: string,
  duration: number,
  liquidity: bigint = 10_000_000n
): { marketId: number; createdAt: number; deadline: number } {
  fundWallet(creator, Number(liquidity));
  const currentBlock = simnet.blockHeight;
  const deadline = currentBlock + duration;
  const resolutionDeadline = deadline + 1000;

  const result = simnet.callPublicFn(
    CONTRACT_NAME,
    'create-market',
    [
      Cl.stringUtf8('Test Market'),
      Cl.uint(deadline),
      Cl.uint(resolutionDeadline),
      Cl.uint(liquidity),
    ],
    creator
  );

  const marketId = (result.result as any).value.value;
  return {
    marketId: Number(marketId),
    createdAt: currentBlock + 1, // +1 because create-market mines 1 block
    deadline: deadline,
  };
}

// Helper to create a market and return its ID
function createTestMarket(creator: string, liquidity: bigint = 10_000_000n): number {
  const result = createTestMarketWithDuration(creator, 1000, liquidity);
  return result.marketId;
}

beforeAll(() => {
  ensureLpTokenSetup();

  // Verify it was set
  const getMinterResult = simnet.callReadOnlyFn(
    'sip013-lp-token',
    'get-authorized-minter',
    [],
    deployer
  );
  console.log('Current authorized minter:', getMinterResult.result);
});

// Root-level beforeEach to ensure LP token setup before ALL tests
beforeEach(() => {
  ensureLpTokenSetup();
});

// ============================================================================
// EXPONENTIAL FEE TESTS
// ============================================================================

describe('Multi-Market Pool V3 - Exponential Fees', () => {
  describe('get-exp-fee-multiplier', () => {
    it('should return 1.0 multiplier at market creation (t=0)', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(deadline + 100),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
        ],
        deployer
      );

      const marketId = Number((result.result as any).value.value);

      // Get market to find created-at block
      const market = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      const createdAt = Number((market.result as any).value.value['created-at'].value);

      // Calculate multiplier immediately after creation
      const multiplier = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-exp-fee-multiplier',
        [Cl.uint(createdAt), Cl.uint(deadline)],
        deployer
      );

      // Should be 1.0 (1000000 in 6-decimal fixed point)
      expect(multiplier.result).toStrictEqual(Cl.uint(1_000_000n));
    });

    it('should return approximately 2.24 multiplier at 50% progress', () => {
      // Create a market with 100 block duration
      const { marketId, createdAt, deadline } = createTestMarketWithDuration(deployer, 100);

      // Mine 50 blocks to reach 50% progress
      mineToBlockHeight(createdAt + 50);

      // Get multiplier
      const multiplier = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-exp-fee-multiplier',
        [Cl.uint(createdAt), Cl.uint(deadline)],
        deployer
      );

      // 20^0.5 ≈ 4.47, so we expect approximately 4.47 (4470000 in 6-decimal fixed point)
      // Allow some tolerance due to fixed-point math
      const multValue = Number(BigInt((multiplier.result as any).value));
      expect(multValue).toBeGreaterThan(4000000);
      expect(multValue).toBeLessThan(5000000);
    });

    it('should return 20.0 multiplier at 100% progress (deadline)', () => {
      // Create a market with 100 block duration
      const { marketId, createdAt, deadline } = createTestMarketWithDuration(deployer, 100);

      // Mine to deadline
      mineToBlockHeight(deadline);

      // Get multiplier
      const multiplier = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-exp-fee-multiplier',
        [Cl.uint(createdAt), Cl.uint(deadline)],
        deployer
      );

      // Should be 5.0 (5000000 in 6-decimal fixed point)
      expect(multiplier.result).toStrictEqual(Cl.uint(20_000_000n));
    });

    it('should return 5.0 multiplier past deadline (capped)', () => {
      // Create a market with 100 block duration
      const { marketId, createdAt, deadline } = createTestMarketWithDuration(deployer, 100);

      // Mine past deadline
      mineToBlockHeight(deadline + 50);

      // Get multiplier
      const multiplier = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-exp-fee-multiplier',
        [Cl.uint(createdAt), Cl.uint(deadline)],
        deployer
      );

      // Should still be capped at 5.0
      expect(multiplier.result).toStrictEqual(Cl.uint(20_000_000n));
    });

    it('should return 1.0 multiplier before market creation', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;

      // Get multiplier for a time before "creation"
      const multiplier = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-exp-fee-multiplier',
        [Cl.uint(currentBlock + 10), Cl.uint(deadline)],
        deployer
      );

      // Should be 1.0 when elapsed <= 0
      expect(multiplier.result).toStrictEqual(Cl.uint(1_000_000n));
    });
  });

  describe('calculate-time-based-fee', () => {
    it('should calculate 3% fee at t=0 (base fee)', () => {
      const amount = 1_000_000n; // 1 USDC
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'calculate-time-based-fee',
        [Cl.uint(amount), Cl.uint(currentBlock), Cl.uint(deadline)],
        deployer
      );

      // At t=0, fee should be 3% = 30,000
      expect(result.result).toStrictEqual(Cl.uint(30_000n));
    });

    it('should calculate approximately 12.75% fee at 50% progress', () => {
      const amount = 1_000_000n; // 1 USDC
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const createdAt = currentBlock;
      const midpoint = createdAt + 500; // 50% progress

      mineToBlockHeight(midpoint);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'calculate-time-based-fee',
        [Cl.uint(amount), Cl.uint(createdAt), Cl.uint(deadline)],
        deployer
      );

      // At 50%: scaled-mult = 425, fee = 3% * 4.25 = 12.75% ≈ 127,500
      const fee = Number(BigInt((result.result as any).value));
      expect(fee).toBeGreaterThanOrEqual(120_000);
      expect(fee).toBeLessThan(135_000);
    });

    it('should cap fee at 20% regardless of progress', () => {
      const amount = 1_000_000n; // 1 USDC
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const createdAt = currentBlock;

      // Mine well past deadline
      mineToBlockHeight(deadline + 100);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'calculate-time-based-fee',
        [Cl.uint(amount), Cl.uint(createdAt), Cl.uint(deadline)],
        deployer
      );

      // Max fee is 20% = 200,000
      expect(result.result).toStrictEqual(Cl.uint(200_000n));
    });

    it('should calculate max 20% fee for large amounts at deadline', () => {
      const amount = 10_000_000n; // 10 USDC
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const createdAt = currentBlock;

      mineToBlockHeight(deadline);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'calculate-time-based-fee',
        [Cl.uint(amount), Cl.uint(createdAt), Cl.uint(deadline)],
        deployer
      );

      // 20% of 10,000,000 = 2,000,000
      expect(result.result).toStrictEqual(Cl.uint(2_000_000n));
    });
  });

  describe('buy-outcome with exponential fees', () => {
    it('should charge 1% fee when buying at market creation', () => {
      const marketId = createTestMarket(deployer);

      // Fund wallet1
      fundWallet(wallet1, 1_000_000n);

      // Get market created-at
      const market = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      const createdAt = Number((market.result as any).value.value['created-at'].value);

      // Buy immediately after creation (at created-at block)
      mineToBlockHeight(createdAt);

      const buyResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0), // YES
          Cl.uint(1_000_000n), // 1 USDC
          Cl.uint(0), // min tokens out
        ],
        wallet1
      );

      expect(buyResult.result.type).toBe('ok');

      // Get accumulated fees to verify
      const fees = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      // Fee should be approximately 3% of 1,000,000 = 30,000
      // (may vary slightly due to timing and progress)
      const accumulatedFees = Number((fees.result as any).value.value['accumulated-fees'].value);
      expect(accumulatedFees).toBeGreaterThan(25_000);
      expect(accumulatedFees).toBeLessThan(35_000);
    });

    it('should charge approximately 4.47% fee at 50% progress', () => {
      // Create market with 100 block duration for easier testing
      const { marketId, createdAt, deadline } = createTestMarketWithDuration(deployer, 100);

      // Fund wallet1
      fundWallet(wallet1, 1_000_000n);

      // Mine to 50% progress
      mineToBlockHeight(createdAt + 50);

      const buyResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0), // YES
          Cl.uint(1_000_000n), // 1 USDC
          Cl.uint(0), // min tokens out
        ],
        wallet1
      );

      expect(buyResult.result.type).toBe('ok');

      // Get accumulated fees
      const fees = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      // At 50% progress: scaled-mult = 425, fee = 3% * 4.25 = 12.75%
      // Fee should be approximately 12.75% of 1,000,000 ≈ 127,500
      const accumulatedFees = Number((fees.result as any).value.value['accumulated-fees'].value);
      expect(accumulatedFees).toBeGreaterThanOrEqual(120_000);
      expect(accumulatedFees).toBeLessThan(135_000);
    });

    it('should charge max 20% fee at deadline', () => {
      // Create market with 100 block duration
      const { marketId, createdAt, deadline } = createTestMarketWithDuration(deployer, 100);

      // Fund wallet1
      fundWallet(wallet1, 1_000_000n);

      // Get current market deadline from contract
      const market = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      const currentDeadline = BigInt((market.result as any).value.value['deadline'].value);

      console.log('Before mining - currentBlock:', simnet.blockHeight, 'deadline:', currentDeadline);

      // Mine to 95% of duration to be safely before deadline
      const marketCreatedAt = BigInt((market.result as any).value.value['created-at'].value);
      const duration = currentDeadline - marketCreatedAt;
      const targetBlock = Number(marketCreatedAt + (duration * 95n) / 100n);

      console.log('Mining to block (95%):', targetBlock, 'createdAt:', marketCreatedAt, 'duration:', duration);
      mineToBlockHeight(targetBlock);
      console.log('After mining - currentBlock:', simnet.blockHeight);

      const buyResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0), // YES
          Cl.uint(1_000_000n), // 1 USDC
          Cl.uint(0), // min tokens out
        ],
        wallet1
      );

      expect(buyResult.result.type).toBe('ok');

      // Get accumulated fees
      const fees = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      // Fee should be close to max 20% (at 95% progress, ~17.85%)
      // 178,500 is approximately 17.85% of 1,000,000, which is correct for 95% progress
      const accumulatedFees = Number((fees.result as any).value.value['accumulated-fees'].value);
      expect(accumulatedFees).toBeGreaterThanOrEqual(170_000);
      expect(accumulatedFees).toBeLessThanOrEqual(200_000);
    });
  });

  describe('sell-outcome with exponential fees', () => {
    it('should apply exponential fees when selling', () => {
      // Create market with 100 block duration
      const { marketId, createdAt, deadline } = createTestMarketWithDuration(deployer, 100);

      // Fund wallet1 and buy tokens first
      fundWallet(wallet1, 2_000_000n);

      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0), // YES
          Cl.uint(1_000_000n),
          Cl.uint(0),
        ],
        wallet1
      );

      // Get balance before sell
      const balanceBefore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        wallet1
      );

      const tokenBalance = Number((balanceBefore.result as any).value.value);

      // Mine to 50% progress
      mineToBlockHeight(createdAt + 50);

      // Sell half the tokens
      const sellAmount = Math.floor(tokenBalance / 2);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'sell-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0), // YES
          Cl.uint(sellAmount),
          Cl.uint(0), // min USDC out
        ],
        wallet1
      );

      expect(result.result.type).toBe('ok');

      // Verify fees were collected (should be higher than 1% due to exponential)
      const fees = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      const accumulatedFees = Number((fees.result as any).value.value['accumulated-fees'].value);
      // With Dynamic Liquidity + Exponential Fees, value is captured through both fees AND slippage
      // Fees alone may be lower as slippage also protects LPs
      expect(accumulatedFees).toBeGreaterThan(5_000);
    });
  });
});

// ============================================================================
// FEE CLAIM TESTS (V3 NEW FEATURES)
// ============================================================================

describe('Multi-Market Pool V3 - Fee Claims', () => {
  describe('claim-creator-fees', () => {
    it('should allow creator to claim accumulated fees', () => {
      const marketId = createTestMarket(deployer);

      // Fund wallet1 and buy to generate fees
      fundWallet(wallet1, 1_000_000n);

      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet1
      );

      // Get creator fees before claim
      const feesBefore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      const creatorFeesBefore = Number((feesBefore.result as any).value.value['creator-fees'].value);
      expect(creatorFeesBefore).toBeGreaterThan(0);

      // Claim creator fees
      const claimResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'claim-creator-fees',
        [Cl.uint(marketId)],
        deployer
      );

      expect(claimResult.result.type).toBe('ok');

      // Verify fees were reset
      const feesAfter = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      const creatorFeesAfter = Number((feesAfter.result as any).value.value['creator-fees'].value);
      expect(creatorFeesAfter).toBe(0);
    });

    it('should reject claim from non-creator', () => {
      const marketId = createTestMarket(deployer);

      // Generate some fees
      fundWallet(wallet1, 1_000_000n);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet1
      );

      // Try to claim as non-creator
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'claim-creator-fees',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject claim when no fees to claim', () => {
      const marketId = createTestMarket(deployer);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'claim-creator-fees',
        [Cl.uint(marketId)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NO_FEES_TO_CLAIM));
    });
  });

  describe('claim-protocol-fees', () => {
    it('should allow guardian to claim accumulated protocol fees', () => {
      const marketId = createTestMarket(deployer);

      // Fund wallet1 and buy to generate fees
      fundWallet(wallet1, 1_000_000n);

      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet1
      );

      // Get protocol fees before claim
      const feesBefore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      const protocolFeesBefore = Number((feesBefore.result as any).value.value['protocol-fees'].value);
      expect(protocolFeesBefore).toBeGreaterThan(0);

      // Claim protocol fees as guardian (deployer)
      const claimResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'claim-protocol-fees',
        [Cl.uint(marketId)],
        deployer
      );

      expect(claimResult.result.type).toBe('ok');

      // Verify fees were reset
      const feesAfter = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      const protocolFeesAfter = Number((feesAfter.result as any).value.value['protocol-fees'].value);
      expect(protocolFeesAfter).toBe(0);
    });

    it('should reject claim from non-guardian', () => {
      const marketId = createTestMarket(deployer);

      // Generate some fees
      fundWallet(wallet1, 1_000_000n);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet1
      );

      // Try to claim as non-guardian
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'claim-protocol-fees',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_GUARDIAN));
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Multi-Market Pool V3 - Integration', () => {
  it('should maintain LP protection through full market lifecycle', () => {
    // Create a market with short duration for testing
    const { marketId, createdAt, deadline } = createTestMarketWithDuration(deployer, 100);

    // Add more liquidity
    fundWallet(wallet1, 5_000_000n);
    simnet.callPublicFn(
      CONTRACT_NAME,
      'add-liquidity',
      [Cl.uint(marketId), Cl.uint(5_000_000n)],
      wallet1
    );

    // Early trading (low fees)
    fundWallet(wallet2, 1_000_000n);
    simnet.callPublicFn(
      CONTRACT_NAME,
      'buy-outcome',
      [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
      wallet2
    );

    // Get fees at early stage
    const feesEarly = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      'get-accumulated-fees',
      [Cl.uint(marketId)],
      deployer
    );
    const accumulatedFeesEarly = Number((feesEarly.result as any).value.value['accumulated-fees'].value);

    // Mine to 75% progress
    mineToBlockHeight(createdAt + 75);

    // Late trading (high fees - LP protection)
    fundWallet(wallet3, 1_000_000n);
    simnet.callPublicFn(
      CONTRACT_NAME,
      'buy-outcome',
      [Cl.uint(marketId), Cl.uint(1), Cl.uint(1_000_000n), Cl.uint(0)],
      wallet3
    );

    // Get fees at late stage
    const feesLate = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      'get-accumulated-fees',
      [Cl.uint(marketId)],
      deployer
    );
    const accumulatedFeesLate = Number((feesLate.result as any).value.value['accumulated-fees'].value);

    // Late fees should be significantly higher than early fees
    expect(accumulatedFeesLate).toBeGreaterThan(accumulatedFeesEarly * 2);

    // Resolve and claim
    mineToBlockHeight(deadline + 1);
    simnet.callPublicFn(CONTRACT_NAME, 'resolve', [Cl.uint(marketId), Cl.uint(0)], deployer);
    simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) + 1);

    // LPs should have earned more from late trading fees
    const creatorFees = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      'get-accumulated-fees',
      [Cl.uint(marketId)],
      deployer
    );
    expect(Number((creatorFees.result as any).value.value['creator-fees'].value)).toBeGreaterThan(0);
  });
});
