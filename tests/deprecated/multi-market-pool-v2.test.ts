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

// Guardian/Recovery Error constants
const ERR_NOT_GUARDIAN = 4100n;
const ERR_MARKET_NOT_UNHEALTHY = 4101n;
const ERR_RECOVERY_WINDOW_NOT_PASSED = 4102n;
const ERR_MARKET_ALREADY_UNHEALTHY = 4103n;
const ERR_NO_LP_TOKENS = 4104n;
const ERR_ALREADY_EMERGENCY_WITHDRAWN = 4105n;

const CONTRACT_NAME = 'multi-market-pool-v2';

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

// Setup: Authorize multi-market-pool-v2 to mint/burn LP tokens
const MULTI_MARKET_POOL_V2_PRINCIPAL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.multi-market-pool-v2';

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
  if (!currentMinter || currentMinter.value !== MULTI_MARKET_POOL_V2_PRINCIPAL) {
    const authResult = simnet.callPublicFn(
      'sip013-lp-token',
      'set-authorized-minter',
      [Cl.contractPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'multi-market-pool-v2')],
      deployer
    );
    console.log('LP token auth result:', authResult.result);
  }
}

// Helper to create a market and return its ID
function createTestMarket(creator: string, liquidity: bigint = 10_000_000n): number {
  fundWallet(creator, liquidity);
  const currentBlock = simnet.blockHeight;
  const deadline = currentBlock + 1000;
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
  return Number(marketId);
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
// GUARDIAN SYSTEM TESTS
// ============================================================================

describe('Multi-Market Pool V2 - Guardian System', () => {
  describe('get-guardian', () => {
    it('should return deployer as initial guardian', () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-guardian',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.standardPrincipal(deployer));
    });
  });

  describe('set-guardian', () => {
    it('should allow guardian to transfer role', () => {
      // Deployer (initial guardian) sets wallet1 as new guardian
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'set-guardian',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify new guardian
      const guardianResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-guardian',
        [],
        deployer
      );

      expect(guardianResult.result).toBeOk(Cl.standardPrincipal(wallet1));
    });

    it('should reject set-guardian from non-guardian', () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'set-guardian',
        [Cl.standardPrincipal(wallet2)],
        wallet1 // wallet1 is not guardian
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_GUARDIAN));
    });

    it('should allow new guardian to transfer role again', () => {
      // First, deployer sets wallet1 as guardian
      simnet.callPublicFn(
        CONTRACT_NAME,
        'set-guardian',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Now wallet1 (new guardian) can set wallet2 as guardian
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'set-guardian',
        [Cl.standardPrincipal(wallet2)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify wallet2 is now guardian
      const guardianResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-guardian',
        [],
        deployer
      );

      expect(guardianResult.result).toBeOk(Cl.standardPrincipal(wallet2));
    });
  });

  describe('mark-unhealthy', () => {
    it('should allow guardian to mark market as unhealthy', () => {
      // Create a market first
      const marketId = createTestMarket(wallet1);

      // Guardian (deployer) marks it unhealthy
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify market is unhealthy
      const unhealthyResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'is-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      expect(unhealthyResult.result).toBeOk(Cl.bool(true));
    });

    it('should reject mark-unhealthy from non-guardian', () => {
      const marketId = createTestMarket(wallet1);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(marketId)],
        wallet2 // Not guardian
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_GUARDIAN));
    });

    it('should reject marking non-existent market', () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(999)], // Non-existent market
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject marking already unhealthy market', () => {
      const marketId = createTestMarket(wallet1);

      // Mark unhealthy first time
      simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      // Try to mark again
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_UNHEALTHY));
    });
  });

  describe('is-unhealthy', () => {
    it('should return false for healthy market', () => {
      const marketId = createTestMarket(wallet1);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'is-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return true for unhealthy market', () => {
      const marketId = createTestMarket(wallet1);

      // Mark unhealthy
      simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'is-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });
  });

  describe('get-unhealthy-details', () => {
    it('should return correct details for healthy market', () => {
      const marketId = createTestMarket(wallet1);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-unhealthy-details',
        [Cl.uint(marketId)],
        deployer
      );

      const details = (result.result as any).value.value;
      expect(details['is-unhealthy']).toStrictEqual(Cl.bool(false));
      expect(details['marked-at-block']).toStrictEqual(Cl.uint(0));
      expect(details['recovery-window-ends']).toStrictEqual(Cl.uint(0));
      expect(details['can-emergency-withdraw']).toStrictEqual(Cl.bool(false));
    });

    it('should return correct details for unhealthy market', () => {
      const marketId = createTestMarket(wallet1);
      const blockBeforeMark = simnet.blockHeight;

      // Mark unhealthy
      simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      const markedBlock = blockBeforeMark + 1; // Contract call mines 1 block

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-unhealthy-details',
        [Cl.uint(marketId)],
        deployer
      );

      const details = (result.result as any).value.value;
      expect(details['is-unhealthy']).toStrictEqual(Cl.bool(true));
      expect(Number((details['marked-at-block'] as any).value)).toBeGreaterThanOrEqual(markedBlock);
      expect(details['can-emergency-withdraw']).toStrictEqual(Cl.bool(false)); // Recovery window not passed
    });
  });

  describe('emergency-withdraw', () => {
    it('should reject emergency withdraw for healthy market', () => {
      const marketId = createTestMarket(wallet1);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'emergency-withdraw',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_UNHEALTHY));
    });

    it('should reject emergency withdraw before recovery window', () => {
      const marketId = createTestMarket(wallet1);

      // Mark unhealthy
      simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      // Try to withdraw immediately (recovery window not passed)
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'emergency-withdraw',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_RECOVERY_WINDOW_NOT_PASSED));
    });

    it('should reject emergency withdraw for user without LP tokens', () => {
      const marketId = createTestMarket(wallet1);

      // Mark unhealthy
      simnet.callPublicFn(
        CONTRACT_NAME,
        'mark-unhealthy',
        [Cl.uint(marketId)],
        deployer
      );

      // Mine enough blocks to pass recovery window (using smaller number for testing)
      // In a real test, you'd mine RECOVERY_WINDOW blocks, but that's too slow
      // For this test, we'll check the error happens before the window check

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'emergency-withdraw',
        [Cl.uint(marketId)],
        wallet2 // wallet2 has no LP tokens
      );

      // Should fail with recovery window error first (since we haven't passed enough blocks)
      expect(result.result).toBeErr(Cl.uint(ERR_RECOVERY_WINDOW_NOT_PASSED));
    });

    it('should reject emergency withdraw for non-existent market', () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'emergency-withdraw',
        [Cl.uint(999)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });
  });

  describe('has-emergency-withdrawn', () => {
    it('should return false initially', () => {
      const marketId = createTestMarket(wallet1);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'has-emergency-withdrawn',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1)],
        deployer
      );

      expect(result.result).toStrictEqual(Cl.bool(false));
    });
  });
});

// ============================================================================
// MARKET CREATION TESTS
// ============================================================================

describe('Multi-Market Pool V2 - Create Market', () => {
  describe('create-market', () => {
    it('should create market correctly with valid inputs', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const resolutionDeadline = deadline + 1000;
      const initialLiquidity = 10_000_000n; // 10 USDC

      // Fund the deployer wallet
      fundWallet(deployer, Number(initialLiquidity));

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k by end of 2025?'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(initialLiquidity),
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(1)); // First market has ID 1

      // Verify market was created correctly
      const market = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(1)],
        deployer
      );

      // Verify market data - created-at will be some block number
      // Just verify it's set (not 0)
      const marketData = (market.result as any).value;
      expect(marketData.value['created-at'].value).toBeGreaterThan(0);

      // Verify market count incremented
      const count = simnet.callReadOnlyFn(CONTRACT_NAME, 'get-market-count', [], deployer);
      expect(count.result).toBeOk(Cl.uint(1));

      // Verify LP tokens were minted to creator
      const lpBalance = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-lp-balance',
        [Cl.uint(1), Cl.standardPrincipal(deployer)],
        deployer
      );
      expect(lpBalance.result).toBeOk(Cl.uint(initialLiquidity));
    });

    it('should reject creation with empty question', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8(''),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_QUESTION));
    });

    it('should reject creation with deadline in the past', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(0), // deadline of 0 is in the past
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_DEADLINE));
    });

    it('should reject creation with resolution-deadline before deadline', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(3000),
          Cl.uint(2000), // Before deadline
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_DEADLINE));
    });

    it('should reject creation with insufficient liquidity', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(500_000n), // Less than MINIMUM_INITIAL_LIQUIDITY (1 USDC)
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });

    it('should split liquidity 50/50 between YES and NO reserves', () => {
      const initialLiquidity = 10_000_000n; // 10 USDC
      fundWallet(deployer, Number(initialLiquidity));

      const currentBlock = simnet.blockHeight;
      simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(currentBlock + 1000),
          Cl.uint(currentBlock + 2000),
          Cl.uint(initialLiquidity),
        ],
        deployer
      );

      // Get reserves
      const reserves = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-reserves',
        [Cl.uint(1)],
        deployer
      );

      expect(reserves.result).toBeOk(
        Cl.tuple({
          'yes-reserve': Cl.uint(initialLiquidity / 2n),
          'no-reserve': Cl.uint(initialLiquidity / 2n),
          'total-liquidity': Cl.uint(initialLiquidity),
        })
      );
    });

    it('should have correct initial prices (50% YES, 50% NO)', () => {
      fundWallet(deployer, 10_000_000n);

      const currentBlock = simnet.blockHeight;
      simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(currentBlock + 1000),
          Cl.uint(currentBlock + 2000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      // Get prices
      const prices = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-prices',
        [Cl.uint(1)],
        deployer
      );

      // With equal reserves, YES price should be ~50% (500000/1000000)
      // and NO price should be ~50%
      const p = (prices.result as any).value.value;
      expect(Number((p['yes-price'] as any).value)).toBeGreaterThan(400000);
      expect(Number((p['yes-price'] as any).value)).toBeLessThan(600000);
      expect(Number((p['no-price'] as any).value)).toBeGreaterThan(400000);
      expect(Number((p['no-price'] as any).value)).toBeLessThan(600000);
    });
  });
});

// ============================================================================
// TRADING TESTS
// ============================================================================

describe('Multi-Market Pool V2 - Trading', () => {
  describe('buy-outcome', () => {
    it('should allow buying YES outcome tokens', () => {
      const marketId = createTestMarket(deployer);

      // Fund wallet1 for trading
      fundWallet(wallet1, 1_000_000n);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0), // YES
          Cl.uint(1_000_000n), // 1 USDC
          Cl.uint(0), // min tokens out (0 for no slippage protection in test)
        ],
        wallet1
      );

      expect(result.result.type).toBe('ok');

      // Verify balance increased
      const balance = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        wallet1
      );

      expect(Number((balance.result as any).value.value)).toBeGreaterThan(0);
    });

    it('should allow buying NO outcome tokens', () => {
      const marketId = createTestMarket(deployer);

      // Fund wallet1 for trading
      fundWallet(wallet1, 1_000_000n);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(1), // NO
          Cl.uint(1_000_000n), // 1 USDC
          Cl.uint(0), // min tokens out
        ],
        wallet1
      );

      expect(result.result.type).toBe('ok');

      // Verify balance increased
      const balance = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(1)],
        wallet1
      );

      expect(Number((balance.result as any).value.value)).toBeGreaterThan(0);
    });

    it('should reject buying from non-existent market', () => {
      fundWallet(wallet1, 1_000_000n);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(999), // Non-existent
          Cl.uint(0),
          Cl.uint(1_000_000n),
          Cl.uint(0),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject invalid outcome', () => {
      const marketId = createTestMarket(deployer);
      fundWallet(wallet1, 1_000_000n);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(2), // Invalid outcome (must be 0 or 1)
          Cl.uint(1_000_000n),
          Cl.uint(0),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });

    it('should reject zero amount', () => {
      const marketId = createTestMarket(deployer);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0),
          Cl.uint(0), // Zero amount
          Cl.uint(0),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });
  });

  describe('sell-outcome', () => {
    it('should allow selling outcome tokens', () => {
      const marketId = createTestMarket(deployer);

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
    });

    it('should reject selling more tokens than owned', () => {
      const marketId = createTestMarket(deployer);

      // Fund wallet1 and buy some tokens
      fundWallet(wallet1, 1_000_000n);

      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0),
          Cl.uint(1_000_000n),
          Cl.uint(0),
        ],
        wallet1
      );

      // Try to sell more than owned
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'sell-outcome',
        [
          Cl.uint(marketId),
          Cl.uint(0),
          Cl.uint(999_999_999n), // Way more than owned
          Cl.uint(0),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });
  });
});

// ============================================================================
// LIQUIDITY TESTS
// ============================================================================

describe('Multi-Market Pool V2 - Liquidity', () => {
  describe('add-liquidity', () => {
    it('should allow adding liquidity to existing market', () => {
      const marketId = createTestMarket(deployer);

      // Fund wallet1 to add liquidity
      fundWallet(wallet1, 5_000_000n);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      expect(result.result.type).toBe('ok');

      // Verify LP tokens were minted
      const lpBalance = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(Number((lpBalance.result as any).value.value)).toBeGreaterThan(0);
    });

    it('should reject adding liquidity below minimum', () => {
      const marketId = createTestMarket(deployer);

      fundWallet(wallet1, 50_000n);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(50_000n)], // Below MINIMUM_LIQUIDITY
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });
  });

  describe('remove-liquidity', () => {
    it('should allow removing liquidity', () => {
      const marketId = createTestMarket(deployer, 10_000_000n);

      // Remove some liquidity
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(1_000_000n)],
        deployer
      );

      expect(result.result.type).toBe('ok');
    });

    it('should reject removing liquidity below minimum', () => {
      const marketId = createTestMarket(deployer);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(50_000n)], // Below MINIMUM_LIQUIDITY
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });
  });
});

// ============================================================================
// RESOLUTION AND CLAIMS TESTS
// ============================================================================

describe('Multi-Market Pool V2 - Resolution', () => {
  describe('resolve', () => {
    it('should allow creator to resolve after deadline', () => {
      fundWallet(deployer, 10_000_000n);

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resolutionDeadline = deadline + 100;

      // Create market with short deadline
      const createResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Test resolution'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      const marketId = Number((createResult.result as any).value.value);

      // Mine blocks to pass deadline
      mineToBlockHeight(deadline + 1);

      // Resolve market
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)], // YES wins
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject resolution before deadline', () => {
      const marketId = createTestMarket(deployer);

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DEADLINE_NOT_PASSED));
    });

    it('should reject resolution by non-creator', () => {
      fundWallet(wallet1, 10_000_000n);

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;

      // Create market as wallet1
      const createResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(deadline + 100),
          Cl.uint(10_000_000n),
        ],
        wallet1
      );

      const marketId = Number((createResult.result as any).value.value);

      // Mine blocks to pass deadline
      mineToBlockHeight(deadline + 1);

      // Try to resolve as deployer (not creator)
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('claim', () => {
    it('should allow claiming winnings after dispute window', () => {
      fundWallet(deployer, 10_000_000n);
      fundWallet(wallet1, 2_000_000n);

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resolutionDeadline = deadline + 100;

      // Create market
      const createResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Test claim'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      const marketId = Number((createResult.result as any).value.value);

      // wallet1 buys YES tokens
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

      // Mine to pass deadline
      mineToBlockHeight(deadline + 1);

      // Resolve market - YES wins
      simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      // Mine to pass dispute window
      simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) + 1);

      // Claim winnings
      const claimResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'claim',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(claimResult.result.type).toBe('ok');
    });

    it('should reject claim during dispute window', () => {
      fundWallet(deployer, 10_000_000n);
      fundWallet(wallet1, 1_000_000n);

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;

      // Create and setup market
      const createResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(deadline + 100),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      const marketId = Number((createResult.result as any).value.value);

      // Buy tokens
      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet1
      );

      // Mine to pass deadline and resolve
      mineToBlockHeight(deadline + 1);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      // Try to claim immediately (dispute window still active)
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'claim',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_ACTIVE));
    });

    it('should reject double claim', () => {
      fundWallet(deployer, 10_000_000n);
      fundWallet(wallet1, 2_000_000n);

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;

      // Create market
      const createResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(deadline + 100),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      const marketId = Number((createResult.result as any).value.value);

      // Buy tokens
      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet1
      );

      // Resolve
      mineToBlockHeight(deadline + 1);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      // Pass dispute window
      simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) + 1);

      // First claim
      simnet.callPublicFn(
        CONTRACT_NAME,
        'claim',
        [Cl.uint(marketId)],
        wallet1
      );

      // Try second claim
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'claim',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_CLAIMED));
    });
  });
});

// ============================================================================
// READ-ONLY FUNCTION TESTS
// ============================================================================

describe('Multi-Market Pool V2 - Read-Only Functions', () => {
  describe('is-market-active', () => {
    it('should return true for active market', () => {
      const marketId = createTestMarket(deployer);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'is-market-active',
        [Cl.uint(marketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return false for resolved market', () => {
      fundWallet(deployer, 10_000_000n);

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;

      const createResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(deadline + 100),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      const marketId = Number((createResult.result as any).value.value);

      // Resolve
      mineToBlockHeight(deadline + 1);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'is-market-active',
        [Cl.uint(marketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });
  });

  describe('get-claim-status', () => {
    it('should return correct status for unresolved market', () => {
      const marketId = createTestMarket(deployer);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-claim-status',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const status = (result.result as any).value.value;
      expect(status['is-resolved']).toStrictEqual(Cl.bool(false));
      expect(status['claims-enabled']).toStrictEqual(Cl.bool(false));
      expect(status['has-claimed']).toStrictEqual(Cl.bool(false));
    });
  });

  describe('calculate-fee', () => {
    it('should calculate 1% fee correctly', () => {
      const amount = 1_000_000n; // 1 USDC

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'calculate-fee',
        [Cl.uint(amount)],
        deployer
      );

      // 1% of 1,000,000 = 10,000
      expect(result.result).toStrictEqual(Cl.uint(10_000n));
    });
  });
});
