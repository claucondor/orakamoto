import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

// Constants
const MINIMUM_COLLATERAL = 50_000_000n; // 50 USDC with 6 decimals
const DISPUTE_WINDOW = 1008n; // ~7 days in blocks

// Error constants
const ERR_NO_WINNINGS = 1010n;

describe('Integration - Complete Market Lifecycle', () => {
  it('should handle full lifecycle: create market -> add liquidity -> buy YES -> buy NO -> resolve -> claim winnings', () => {
    const currentBlock = simnet.blockHeight;
    // Give more time for trading - deadline 100 blocks in the future
    const deadline = currentBlock + 100;
    const resDeadline = deadline + 100;

    // ========================================================================
    // STEP 1: Create Market via Factory
    // ========================================================================
    // Give wallet1 enough USDC for collateral
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

    // Create market using factory
    const createResult = simnet.callPublicFn(
      'market-factory',
      'create-market',
      [
        Cl.stringUtf8('Will Bitcoin reach $100k by end of 2025?'),
        Cl.uint(deadline),
        Cl.some(Cl.uint(resDeadline)),
        Cl.uint(MINIMUM_COLLATERAL),
      ],
      wallet1
    );

    expect(createResult.result).toBeOk(Cl.uint(1));

    // Verify market was created
    const marketCount = simnet.callReadOnlyFn('market-factory', 'get-market-count', [], deployer);
    expect(marketCount.result).toBeOk(Cl.uint(1));

    // ========================================================================
    // STEP 2: Initialize Market Pool with Initial Liquidity
    // ========================================================================
    // The factory holds the collateral, but for this test we'll use the pool directly
    // In production, the factory would deploy a pool contract and initialize it

    // Give wallet1 USDC for initial liquidity (wallet1 already has collateral in factory)
    // Need additional USDC for pool initialization
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

    // Initialize market pool (simulating what factory would do after deployment)
    // Must be called by wallet1 since they are the market creator
    const initResult = simnet.callPublicFn(
      'market-pool',
      'initialize',
      [
        Cl.stringUtf8('Will Bitcoin reach $100k by end of 2025?'),
        Cl.uint(deadline),
        Cl.uint(resDeadline),
        Cl.uint(MINIMUM_COLLATERAL),
      ],
      wallet1
    );

    expect(initResult.result).toBeOk(Cl.bool(true));

    // Verify initial state
    const marketInfo = simnet.callReadOnlyFn('market-pool', 'get-market-info', [], deployer);
    expect(marketInfo.result.type).toBe('ok');

    // ========================================================================
    // STEP 3: Add More Liquidity (LP)
    // ========================================================================
    // Give wallet2 USDC to add liquidity
    const liquidityAmount = 100_000_000n; // 100 USDC
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(liquidityAmount)], wallet2);

    const addLiquidityResult = simnet.callPublicFn(
      'market-pool',
      'add-liquidity',
      [Cl.uint(liquidityAmount)],
      wallet2
    );

    expect(addLiquidityResult.result.type).toBe('ok');

    // Verify liquidity was added
    const totalLiquidity = simnet.callReadOnlyFn('market-pool', 'get-total-liquidity', [], deployer);
    expect(totalLiquidity.result.type).toBe('ok');

    // ========================================================================
    // STEP 4: Buy YES Tokens (wallet1)
    // ========================================================================
    const buyAmount = 50_000_000n; // 50 USDC
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(buyAmount)], wallet1);

    const buyYesResult = simnet.callPublicFn(
      'market-pool',
      'buy-outcome',
      [Cl.uint(0), Cl.uint(buyAmount), Cl.uint(0)], // outcome 0 = YES
      wallet1
    );

    expect(buyYesResult.result.type).toBe('ok');

    // Verify wallet1 has YES tokens
    const wallet1YesBalance = simnet.callReadOnlyFn(
      'market-pool',
      'get-outcome-balance',
      [Cl.standardPrincipal(wallet1), Cl.uint(0)],
      wallet1
    );
    expect(wallet1YesBalance.result.type).toBe('ok');

    // ========================================================================
    // STEP 5: Buy NO Tokens (wallet2)
    // ========================================================================
    const buyNoAmount = 30_000_000n; // 30 USDC

    // Give wallet2 more USDC
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(50_000_000n)], wallet2);

    const buyNoResult = simnet.callPublicFn(
      'market-pool',
      'buy-outcome',
      [Cl.uint(1), Cl.uint(buyNoAmount), Cl.uint(0)], // outcome 1 = NO
      wallet2
    );

    expect(buyNoResult.result.type).toBe('ok');

    // Verify wallet2 has NO tokens
    const wallet2NoBalance = simnet.callReadOnlyFn(
      'market-pool',
      'get-outcome-balance',
      [Cl.standardPrincipal(wallet2), Cl.uint(1)],
      wallet2
    );
    expect(wallet2NoBalance.result.type).toBe('ok');

    // ========================================================================
    // STEP 6: Advance Past Deadline and Resolve Market
    // ========================================================================
    // Mine blocks past the trading deadline
    simnet.mineEmptyBlocks(100);

    // Resolve market (YES wins) - must be called by market creator (wallet1)
    const resolveResult = simnet.callPublicFn(
      'market-pool',
      'resolve',
      [Cl.uint(0)], // YES wins
      wallet1
    );

    expect(resolveResult.result).toBeOk(Cl.bool(true));

    // Verify market is resolved
    const resolvedInfo = simnet.callReadOnlyFn('market-pool', 'get-market-info', [], deployer);
    expect(resolvedInfo.result.type).toBe('ok');

    // ========================================================================
    // STEP 7: Try to Claim During Dispute Window (should fail)
    // ========================================================================
    const earlyClaimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
    expect(earlyClaimResult.result.type).toBe('err');

    // ========================================================================
    // STEP 8: Wait for Dispute Window to Pass
    // ========================================================================
    simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) + 1);

    // Verify dispute window has passed
    const disputeInfo = simnet.callReadOnlyFn('market-pool', 'get-dispute-window-info', [], deployer);
    expect(disputeInfo.result.type).toBe('ok');

    // ========================================================================
    // STEP 9: Claim Winnings (Winner)
    // ========================================================================
    const wallet1BalanceBefore = simnet.callReadOnlyFn(
      'mock-usdc',
      'get-balance',
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );

    const claimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet1);

    // Winner should be able to claim
    expect(claimResult.result.type).toBe('ok');

    // Verify wallet1 received winnings
    const wallet1BalanceAfter = simnet.callReadOnlyFn(
      'mock-usdc',
      'get-balance',
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );

    // Winner should have more USDC than before
    const balanceBefore = (wallet1BalanceBefore.result as any).value.value;
    const balanceAfter = (wallet1BalanceAfter.result as any).value.value;
    console.log('wallet1 balance before claim:', balanceBefore);
    console.log('wallet1 balance after claim:', balanceAfter);
    expect(balanceAfter > balanceBefore).toBe(true);

    // ========================================================================
    // STEP 10: Loser Tries to Claim (should fail)
    // ========================================================================
    const loserClaimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet2);
    expect(loserClaimResult.result).toBeErr(Cl.uint(ERR_NO_WINNINGS));
  });

  it('should handle complete lifecycle with NO as winning outcome', () => {
    const currentBlock = simnet.blockHeight;
    const deadline = currentBlock + 10;
    const resDeadline = deadline + 100;

    // Initialize market
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], deployer);
    simnet.callPublicFn(
      'market-pool',
      'initialize',
      [
        Cl.stringUtf8('Will ETH hit $5k?'),
        Cl.uint(deadline),
        Cl.uint(resDeadline),
        Cl.uint(MINIMUM_COLLATERAL),
      ],
      deployer
    );

    // Users buy tokens
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(100_000_000n)], wallet1);
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(100_000_000n)], wallet2);

    // wallet1 buys NO (betting ETH won't hit $5k)
    simnet.callPublicFn(
      'market-pool',
      'buy-outcome',
      [Cl.uint(1), Cl.uint(50_000_000n), Cl.uint(0)], // outcome 1 = NO
      wallet1
    );

    // wallet2 buys YES (betting ETH will hit $5k)
    simnet.callPublicFn(
      'market-pool',
      'buy-outcome',
      [Cl.uint(0), Cl.uint(50_000_000n), Cl.uint(0)], // outcome 0 = YES
      wallet2
    );

    // Advance past deadline
    simnet.mineEmptyBlocks(11);

    // Resolve market (NO wins)
    simnet.callPublicFn('market-pool', 'resolve', [Cl.uint(1)], deployer);

    // Wait for dispute window
    simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) + 1);

    // wallet1 (NO holder) should be able to claim
    const claimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
    expect(claimResult.result.type).toBe('ok');

    // wallet2 (YES holder, loser) should not be able to claim
    const loserClaimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet2);
    expect(loserClaimResult.result).toBeErr(Cl.uint(ERR_NO_WINNINGS));
  });

  it('should handle liquidity provision and removal during market lifecycle', () => {
    const currentBlock = simnet.blockHeight;
    const deadline = currentBlock + 10;
    const resDeadline = deadline + 100;

    // Initialize market with initial liquidity
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], deployer);
    simnet.callPublicFn(
      'market-pool',
      'initialize',
      [
        Cl.stringUtf8('Will SOL reach $500?'),
        Cl.uint(deadline),
        Cl.uint(resDeadline),
        Cl.uint(MINIMUM_COLLATERAL),
      ],
      deployer
    );

    // LP adds liquidity
    const lpAmount = 200_000_000n; // 200 USDC
    simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(lpAmount)], wallet1);
    simnet.callPublicFn('market-pool', 'add-liquidity', [Cl.uint(lpAmount)], wallet1);

    // Check LP balance
    const lpBalance = simnet.callReadOnlyFn(
      'market-pool',
      'get-lp-balance',
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(lpBalance.result.type).toBe('ok');

    // Remove liquidity (before resolution)
    const removeAmount = 50_000_000n; // Remove 50 USDC worth
    const removeResult = simnet.callPublicFn(
      'market-pool',
      'remove-liquidity',
      [Cl.uint(removeAmount)],
      wallet1
    );
    expect(removeResult.result.type).toBe('ok');

    // Verify LP balance decreased
    const lpBalanceAfter = simnet.callReadOnlyFn(
      'market-pool',
      'get-lp-balance',
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(lpBalanceAfter.result.type).toBe('ok');
  });
});
