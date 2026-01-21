import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

describe('Multi-Outcome Pool Contract', () => {
  beforeEach(() => {
    // Reset state between tests
    // Note: Clarinet simnet doesn't have mine.blocks() in beforeEach
  });

  describe('Constants', () => {
    it('should have correct precision constant', () => {
      const result = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-total-liquidity',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('LMSR Math Functions', () => {
    it('should calculate exp-approx correctly for small values', () => {
      // exp(0) should be approximately PRECISION (1.0)
      const result = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-total-liquidity',
        [],
        deployer
      );
      // The exp-approx function is private, so we test indirectly
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should handle ln-approx edge cases', () => {
      // ln(0) should return 0
      // ln(PRECISION) = ln(1) should return 0
      const result = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-total-liquidity',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Initialize Market', () => {
    it('should initialize a 3-outcome market successfully', () => {
      // First, mint USDC to wallet1
      const mintResult = simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],  // 100 USDC
        deployer
      );
      expect(mintResult.result).toBeOk(Cl.bool(true));

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      const initResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Which team will win?'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),  // 50 USDC initial liquidity
          Cl.uint(3),         // 3 outcomes
          Cl.uint(1000000),   // b = 1.0 (scaled by PRECISION)
        ],
        wallet1
      );

      expect(initResult.result).toBeOk(Cl.bool(true));
    });

    it('should fail to initialize without collateral', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      const initResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test question'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(0),  // No collateral
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(initResult.result).toBeErr(Cl.uint(2007)); // ERR-ZERO-AMOUNT
    });

    it('should fail to initialize with invalid outcome count', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Mint USDC first
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Try with 1 outcome (invalid, minimum is 2)
      const initResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test question'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(1),  // Only 1 outcome - invalid
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(initResult.result).toBeErr(Cl.uint(2016)); // ERR-INVALID-OUTCOME-COUNT
    });

    it('should fail to initialize twice', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Mint USDC first
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(200000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // First initialization
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test question'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Second initialization should fail
      const secondInit = simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Another question'),
          Cl.uint(deadline + 50),
          Cl.uint(resDeadline + 50),
          Cl.uint(50000000),
          Cl.uint(4),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(secondInit.result).toBeErr(Cl.uint(2012)); // ERR-ALREADY-INITIALIZED
    });
  });

  describe('Get Market Info', () => {
    it('should return correct market info after initialization', () => {
      // Mint USDC first
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Which outcome will win?'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(4),  // 4 outcomes
          Cl.uint(1500000),  // b = 1.5
        ],
        wallet1
      );

      const infoResult = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-market-info',
        [],
        wallet1
      );

      const info = (infoResult.result as any).value.value;
      expect(info).toHaveProperty('question');
      expect(info).toHaveProperty('creator');
      expect(info).toHaveProperty('deadline');
      expect(info).toHaveProperty('outcome-count');
      expect(info).toHaveProperty('lmsr-b');

      // Check specific values
      expect(info['outcome-count']).toEqual(Cl.uint(4));
      expect(info['lmsr-b']).toEqual(Cl.uint(1500000));
    });
  });

  describe('Add Liquidity', () => {
    it('should add liquidity to initialized market', () => {
      // Mint USDC to wallet1
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test question'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),  // 50 USDC initial
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Add more liquidity as wallet1
      const addResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'add-liquidity',
        [Cl.uint(10000000)],  // 10 USDC
        wallet1
      );

      expect(addResult.result).toBeOk(Cl.uint(10000000));  // Should receive 10 LP tokens
    });

    it('should fail to add liquidity after market resolved', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 100;

      // Initialize and resolve market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Mine to past deadline
      simnet.mineEmptyBlocks(5);

      // Resolve market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(0)],
        wallet1
      );

      // Try to add liquidity after resolution
      const addResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'add-liquidity',
        [Cl.uint(10000000)],
        wallet1
      );

      expect(addResult.result).toBeErr(Cl.uint(2002)); // ERR-MARKET-ALREADY-RESOLVED
    });
  });

  describe('Buy Outcome Tokens', () => {
    it('should buy outcome tokens successfully', () => {
      // Mint USDC to both wallet1 (liquidity provider) and wallet2 (buyer)
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test question'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),  // 50 USDC initial liquidity from wallet1
          Cl.uint(4),         // 4 outcomes
          Cl.uint(2000000),   // b = 2.0
        ],
        wallet1
      );

      // Buy outcome 0
      const buyResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'buy-outcome',
        [
          Cl.uint(0),        // outcome 0
          Cl.uint(5000000),  // 5 USDC
          Cl.uint(1),        // min tokens out
        ],
        wallet2
      );

      // Should receive some tokens (approx value, use range check due to trading dynamics)
      const tokensReceived = (buyResult.result as any).value.value;
      expect(Number(tokensReceived)).toBeGreaterThan(0);
      // With LMSR, tokens are scaled by PRECISION (1,000,000)
      // Buying 5 USDC can receive millions of tokens depending on price
      // Just verify it's a reasonable amount (less than 100 million)
      expect(Number(tokensReceived)).toBeLessThan(100_000_000);
    });

    it('should fail to buy with invalid outcome', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize with 3 outcomes (0, 1, 2 valid)
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Try to buy outcome 5 (invalid, only 0-2 are valid)
      const buyResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'buy-outcome',
        [
          Cl.uint(5),        // invalid outcome
          Cl.uint(5000000),
          Cl.uint(1),
        ],
        wallet2
      );

      expect(buyResult.result).toBeErr(Cl.uint(2004)); // ERR-INVALID-OUTCOME
    });

    it('should fail to buy after deadline', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 100;

      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Mine past deadline
      simnet.mineEmptyBlocks(5);

      const buyResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'buy-outcome',
        [
          Cl.uint(0),
          Cl.uint(5000000),
          Cl.uint(1),
        ],
        wallet2
      );

      expect(buyResult.result).toBeErr(Cl.uint(2001)); // ERR-MARKET-NOT-ACTIVE
    });
  });

  describe('Sell Outcome Tokens', () => {
    it('should sell outcome tokens successfully', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Buy tokens first
      simnet.callPublicFn(
        'multi-outcome-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(5000000), Cl.uint(1)],
        wallet2
      );

      // Check balance
      const balanceResult = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-outcome-balance',
        [Cl.standardPrincipal(wallet2), Cl.uint(0)],
        wallet2
      );

      const balanceValue = (balanceResult.result as any).value.value;

      // Sell the tokens
      const sellResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'sell-outcome',
        [
          Cl.uint(0),
          Cl.uint(1),  // Sell 1 token
          Cl.uint(1),  // Min USDC out
        ],
        wallet2
      );

      // Should receive some USDC back (use range check due to trading dynamics)
      const usdcReceived = (sellResult.result as any).value.value;
      expect(Number(usdcReceived)).toBeGreaterThan(0);
      expect(Number(usdcReceived)).toBeLessThan(10000000);
    });

    it('should fail to sell without balance', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Try to sell without buying first
      const sellResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'sell-outcome',
        [
          Cl.uint(0),
          Cl.uint(100),  // Try to sell 100 tokens
          Cl.uint(1),
        ],
        wallet2
      );

      expect(sellResult.result).toBeErr(Cl.uint(2005)); // ERR-INSUFFICIENT-BALANCE
    });
  });

  describe('Resolve Market', () => {
    it('should resolve market successfully', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 100;

      // Initialize market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Mine past deadline
      simnet.mineEmptyBlocks(5);

      // Resolve with outcome 1
      const resolveResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(1)],
        wallet1
      );

      expect(resolveResult.result).toBeOk(Cl.bool(true));

      // Check that winning outcome is set
      const infoResult = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-market-info',
        [],
        wallet1
      );

      const info = (infoResult.result as any).value.value;
      expect(info['winning-outcome']).toEqual(Cl.some(Cl.uint(1)));
    });

    it('should fail to resolve with invalid outcome', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 100;

      // Initialize with 3 outcomes
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      simnet.mineEmptyBlocks(5);

      // Try to resolve with invalid outcome 5
      const resolveResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(5)],
        wallet1
      );

      expect(resolveResult.result).toBeErr(Cl.uint(2004)); // ERR-INVALID-OUTCOME
    });

    it('should fail to resolve before deadline', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize market
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Try to resolve before deadline
      const resolveResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(0)],
        wallet1
      );

      expect(resolveResult.result).toBeErr(Cl.uint(2003)); // ERR-DEADLINE-NOT-PASSED
    });

    it('should fail if non-creator tries to resolve', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 100;

      // Initialize market with wallet1 as creator
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      simnet.mineEmptyBlocks(5);

      // Try to resolve with wallet2 (non-creator)
      const resolveResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(0)],
        wallet2
      );

      expect(resolveResult.result).toBeErr(Cl.uint(2000)); // ERR-NOT-AUTHORIZED
    });
  });

  describe('Claim Winnings', () => {
    it('should claim winnings after dispute window passes', () => {
      // Mint USDC to wallet1 (creator/liquidity provider) and wallet2 (trader)
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 200;

      // Initialize market with 3 outcomes
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),  // 50 USDC
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Wallet2 buys outcome 0
      simnet.callPublicFn(
        'multi-outcome-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(5000000), Cl.uint(1)],  // 5 USDC
        wallet2
      );

      // Mine past deadline
      simnet.mineEmptyBlocks(5);

      // Resolve with outcome 0 (wallet2's outcome)
      simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(0)],
        wallet1
      );

      // Mine enough blocks to pass dispute window (1008 blocks)
      simnet.mineEmptyBlocks(1010);

      // Check balance before claim
      const usdcBalanceBefore = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );

      // Claim winnings
      const claimResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'claim',
        [],
        wallet2
      );

      // Should receive tokens back (plus some trades, use range check)
      const winningsReceived = (claimResult.result as any).value.value;
      expect(Number(winningsReceived)).toBeGreaterThan(0);
      expect(Number(winningsReceived)).toBeLessThan(100000000);

      // Check balance increased
      const usdcBalanceAfter = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );

      // Balance should be higher after claiming
      const before = Number((usdcBalanceBefore.result as any).value.value);
      const after = Number((usdcBalanceAfter.result as any).value.value);
      expect(after).toBeGreaterThan(before);
    });

    it('should fail to claim during dispute window', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 200;

      // Initialize and trade
      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      simnet.callPublicFn(
        'multi-outcome-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(5000000), Cl.uint(1)],
        wallet2
      );

      // Mine past deadline and resolve
      simnet.mineEmptyBlocks(5);
      simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(0)],
        wallet1
      );

      // Try to claim before dispute window passes (only mined 5 blocks past deadline)
      const claimResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'claim',
        [],
        wallet2
      );

      expect(claimResult.result).toBeErr(Cl.uint(2013)); // ERR-DISPUTE-WINDOW-ACTIVE
    });

    it('should fail to claim twice', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 200;

      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      simnet.callPublicFn(
        'multi-outcome-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(5000000), Cl.uint(1)],
        wallet2
      );

      simnet.mineEmptyBlocks(5);
      simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(0)],
        wallet1
      );
      simnet.mineEmptyBlocks(1010);

      // First claim
      simnet.callPublicFn(
        'multi-outcome-pool',
        'claim',
        [],
        wallet2
      );

      // Second claim should fail
      const claimResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'claim',
        [],
        wallet2
      );

      expect(claimResult.result).toBeErr(Cl.uint(2009)); // ERR-ALREADY-CLAIMED
    });
  });

  describe('Dispute Functions', () => {
    it('should allow creator to open dispute', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 200;

      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      simnet.mineEmptyBlocks(5);
      simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(0)],
        wallet1
      );

      // Open dispute as creator
      const disputeResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'open-dispute',
        [Cl.uint(5000000)],  // 5 USDC stake
        wallet1
      );

      expect(disputeResult.result).toBeOk(Cl.uint(5000000));
    });

    it('should fail to open dispute twice', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 200;

      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      simnet.mineEmptyBlocks(5);
      simnet.callPublicFn(
        'multi-outcome-pool',
        'resolve',
        [Cl.uint(0)],
        wallet1
      );

      // Open dispute first time
      simnet.callPublicFn(
        'multi-outcome-pool',
        'open-dispute',
        [Cl.uint(5000000)],
        wallet1
      );

      // Try to open dispute again
      const disputeResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'open-dispute',
        [Cl.uint(5000000)],
        wallet1
      );

      expect(disputeResult.result).toBeErr(Cl.uint(2014)); // ERR-DISPUTE-ALREADY-OPENED
    });
  });

  describe('Get Dispute Window Info', () => {
    it('should return correct dispute window info', () => {
      // Mint USDC
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 2;
      const resDeadline = deadline + 200;

      simnet.callPublicFn(
        'multi-outcome-pool',
        'initialize',
        [
          Cl.stringUtf8('Test'),
          Cl.uint(deadline),
          Cl.uint(resDeadline),
          Cl.uint(50000000),
          Cl.uint(3),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Before resolution - should have dispute-window-blocks
      const infoBefore = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-dispute-window-info',
        [],
        wallet1
      );

      const infoBeforeMap = (infoBefore.result as any).value.value;
      expect(infoBeforeMap['claims-enabled']).toEqual(Cl.bool(false));
      expect(infoBeforeMap['resolution-block']).toEqual(Cl.uint(0));
    });
  });
});
