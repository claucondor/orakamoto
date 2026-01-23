import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const MINIMUM_INITIAL_LIQUIDITY = 1_000_000n; // 1 USDC with 6 decimals
const DISPUTE_WINDOW = 1008n; // ~7 days in blocks

// Error constants
const ERR_MARKET_NOT_FOUND = 4000n;
const ERR_MARKET_NOT_ACTIVE = 4001n;
const ERR_MARKET_ALREADY_RESOLVED = 4002n;
const ERR_INVALID_OUTCOME = 4004n;
const ERR_INVALID_QUESTION = 4012n;
const ERR_INVALID_DEADLINE = 4013n;
const ERR_INSUFFICIENT_LIQUIDITY = 4006n;
const ERR_ZERO_AMOUNT = 4007n;
const ERR_SLIPPAGE_TOO_HIGH = 4008n;
const ERR_MARKET_ID_OVERFLOW = 4014n;

// Helper function to give a wallet USDC via faucet
function fundWallet(wallet: string, amount: number) {
  simnet.callPublicFn('usdcx', 'faucet', [Cl.uint(amount)], wallet);
}

describe('Multi-Market Pool - Create Market', () => {
  beforeEach(() => {
    // Reset state before each test
    simnet.blockHeight = 1000n;
  });

  describe('create-market', () => {
    it('should create market correctly with valid inputs', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const resolutionDeadline = deadline + 1000;
      const initialLiquidity = 10_000_000n; // 10 USDC

      // Fund the deployer wallet
      fundWallet(deployer, Number(initialLiquidity));

      const result = simnet.callPublicFn(
        'multi-market-pool',
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
        'multi-market-pool',
        'get-market',
        [Cl.uint(1)],
        deployer
      );

      expect(market.result).toBeOk(
        Cl.tuple({
          creator: Cl.standardPrincipal(deployer),
          question: Cl.stringUtf8('Will BTC reach $100k by end of 2025?'),
          deadline: Cl.uint(deadline),
          'resolution-deadline': Cl.uint(resolutionDeadline),
          'yes-reserve': Cl.uint(initialLiquidity / 2n),
          'no-reserve': Cl.uint(initialLiquidity / 2n),
          'total-liquidity': Cl.uint(initialLiquidity),
          'accumulated-fees': Cl.uint(0),
          'is-resolved': Cl.bool(false),
          'winning-outcome': Cl.none(),
          'resolution-block': Cl.uint(0),
          'created-at': Cl.uint(currentBlock),
          'liquidity-parameter': Cl.uint(initialLiquidity),
        })
      );

      // Verify market count incremented
      const count = simnet.callReadOnlyFn('multi-market-pool', 'get-market-count', [], deployer);
      expect(count.result).toBeOk(Cl.uint(1));

      // Verify LP tokens were minted to creator
      const lpBalance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(1), Cl.standardPrincipal(deployer)],
        deployer
      );
      expect(lpBalance.result).toBeOk(Cl.uint(initialLiquidity));
    });

    it('should reject creation with empty question', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-market-pool',
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
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(500), // Past current block height (1000)
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
        'multi-market-pool',
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
        'multi-market-pool',
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

    it('should reject creation without sufficient USDCx balance', () => {
      // Don't fund the wallet

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n), // 10 USDC
        ],
        deployer
      );

      // The USDCx transfer will fail
      expect(result.result.type).toBe('error');
    });

    it('should create market with exactly minimum liquidity', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should increment market-id for each new market', () => {
      fundWallet(deployer, 100_000_000n);

      // Create first market
      const result1 = simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Market 1'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      // Create second market
      const result2 = simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Market 2'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );
      expect(result2.result).toBeOk(Cl.uint(2));

      // Create third market
      const result3 = simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Market 3'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );
      expect(result3.result).toBeOk(Cl.uint(3));

      // Verify market count
      const count = simnet.callReadOnlyFn('multi-market-pool', 'get-market-count', [], deployer);
      expect(count.result).toBeOk(Cl.uint(3));
    });

    it('should split liquidity 50/50 between YES and NO reserves', () => {
      const initialLiquidity = 10_000_000n; // 10 USDC
      fundWallet(deployer, Number(initialLiquidity));

      simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(initialLiquidity),
        ],
        deployer
      );

      // Get reserves
      const reserves = simnet.callReadOnlyFn(
        'multi-market-pool',
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

    it('should initialize fee maps to zero', () => {
      fundWallet(deployer, 10_000_000n);

      simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      // Get accumulated fees
      const fees = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-accumulated-fees',
        [Cl.uint(1)],
        deployer
      );

      expect(fees.result).toBeOk(
        Cl.tuple({
          'accumulated-fees': Cl.uint(0),
          'creator-fees': Cl.uint(0),
          'protocol-fees': Cl.uint(0),
        })
      );
    });

    it('should allow different users to create markets', () => {
      fundWallet(wallet1, 10_000_000n);
      fundWallet(wallet2, 10_000_000n);

      // Wallet 1 creates market
      const result1 = simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Wallet1 Market'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        wallet1
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      // Wallet 2 creates market
      const result2 = simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Wallet2 Market'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        wallet2
      );
      expect(result2.result).toBeOk(Cl.uint(2));

      // Verify creators are correct
      const market1 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-market',
        [Cl.uint(1)],
        deployer
      );
      const m1 = (market1.result as any).value.value;
      expect(m1['creator']).toStrictEqual(Cl.standardPrincipal(wallet1));

      const market2 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-market',
        [Cl.uint(2)],
        deployer
      );
      const m2 = (market2.result as any).value.value;
      expect(m2['creator']).toStrictEqual(Cl.standardPrincipal(wallet2));
    });

    it('should return error for non-existent market', () => {
      const market = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-market',
        [Cl.uint(999)],
        deployer
      );

      expect(market.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should initialize liquidity parameter equal to initial liquidity', () => {
      const initialLiquidity = 10_000_000n;
      fundWallet(deployer, Number(initialLiquidity));

      simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(initialLiquidity),
        ],
        deployer
      );

      // Get market
      const market = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-market',
        [Cl.uint(1)],
        deployer
      );

      const m = (market.result as any).value.value;
      expect(m['liquidity-parameter']).toStrictEqual(Cl.uint(initialLiquidity));
    });

    it('should have correct initial prices (50% YES, 50% NO)', () => {
      fundWallet(deployer, 10_000_000n);

      simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      // Get prices
      const prices = simnet.callReadOnlyFn(
        'multi-market-pool',
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

    it('should allow creating multiple markets with different questions', () => {
      fundWallet(deployer, 30_000_000n);

      const questions = [
        'Will BTC reach $100k?',
        'Will ETH reach $10k?',
        'Will STX reach $10?',
      ];

      for (let i = 0; i < questions.length; i++) {
        const result = simnet.callPublicFn(
          'multi-market-pool',
          'create-market',
          [
            Cl.stringUtf8(questions[i]),
            Cl.uint(2000),
            Cl.uint(3000),
            Cl.uint(10_000_000n),
          ],
          deployer
        );
        expect(result.result).toBeOk(Cl.uint(i + 1));
      }

      // Verify all markets exist with correct questions
      for (let i = 0; i < questions.length; i++) {
        const market = simnet.callReadOnlyFn(
          'multi-market-pool',
          'get-market',
          [Cl.uint(i + 1)],
          deployer
        );
        const m = (market.result as any).value.value;
        expect(m['question']).toStrictEqual(Cl.stringUtf8(questions[i]));
      }
    });

    it('should verify market is active when created', () => {
      fundWallet(deployer, 10_000_000n);

      simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      // Check if market is active
      const active = simnet.callReadOnlyFn(
        'multi-market-pool',
        'is-market-active',
        [Cl.uint(1)],
        deployer
      );

      expect(active.result).toBeOk(Cl.bool(true));
    });

    it('should verify market is not resolved when created', () => {
      fundWallet(deployer, 10_000_000n);

      simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );

      // Get claim status
      const status = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-claim-status',
        [Cl.uint(1), Cl.standardPrincipal(deployer)],
        deployer
      );

      const s = (status.result as any).value.value;
      expect(s['is-resolved']).toStrictEqual(Cl.bool(false));
    });
  });

  describe('Multi-Market Pool - Read-Only Functions', () => {
    beforeEach(() => {
      fundWallet(deployer, 20_000_000n);
      // Create a market for testing
      simnet.callPublicFn(
        'multi-market-pool',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(10_000_000n),
        ],
        deployer
      );
    });

    describe('get-market-count', () => {
      it('should return correct market count', () => {
        const count = simnet.callReadOnlyFn('multi-market-pool', 'get-market-count', [], deployer);
        expect(count.result).toBeOk(Cl.uint(1));
      });
    });

    describe('get-reserves', () => {
      it('should return correct reserves', () => {
        const reserves = simnet.callReadOnlyFn(
          'multi-market-pool',
          'get-reserves',
          [Cl.uint(1)],
          deployer
        );

        expect(reserves.result).toBeOk(
          Cl.tuple({
            'yes-reserve': Cl.uint(5_000_000n),
            'no-reserve': Cl.uint(5_000_000n),
            'total-liquidity': Cl.uint(10_000_000n),
          })
        );
      });
    });

    describe('get-outcome-balance', () => {
      it('should return zero balance for user with no positions', () => {
        const balance = simnet.callReadOnlyFn(
          'multi-market-pool',
          'get-outcome-balance',
          [Cl.uint(1), Cl.standardPrincipal(wallet1), Cl.uint(0)],
          deployer
        );

        expect(balance.result).toBeOk(Cl.uint(0));
      });
    });

    describe('is-market-active', () => {
      it('should return true for active market', () => {
        const active = simnet.callReadOnlyFn(
          'multi-market-pool',
          'is-market-active',
          [Cl.uint(1)],
          deployer
        );

        expect(active.result).toBeOk(Cl.bool(true));
      });

      it('should return error for non-existent market', () => {
        const active = simnet.callReadOnlyFn(
          'multi-market-pool',
          'is-market-active',
          [Cl.uint(999)],
          deployer
        );

        expect(active.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
      });
    });

    describe('get-claim-status', () => {
      it('should return claim status for market', () => {
        const status = simnet.callReadOnlyFn(
          'multi-market-pool',
          'get-claim-status',
          [Cl.uint(1), Cl.standardPrincipal(deployer)],
          deployer
        );

        const s = (status.result as any).value.value;
        expect(s['is-resolved']).toStrictEqual(Cl.bool(false));
        expect(s['has-claimed']).toStrictEqual(Cl.bool(false));
        expect(s['winning-outcome']).toStrictEqual(Cl.none());
      });
    });

    describe('calculate-fee', () => {
      it('should calculate 1% fee correctly', () => {
        const fee = simnet.callReadOnlyFn(
          'multi-market-pool',
          'calculate-fee',
          [Cl.uint(1_000_000n)],
          deployer
        );

        // 1% of 1,000,000 = 10,000
        expect(fee.result).toBeOk(Cl.uint(10_000n));
      });
    });

    describe('calculate-lp-tokens', () => {
      it('should return 1:1 LP tokens for first deposit', () => {
        const lpTokens = simnet.callReadOnlyFn(
          'multi-market-pool',
          'calculate-lp-tokens',
          [Cl.uint(10_000_000n), Cl.uint(5_000_000n), Cl.uint(5_000_000n), Cl.uint(0)],
          deployer
        );

        expect(lpTokens.result).toBeOk(Cl.uint(10_000_000n));
      });

      it('should calculate proportional LP tokens for subsequent deposit', () => {
        const lpTokens = simnet.callReadOnlyFn(
          'multi-market-pool',
          'calculate-lp-tokens',
          [Cl.uint(5_000_000n), Cl.uint(5_000_000n), Cl.uint(5_000_000n), Cl.uint(10_000_000n)],
          deployer
        );

        // 5,000,000 * 10,000,000 / 10,000,000 = 5,000,000
        expect(lpTokens.result).toBeOk(Cl.uint(5_000_000n));
      });
    });
  });
});

describe('Multi-Market Pool - Add Liquidity', () => {
  let marketId: bigint;

  beforeEach(() => {
    simnet.blockHeight = 1000n;

    // Fund deployer and create a market
    fundWallet(deployer, 20_000_000n);
    const result = simnet.callPublicFn(
      'multi-market-pool',
      'create-market',
      [
        Cl.stringUtf8('Will BTC reach $100k?'),
        Cl.uint(2000),
        Cl.uint(3000),
        Cl.uint(10_000_000n),
      ],
      deployer
    );
    marketId = (result.result as any).value.value;
  });

  describe('add-liquidity', () => {
    it('should add liquidity and mint LP tokens proportionally', () => {
      const addAmount = 5_000_000n; // 5 USDC
      fundWallet(wallet1, Number(addAmount));

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(addAmount)],
        wallet1
      );

      // LP tokens should be proportional: (5000000 * 10000000) / 10000000 = 5000000
      const expectedLpTokens = 5_000_000n;
      expect(result.result).toBeOk(Cl.uint(expectedLpTokens));

      // Verify LP tokens were minted to wallet1
      const lpBalance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(lpBalance.result).toBeOk(Cl.uint(expectedLpTokens));

      // Verify reserves were updated
      const reserves = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      expect(reserves.result).toBeOk(
        Cl.tuple({
          'yes-reserve': Cl.uint(7_500_000n), // 5M + 2.5M
          'no-reserve': Cl.uint(7_500_000n), // 5M + 2.5M
          'total-liquidity': Cl.uint(15_000_000n), // 10M + 5M
        })
      );
    });

    it('should reject adding liquidity to non-existent market', () => {
      fundWallet(wallet1, 5_000_000n);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(999), Cl.uint(5_000_000n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject adding liquidity below minimum', () => {
      fundWallet(wallet1, 100_000n);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(50_000n)], // Less than MINIMUM_LIQUIDITY (100000)
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });

    it('should reject adding liquidity to resolved market', () => {
      // First, resolve the market by mining past resolution deadline
      simnet.blockHeight = 4000n;
      simnet.callPublicFn(
        'multi-market-pool',
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)], // YES wins
        deployer
      );

      fundWallet(wallet1, 5_000_000n);
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_RESOLVED));
    });

    it('should allow multiple users to add liquidity', () => {
      fundWallet(wallet1, 3_000_000n);
      fundWallet(wallet2, 2_000_000n);

      // Wallet 1 adds liquidity
      const result1 = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(3_000_000n)],
        wallet1
      );
      expect(result1.result).toBeOk(Cl.uint(3_000_000n));

      // Wallet 2 adds liquidity
      const result2 = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(2_000_000n)],
        wallet2
      );
      expect(result2.result).toBeOk(Cl.uint(2_000_000n));

      // Verify both users have LP tokens
      const lp1 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(lp1.result).toBeOk(Cl.uint(3_000_000n));

      const lp2 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(lp2.result).toBeOk(Cl.uint(2_000_000n));
    });

    it('should split added liquidity 50/50 between YES and NO', () => {
      const addAmount = 4_000_000n; // 4 USDC
      fundWallet(wallet1, Number(addAmount));

      simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(addAmount)],
        wallet1
      );

      const reserves = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const r = (reserves.result as any).value.value;

      // YES and NO should each increase by 2M (half of 4M)
      expect(Number((r['yes-reserve'] as any).value)).toBe(7_000_000n);
      expect(Number((r['no-reserve'] as any).value)).toBe(7_000_000n);
    });

    it('should allow adding liquidity with minimum amount', () => {
      const minAmount = 100_000n; // 0.1 USDC = MINIMUM_LIQUIDITY
      fundWallet(wallet1, Number(minAmount));

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(minAmount)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(minAmount));
    });

    it('should calculate LP tokens correctly for first addition', () => {
      // Initial liquidity is 10M, adding 5M
      const addAmount = 5_000_000n;
      fundWallet(wallet1, Number(addAmount));

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(addAmount)],
        wallet1
      );

      // (5M * 10M) / 10M = 5M LP tokens
      expect(result.result).toBeOk(Cl.uint(5_000_000n));
    });

    it('should calculate LP tokens correctly for subsequent additions', () => {
      // First addition: 10M -> 15M total
      fundWallet(wallet1, 5_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      // Second addition: 15M -> 20M total
      // LP tokens = (5M * 15M) / 15M = 5M
      fundWallet(wallet2, 5_000_000n);
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet2
      );

      expect(result.result).toBeOk(Cl.uint(5_000_000n));
    });

    it('should reject adding liquidity without sufficient USDCx balance', () => {
      // Don't fund wallet1

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      // The USDCx transfer will fail
      expect(result.result.type).toBe('error');
    });
  });
});

describe('Multi-Market Pool - Remove Liquidity', () => {
  let marketId: bigint;

  beforeEach(() => {
    simnet.blockHeight = 1000n;

    // Fund deployer and create a market
    fundWallet(deployer, 20_000_000n);
    const result = simnet.callPublicFn(
      'multi-market-pool',
      'create-market',
      [
        Cl.stringUtf8('Will BTC reach $100k?'),
        Cl.uint(2000),
        Cl.uint(3000),
        Cl.uint(10_000_000n),
      ],
      deployer
    );
    marketId = (result.result as any).value.value;
  });

  describe('remove-liquidity', () => {
    it('should remove liquidity and return USDC + fee share', () => {
      // First add some liquidity to accumulate fees
      fundWallet(wallet1, 5_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      // Simulate some trades to generate fees
      fundWallet(wallet2, 2_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet2
      );

      // Get LP balance before removal
      const lpBalanceBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(deployer)],
        deployer
      );
      const lpBefore = (lpBalanceBefore.result as any).value.value;
      const lpAmount = Number((lpBefore as any).value);

      // Remove liquidity
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(10_000_000n)],
        deployer
      );

      // Should return USDC from reserves + fee share
      expect(result.result.type).toBe('response');
      const returnedAmount = Number((result.result as any).value.value);
      expect(returnedAmount).toBeGreaterThan(0);

      // Verify LP tokens were burned
      const lpBalanceAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(deployer)],
        deployer
      );
      const lpAfter = (lpBalanceAfter.result as any).value.value;
      expect(Number((lpAfter as any).value)).toBe(0);
    });

    it('should reject removing liquidity from non-existent market', () => {
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(999), Cl.uint(5_000_000n)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject removing liquidity below minimum', () => {
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(50_000n)], // Less than MINIMUM_LIQUIDITY (100000)
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });

    it('should reject removing more LP tokens than owned', () => {
      // Try to remove more than deployer owns
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(20_000_000n)], // More than 10M LP tokens
        deployer
      );

      // The burn function in sip013-lp-token will fail with insufficient balance
      expect(result.result.type).toBe('error');
    });

    it('should allow partial liquidity removal', () => {
      // Add more liquidity
      fundWallet(wallet1, 5_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      // Remove partial liquidity (5M out of 10M LP tokens)
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        deployer
      );

      expect(result.result.type).toBe('response');

      // Verify remaining LP tokens
      const lpBalance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(deployer)],
        deployer
      );
      const lp = (lpBalance.result as any).value.value;
      expect(Number((lp as any).value)).toBe(5_000_000n);

      // Verify reserves decreased proportionally
      const reserves = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const r = (reserves.result as any).value.value;
      expect(Number((r['total-liquidity'] as any).value)).toBe(10_000_000n); // 15M - 5M removed
    });

    it('should calculate correct USDC return without fees', () => {
      // Remove half of initial liquidity
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        deployer
      );

      // Should return ~5M USDC (50% of reserves)
      // With equal reserves, should return 2.5M from YES and 2.5M from NO
      const returnedAmount = Number((result.result as any).value.value);
      expect(returnedAmount).toBeGreaterThan(4_900_000n);
      expect(returnedAmount).toBeLessThan(5_100_000n);
    });

    it('should reset accumulated fees after liquidity removal', () => {
      // Add liquidity to increase total
      fundWallet(wallet1, 5_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      // Generate some fees via trading
      fundWallet(wallet2, 2_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet2
      );

      // Get fees before removal
      const feesBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );

      // Remove liquidity
      simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(10_000_000n)],
        deployer
      );

      // Get fees after removal - should be reset to 0
      const feesAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );
      const f = (feesAfter.result as any).value.value;
      expect(Number((f['accumulated-fees'] as any).value)).toBe(0);
    });

    it('should split liquidity removal proportionally from YES and NO', () => {
      // Remove half of liquidity
      const removeAmount = 5_000_000n;
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(removeAmount)],
        deployer
      );

      // Get reserves after removal
      const reserves = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const r = (reserves.result as any).value.value;

      // Should have removed 2.5M from each reserve (50% of 5M)
      expect(Number((r['yes-reserve'] as any).value)).toBe(2_500_000n);
      expect(Number((r['no-reserve'] as any).value)).toBe(2_500_000n);
    });

    it('should allow removing liquidity with minimum amount', () => {
      // First add small amount to have more LP tokens
      fundWallet(wallet1, 1_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(1_000_000n)],
        wallet1
      );

      // Remove minimum amount
      const minAmount = 100_000n; // 0.1 USDC = MINIMUM_LIQUIDITY
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(minAmount)],
        deployer
      );

      expect(result.result.type).toBe('response');
    });

    it('should allow multiple users to remove liquidity independently', () => {
      // Add liquidity from multiple users
      fundWallet(wallet1, 3_000_000n);
      fundWallet(wallet2, 2_000_000n);

      simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(3_000_000n)],
        wallet1
      );

      simnet.callPublicFn(
        'multi-market-pool',
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(2_000_000n)],
        wallet2
      );

      // Remove liquidity from wallet1
      const result1 = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(3_000_000n)],
        wallet1
      );
      expect(result1.result.type).toBe('response');

      // Remove liquidity from wallet2
      const result2 = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(2_000_000n)],
        wallet2
      );
      expect(result2.result.type).toBe('response');

      // Verify both users have 0 LP tokens
      const lp1 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(Number(((lp1.result as any).value.value as any).value)).toBe(0);

      const lp2 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(Number(((lp2.result as any).value.value as any).value)).toBe(0);
    });

    it('should return correct amount when all liquidity is removed', () => {
      // Remove all liquidity
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(10_000_000n)],
        deployer
      );

      // Should return close to initial 10M USDC (minus small fees if any)
      const returnedAmount = Number((result.result as any).value.value);
      expect(returnedAmount).toBeGreaterThan(9_900_000n);
      expect(returnedAmount).toBeLessThan(10_100_000n);

      // Verify total liquidity is 0
      const reserves = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const r = (reserves.result as any).value.value;
      expect(Number((r['total-liquidity'] as any).value)).toBe(0);
    });
  });
});

describe('Multi-Market Pool - Buy Outcome', () => {
  let marketId: bigint;

  beforeEach(() => {
    simnet.blockHeight = 1000n;

    // Fund deployer and create a market
    fundWallet(deployer, 20_000_000n);
    const result = simnet.callPublicFn(
      'multi-market-pool',
      'create-market',
      [
        Cl.stringUtf8('Will BTC reach $100k?'),
        Cl.uint(2000),
        Cl.uint(3000),
        Cl.uint(10_000_000n),
      ],
      deployer
    );
    marketId = (result.result as any).value.value;
  });

  describe('buy-outcome', () => {
    it('should buy YES tokens correctly', () => {
      const amount = 2_000_000n; // 2 USDC
      fundWallet(wallet1, Number(amount));

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(amount), Cl.uint(1000n)], // outcome=0 (YES)
        wallet1
      );

      // Should receive YES tokens
      expect(result.result.type).toBe('response');
      const tokensReceived = Number((result.result as any).value.value);
      expect(tokensReceived).toBeGreaterThan(0);

      // Verify outcome balance was updated
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(tokensReceived));
    });

    it('should buy NO tokens correctly', () => {
      const amount = 2_000_000n; // 2 USDC
      fundWallet(wallet1, Number(amount));

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(amount), Cl.uint(1000n)], // outcome=1 (NO)
        wallet1
      );

      // Should receive NO tokens
      expect(result.result.type).toBe('response');
      const tokensReceived = Number((result.result as any).value.value);
      expect(tokensReceived).toBeGreaterThan(0);

      // Verify outcome balance was updated
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(tokensReceived));
    });

    it('should reject buying from non-existent market', () => {
      fundWallet(wallet1, 2_000_000n);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(999), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject buying with invalid outcome', () => {
      fundWallet(wallet1, 2_000_000n);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(2), Cl.uint(2_000_000n), Cl.uint(1000n)], // outcome=2 (invalid)
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });

    it('should reject buying after deadline', () => {
      fundWallet(wallet1, 2_000_000n);

      // Mine past deadline
      simnet.blockHeight = 2500n;

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_ACTIVE));
    });

    it('should reject buying when market is resolved', () => {
      fundWallet(wallet1, 2_000_000n);

      // Resolve the market first
      simnet.blockHeight = 2500n;
      simnet.callPublicFn(
        'multi-market-pool',
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)], // YES wins
        deployer
      );

      // Try to buy after resolution
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_RESOLVED));
    });

    it('should reject buying with zero amount', () => {
      fundWallet(wallet1, 2_000_000n);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(0), Cl.uint(1000n)], // amount=0
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject buying without sufficient USDCx balance', () => {
      // Don't fund wallet1

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      // The USDCx transfer will fail
      expect(result.result.type).toBe('error');
    });

    it('should reject buying when slippage protection is triggered', () => {
      fundWallet(wallet1, 2_000_000n);

      // Set very high minimum tokens out (more than possible)
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(10_000_000n)], // min-tokens-out too high
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_SLIPPAGE_TOO_HIGH));
    });

    it('should allow multiple users to buy tokens', () => {
      fundWallet(wallet1, 2_000_000n);
      fundWallet(wallet2, 3_000_000n);

      // Wallet 1 buys YES
      const result1 = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );
      expect(result1.result.type).toBe('response');

      // Wallet 2 buys NO
      const result2 = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(3_000_000n), Cl.uint(1000n)],
        wallet2
      );
      expect(result2.result.type).toBe('response');

      // Verify both users have their respective tokens
      const balance1 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      expect(Number((balance1.result as any).value.value)).toBeGreaterThan(0);

      const balance2 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet2), Cl.uint(1)],
        deployer
      );
      expect(Number((balance2.result as any).value.value)).toBeGreaterThan(0);
    });

    it('should accumulate trading fees correctly', () => {
      // Generate some fees via trading
      fundWallet(wallet1, 2_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      // Check accumulated fees
      const fees = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );
      const f = (fees.result as any).value.value;

      // 1% of 2M = 20,000 fee
      // 70% to LP (14,000), 10% to creator (2,000), 20% to protocol (4,000)
      expect(Number((f['accumulated-fees'] as any).value)).toBe(20_000n);
      expect(Number((f['creator-fees'] as any).value)).toBe(2_000n);
      expect(Number((f['protocol-fees'] as any).value)).toBe(4_000n);
    });

    it('should update reserves correctly after buying YES', () => {
      const amount = 2_000_000n;
      fundWallet(wallet1, Number(amount));

      // Get reserves before trade
      const reservesBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const rb = (reservesBefore.result as any).value.value;
      const yesBefore = Number((rb['yes-reserve'] as any).value);
      const noBefore = Number((rb['no-reserve'] as any).value);

      // Buy YES tokens
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(amount), Cl.uint(1000n)],
        wallet1
      );

      // Get reserves after trade
      const reservesAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const ra = (reservesAfter.result as any).value.value;
      const yesAfter = Number((ra['yes-reserve'] as any).value);
      const noAfter = Number((ra['no-reserve'] as any).value);

      // YES reserve should increase (amount minus fee)
      expect(yesAfter).toBeGreaterThan(yesBefore);
      // NO reserve should decrease (tokens out)
      expect(noAfter).toBeLessThan(noBefore);
    });

    it('should update reserves correctly after buying NO', () => {
      const amount = 2_000_000n;
      fundWallet(wallet1, Number(amount));

      // Get reserves before trade
      const reservesBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const rb = (reservesBefore.result as any).value.value;
      const yesBefore = Number((rb['yes-reserve'] as any).value);
      const noBefore = Number((rb['no-reserve'] as any).value);

      // Buy NO tokens
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(amount), Cl.uint(1000n)],
        wallet1
      );

      // Get reserves after trade
      const reservesAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const ra = (reservesAfter.result as any).value.value;
      const yesAfter = Number((ra['yes-reserve'] as any).value);
      const noAfter = Number((ra['no-reserve'] as any).value);

      // NO reserve should increase (amount minus fee)
      expect(noAfter).toBeGreaterThan(noBefore);
      // YES reserve should decrease (tokens out)
      expect(yesAfter).toBeLessThan(yesBefore);
    });

    it('should allow buying from same user multiple times', () => {
      fundWallet(wallet1, 5_000_000n);

      // First buy
      const result1 = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );
      const tokens1 = Number((result1.result as any).value.value);

      // Second buy
      const result2 = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(3_000_000n), Cl.uint(1000n)],
        wallet1
      );
      const tokens2 = Number((result2.result as any).value.value);

      // Verify total balance is sum of both buys
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      expect(Number((balance.result as any).value.value)).toBe(tokens1 + tokens2);
    });

    it('should work with minimum amount', () => {
      const minAmount = 100_000n; // 0.1 USDC
      fundWallet(wallet1, Number(minAmount));

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(minAmount), Cl.uint(1n)],
        wallet1
      );

      expect(result.result.type).toBe('response');
    });
  });
});

describe('Multi-Market Pool - Sell Outcome', () => {
  let marketId: bigint;

  beforeEach(() => {
    simnet.blockHeight = 1000n;

    // Fund deployer and create a market
    fundWallet(deployer, 20_000_000n);
    const result = simnet.callPublicFn(
      'multi-market-pool',
      'create-market',
      [
        Cl.stringUtf8('Will BTC reach $100k?'),
        Cl.uint(2000),
        Cl.uint(3000),
        Cl.uint(10_000_000n),
      ],
      deployer
    );
    marketId = (result.result as any).value.value;
  });

  describe('sell-outcome', () => {
    it('should sell YES tokens correctly', () => {
      // First buy some YES tokens
      const buyAmount = 2_000_000n; // 2 USDC
      fundWallet(wallet1, Number(buyAmount));
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(buyAmount), Cl.uint(1000n)], // outcome=0 (YES)
        wallet1
      );

      // Get the balance after buying
      const balanceBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensOwned = Number((balanceBefore.result as any).value.value);

      // Sell half of the tokens
      const sellAmount = tokensOwned / 2n;
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(sellAmount), Cl.uint(1n)], // outcome=0 (YES)
        wallet1
      );

      // Should receive USDC
      expect(result.result.type).toBe('response');
      const usdcReceived = Number((result.result as any).value.value);
      expect(usdcReceived).toBeGreaterThan(0);

      // Verify outcome balance was updated
      const balanceAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const remainingTokens = Number((balanceAfter.result as any).value.value);
      expect(remainingTokens).toBe(tokensOwned - Number(sellAmount));
    });

    it('should sell NO tokens correctly', () => {
      // First buy some NO tokens
      const buyAmount = 2_000_000n; // 2 USDC
      fundWallet(wallet1, Number(buyAmount));
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(buyAmount), Cl.uint(1000n)], // outcome=1 (NO)
        wallet1
      );

      // Get the balance after buying
      const balanceBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      const tokensOwned = Number((balanceBefore.result as any).value.value);

      // Sell half of the tokens
      const sellAmount = tokensOwned / 2n;
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(sellAmount), Cl.uint(1n)], // outcome=1 (NO)
        wallet1
      );

      // Should receive USDC
      expect(result.result.type).toBe('response');
      const usdcReceived = Number((result.result as any).value.value);
      expect(usdcReceived).toBeGreaterThan(0);

      // Verify outcome balance was updated
      const balanceAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      const remainingTokens = Number((balanceAfter.result as any).value.value);
      expect(remainingTokens).toBe(tokensOwned - Number(sellAmount));
    });

    it('should reject selling from non-existent market', () => {
      fundWallet(wallet1, 2_000_000n);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(999), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject selling with invalid outcome', () => {
      fundWallet(wallet1, 2_000_000n);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(2), Cl.uint(2_000_000n), Cl.uint(1n)], // outcome=2 (invalid)
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });

    it('should reject selling after deadline', () => {
      // First buy some tokens
      fundWallet(wallet1, 2_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      // Mine past deadline
      simnet.blockHeight = 2500n;

      // Try to sell
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensOwned = (balance.result as any).value.value;

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokensOwned), Cl.uint(1n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_ACTIVE));
    });

    it('should reject selling when market is resolved', () => {
      // First buy some tokens
      fundWallet(wallet1, 2_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      // Resolve the market first
      simnet.blockHeight = 2500n;
      simnet.callPublicFn(
        'multi-market-pool',
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)], // YES wins
        deployer
      );

      // Try to sell after resolution
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensOwned = (balance.result as any).value.value;

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokensOwned), Cl.uint(1n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_RESOLVED));
    });

    it('should reject selling with zero amount', () => {
      fundWallet(wallet1, 2_000_000n);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(0), Cl.uint(1n)], // amount=0
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject selling more tokens than owned', () => {
      // First buy some tokens
      fundWallet(wallet1, 2_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      // Try to sell more than owned
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensOwned = Number((balance.result as any).value.value);

      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokensOwned + 1_000_000n), Cl.uint(1n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });

    it('should reject selling when slippage protection is triggered', () => {
      // First buy some tokens
      fundWallet(wallet1, 2_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      // Get balance
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensOwned = (balance.result as any).value.value;

      // Set very high minimum USDC out (more than possible)
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokensOwned), Cl.uint(10_000_000n)], // min-usdc-out too high
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_SLIPPAGE_TOO_HIGH));
    });

    it('should allow multiple users to sell tokens', () => {
      // Both users buy tokens
      fundWallet(wallet1, 2_000_000n);
      fundWallet(wallet2, 2_000_000n);

      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet2
      );

      // Get balances
      const balance1 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokens1 = (balance1.result as any).value.value;

      const balance2 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet2), Cl.uint(1)],
        deployer
      );
      const tokens2 = (balance2.result as any).value.value;

      // Both users sell their tokens
      const result1 = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokens1), Cl.uint(1n)],
        wallet1
      );
      expect(result1.result.type).toBe('response');

      const result2 = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(tokens2), Cl.uint(1n)],
        wallet2
      );
      expect(result2.result.type).toBe('response');

      // Verify both users have 0 tokens
      const finalBalance1 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      expect(Number((finalBalance1.result as any).value.value)).toBe(0);

      const finalBalance2 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet2), Cl.uint(1)],
        deployer
      );
      expect(Number((finalBalance2.result as any).value.value)).toBe(0);
    });

    it('should accumulate trading fees on sell', () => {
      // First buy some tokens
      fundWallet(wallet1, 2_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(1000n)],
        wallet1
      );

      // Get fees before selling
      const feesBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );
      const fb = (feesBefore.result as any).value.value;
      const feesBeforeBuy = Number((fb['accumulated-fees'] as any).value);

      // Get tokens owned
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensOwned = (balance.result as any).value.value;

      // Sell all tokens
      simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokensOwned), Cl.uint(1n)],
        wallet1
      );

      // Check accumulated fees after selling
      const feesAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-accumulated-fees',
        [Cl.uint(marketId)],
        deployer
      );
      const fa = (feesAfter.result as any).value.value;
      const feesAfterSell = Number((fa['accumulated-fees'] as any).value);

      // Fees should have increased (buy fee + sell fee)
      expect(feesAfterSell).toBeGreaterThan(feesBeforeBuy);
    });

    it('should update reserves correctly after selling YES', () => {
      // First buy some YES tokens
      const buyAmount = 2_000_000n;
      fundWallet(wallet1, Number(buyAmount));
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(buyAmount), Cl.uint(1000n)],
        wallet1
      );

      // Get reserves before selling
      const reservesBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const rb = (reservesBefore.result as any).value.value;
      const yesBefore = Number((rb['yes-reserve'] as any).value);
      const noBefore = Number((rb['no-reserve'] as any).value);

      // Get tokens owned
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensOwned = (balance.result as any).value.value;

      // Sell YES tokens
      simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokensOwned), Cl.uint(1n)],
        wallet1
      );

      // Get reserves after selling
      const reservesAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const ra = (reservesAfter.result as any).value.value;
      const yesAfter = Number((ra['yes-reserve'] as any).value);
      const noAfter = Number((ra['no-reserve'] as any).value);

      // YES reserve should decrease (tokens sold)
      expect(yesAfter).toBeLessThan(yesBefore);
      // NO reserve should increase (USDC from fees)
      expect(noAfter).toBeGreaterThan(noBefore);
    });

    it('should update reserves correctly after selling NO', () => {
      // First buy some NO tokens
      const buyAmount = 2_000_000n;
      fundWallet(wallet1, Number(buyAmount));
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(buyAmount), Cl.uint(1000n)],
        wallet1
      );

      // Get reserves before selling
      const reservesBefore = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const rb = (reservesBefore.result as any).value.value;
      const yesBefore = Number((rb['yes-reserve'] as any).value);
      const noBefore = Number((rb['no-reserve'] as any).value);

      // Get tokens owned
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      const tokensOwned = (balance.result as any).value.value;

      // Sell NO tokens
      simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(tokensOwned), Cl.uint(1n)],
        wallet1
      );

      // Get reserves after selling
      const reservesAfter = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-reserves',
        [Cl.uint(marketId)],
        deployer
      );
      const ra = (reservesAfter.result as any).value.value;
      const yesAfter = Number((ra['yes-reserve'] as any).value);
      const noAfter = Number((ra['no-reserve'] as any).value);

      // NO reserve should decrease (tokens sold)
      expect(noAfter).toBeLessThan(noBefore);
      // YES reserve should increase (USDC from fees)
      expect(yesAfter).toBeGreaterThan(yesBefore);
    });

    it('should allow selling from same user multiple times', () => {
      // Buy tokens first
      fundWallet(wallet1, 5_000_000n);
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(5_000_000n), Cl.uint(1000n)],
        wallet1
      );

      // First sell
      const balance1 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokens1 = (balance1.result as any).value.value;

      const result1 = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokens1 / 2n), Cl.uint(1n)],
        wallet1
      );
      expect(result1.result.type).toBe('response');

      // Second sell
      const balance2 = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokens2 = (balance2.result as any).value.value;

      const result2 = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokens2), Cl.uint(1n)],
        wallet1
      );
      expect(result2.result.type).toBe('response');

      // Verify final balance is 0
      const finalBalance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      expect(Number((finalBalance.result as any).value.value)).toBe(0);
    });

    it('should handle round-trip buy and sell', () => {
      const initialUsdc = 5_000_000n;
      fundWallet(wallet1, Number(initialUsdc));

      // Buy YES tokens
      const buyResult = simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(initialUsdc), Cl.uint(1n)],
        wallet1
      );
      const tokensBought = Number((buyResult.result as any).value.value);

      // Sell all YES tokens
      const sellResult = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokensBought), Cl.uint(1n)],
        wallet1
      );
      const usdcReturned = Number((sellResult.result as any).value.value);

      // Should receive less USDC than initially spent (due to fees)
      expect(usdcReturned).toBeLessThan(Number(initialUsdc));

      // But should receive more than 90% of initial (fees are ~2% total: 1% buy + 1% sell)
      expect(usdcReturned).toBeGreaterThan(Number(initialUsdc) * 90n / 100n);
    });

    it('should work with minimum amount', () => {
      // First buy small amount
      const minAmount = 100_000n; // 0.1 USDC
      fundWallet(wallet1, Number(minAmount));
      simnet.callPublicFn(
        'multi-market-pool',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(minAmount), Cl.uint(1n)],
        wallet1
      );

      // Get tokens owned
      const balance = simnet.callReadOnlyFn(
        'multi-market-pool',
        'get-outcome-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensOwned = (balance.result as any).value.value;

      // Sell minimum amount
      const result = simnet.callPublicFn(
        'multi-market-pool',
        'sell-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(tokensOwned), Cl.uint(1n)],
        wallet1
      );

      expect(result.result.type).toBe('response');
    });
  });
});
