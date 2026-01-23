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
const ERR_INVALID_QUESTION = 4012n;
const ERR_INVALID_DEADLINE = 4013n;
const ERR_INSUFFICIENT_LIQUIDITY = 4006n;
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
