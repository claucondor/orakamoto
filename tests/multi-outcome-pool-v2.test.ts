import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const MINIMUM_INITIAL_LIQUIDITY = 1_000_000n; // 1 USDC with 6 decimals
const MINIMUM_LIQUIDITY = 100_000n; // 0.1 USDC
const DISPUTE_WINDOW = 1008n; // ~7 days in blocks
const MULTI_OUTCOME_ID_OFFSET = 1_000_000n;

// Error constants from multi-outcome-pool-v2
const ERR_MARKET_NOT_FOUND = 6000n;
const ERR_MARKET_NOT_ACTIVE = 6001n;
const ERR_MARKET_ALREADY_RESOLVED = 6002n;
const ERR_DEADLINE_NOT_PASSED = 6003n;
const ERR_INVALID_OUTCOME = 6004n;
const ERR_INSUFFICIENT_BALANCE = 6005n;
const ERR_INSUFFICIENT_LIQUIDITY = 6006n;
const ERR_ZERO_AMOUNT = 6007n;
const ERR_SLIPPAGE_TOO_HIGH = 6008n;
const ERR_ALREADY_CLAIMED = 6009n;
const ERR_NO_WINNINGS = 6010n;
const ERR_DISPUTE_WINDOW_ACTIVE = 6011n;
const ERR_INVALID_QUESTION = 6012n;
const ERR_INVALID_DEADLINE = 6013n;
const ERR_INVALID_OUTCOME_COUNT = 6014n;
const ERR_INVALID_LABELS = 6015n;
const ERR_NOT_AUTHORIZED = 6016n;

// Helper function to give a wallet USDC via faucet
function fundWallet(wallet: string, amount: number) {
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

// Setup: Authorize multi-outcome-pool-v2 to mint/burn LP tokens
const MULTI_OUTCOME_POOL_V2_PRINCIPAL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.multi-outcome-pool-v2';

// Function to ensure LP token authorization
function ensureLpTokenSetup() {
  const checkResult = simnet.callReadOnlyFn(
    'sip013-lp-token',
    'get-authorized-minter',
    [],
    deployer
  );

  // If not already set to multi-outcome-pool-v2, set it
  const currentMinter = (checkResult.result as any).value;
  if (!currentMinter || currentMinter.value !== MULTI_OUTCOME_POOL_V2_PRINCIPAL) {
    const authResult = simnet.callPublicFn(
      'sip013-lp-token',
      'set-authorized-minter',
      [Cl.contractPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'multi-outcome-pool-v2')],
      deployer
    );
    console.log('LP token auth result for multi-outcome-pool-v2:', authResult.result);
  }
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

describe('Multi-Outcome Pool V2 - Create Market', () => {
  describe('create-market', () => {
    it('should create market correctly with 3 outcomes', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = BigInt(currentBlock + 1000);
      const resolutionDeadline = BigInt(currentBlock + 2000);
      const initialLiquidity = 10_000_000n; // 10 USDC
      const outcomeCount = 3;
      const lmsrB = 5_000_000n; // 5 (scaled by PRECISION)

      const outcomeLabels = [
        Cl.stringUtf8('Yes'),
        Cl.stringUtf8('No'),
        Cl.stringUtf8('Maybe'),
      ];

      // Fund the deployer wallet
      fundWallet(deployer, Number(initialLiquidity));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k by end of 2025?'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(initialLiquidity),
          Cl.uint(outcomeCount),
          Cl.list(outcomeLabels),
          Cl.uint(lmsrB),
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(1)); // First market has ID 1

      // Verify market was created correctly
      const market = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-market',
        [Cl.uint(1)],
        deployer
      );

      const marketData = (market.result as any).value;
      expect(marketData.value['question'].value).toBe('Will BTC reach $100k by end of 2025?');
      expect(marketData.value['outcome-count'].value).toBe(outcomeCount);
      expect(marketData.value['created-at'].value).toBeGreaterThan(0);

      // Verify market count incremented
      const count = simnet.callReadOnlyFn('multi-outcome-pool-v2', 'get-market-count', [], deployer);
      expect(count.result).toBeOk(Cl.uint(1));

      // Verify LP tokens were minted to creator
      const lpBalance = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-lp-balance',
        [Cl.uint(1), Cl.standardPrincipal(deployer)],
        deployer
      );
      expect(lpBalance.result).toBeOk(Cl.uint(initialLiquidity));
    });

    it('should create market correctly with 5 outcomes', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = BigInt(currentBlock + 1000);
      const resolutionDeadline = BigInt(currentBlock + 2000);
      const initialLiquidity = 10_000_000n;
      const outcomeCount = 5;
      const lmsrB = 5_000_000n;

      const outcomeLabels = [
        Cl.stringUtf8('A'),
        Cl.stringUtf8('B'),
        Cl.stringUtf8('C'),
        Cl.stringUtf8('D'),
        Cl.stringUtf8('E'),
      ];

      fundWallet(deployer, Number(initialLiquidity));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Which option will be chosen?'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(initialLiquidity),
          Cl.uint(outcomeCount),
          Cl.list(outcomeLabels),
          Cl.uint(lmsrB),
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(2)); // Second market has ID 2

      // Verify outcome count
      const market = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-market',
        [Cl.uint(2)],
        deployer
      );

      const marketData = (market.result as any).value;
      expect(marketData.value['outcome-count'].value).toBe(5);
    });

    it('should create market correctly with 10 outcomes (max)', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = BigInt(currentBlock + 1000);
      const resolutionDeadline = BigInt(currentBlock + 2000);
      const initialLiquidity = 10_000_000n;
      const outcomeCount = 10;
      const lmsrB = 5_000_000n;

      const outcomeLabels = [
        Cl.stringUtf8('0'), Cl.stringUtf8('1'), Cl.stringUtf8('2'), Cl.stringUtf8('3'),
        Cl.stringUtf8('4'), Cl.stringUtf8('5'), Cl.stringUtf8('6'), Cl.stringUtf8('7'),
        Cl.stringUtf8('8'), Cl.stringUtf8('9'),
      ];

      fundWallet(deployer, Number(initialLiquidity));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('What number will be rolled?'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(initialLiquidity),
          Cl.uint(outcomeCount),
          Cl.list(outcomeLabels),
          Cl.uint(lmsrB),
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(3));

      const market = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-market',
        [Cl.uint(3)],
        deployer
      );

      const marketData = (market.result as any).value;
      expect(marketData.value['outcome-count'].value).toBe(10);
    });

    it('should reject creation with empty question', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8(''),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
          Cl.uint(2),
          Cl.list([Cl.stringUtf8('Yes'), Cl.stringUtf8('No')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_QUESTION));
    });

    it('should reject creation with deadline in the past', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(0), // deadline of 0 is in the past
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
          Cl.uint(2),
          Cl.list([Cl.stringUtf8('Yes'), Cl.stringUtf8('No')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_DEADLINE));
    });

    it('should reject creation with resolution-deadline before deadline', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(3000),
          Cl.uint(2000), // Before deadline
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
          Cl.uint(2),
          Cl.list([Cl.stringUtf8('Yes'), Cl.stringUtf8('No')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_DEADLINE));
    });

    it('should reject creation with insufficient liquidity', () => {
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(500_000n), // Less than MINIMUM_INITIAL_LIQUIDITY
          Cl.uint(2),
          Cl.list([Cl.stringUtf8('Yes'), Cl.stringUtf8('No')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });

    it('should reject creation with less than 2 outcomes', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
          Cl.uint(1), // Less than MIN_OUTCOMES
          Cl.list([Cl.stringUtf8('Yes')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME_COUNT));
    });

    it('should reject creation with more than 10 outcomes', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Which outcome?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
          Cl.uint(11), // More than MAX_OUTCOMES
          Cl.list([
            Cl.stringUtf8('0'), Cl.stringUtf8('1'), Cl.stringUtf8('2'), Cl.stringUtf8('3'),
            Cl.stringUtf8('4'), Cl.stringUtf8('5'), Cl.stringUtf8('6'), Cl.stringUtf8('7'),
            Cl.stringUtf8('8'), Cl.stringUtf8('9'),
          ]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME_COUNT));
    });

    it('should reject creation with mismatched labels length', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
          Cl.uint(3), // 3 outcomes
          Cl.list([Cl.stringUtf8('Yes'), Cl.stringUtf8('No')]), // Only 2 labels
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_LABELS));
    });

    it('should reject creation with zero lmsr-b parameter', () => {
      fundWallet(deployer, Number(MINIMUM_INITIAL_LIQUIDITY));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(2000),
          Cl.uint(3000),
          Cl.uint(MINIMUM_INITIAL_LIQUIDITY),
          Cl.uint(2),
          Cl.list([Cl.stringUtf8('Yes'), Cl.stringUtf8('No')]),
          Cl.uint(0), // Zero lmsr-b
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });
  });
});

describe('Multi-Outcome Pool V2 - Read-Only Functions', () => {
  beforeEach(() => {
    // Create a test market
    fundWallet(deployer, 10_000_000);
    simnet.callPublicFn(
      'multi-outcome-pool-v2',
      'create-market',
      [
        Cl.stringUtf8('Test Market'),
        Cl.uint(2000),
        Cl.uint(3000),
        Cl.uint(10_000_000n),
        Cl.uint(3),
        Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
        Cl.uint(5_000_000n),
      ],
      deployer
    );
  });

  describe('get-market', () => {
    it('should return market data for existing market', () => {
      const market = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-market',
        [Cl.uint(1)],
        deployer
      );

      expect(market.result).toBeOk();
      const marketData = (market.result as any).value;
      expect(marketData.value['question'].value).toBe('Test Market');
      expect(marketData.value['outcome-count'].value).toBe(3);
      expect(marketData.value['is-resolved'].value).toBe(false);
    });

    it('should return error for non-existent market', () => {
      const market = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-market',
        [Cl.uint(999)],
        deployer
      );

      expect(market.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });
  });

  describe('get-market-count', () => {
    it('should return correct market count', () => {
      const count = simnet.callReadOnlyFn('multi-outcome-pool-v2', 'get-market-count', [], deployer);
      expect(count.result).toBeOk(Cl.uint(1));
    });
  });

  describe('get-outcome-prices', () => {
    it('should return prices for all outcomes', () => {
      const prices = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-outcome-prices',
        [Cl.uint(1)],
        deployer
      );

      expect(prices.result).toBeOk();
      const pricesList = (prices.result as any).value.value;
      // With equal reserves, prices should be approximately equal (1/3 each with 3 outcomes)
      // Price is scaled by PRECISION (1000000)
      expect(pricesList.length).toBe(10);
    });
  });

  describe('get-outcome-reserves', () => {
    it('should return reserves for all outcomes', () => {
      const reserves = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-outcome-reserves',
        [Cl.uint(1)],
        deployer
      );

      expect(reserves.result).toBeOk();
      const reservesData = (reserves.result as any).value.value;
      // Initial liquidity is 10M, split equally among 3 outcomes = ~3.33M each
      expect(reservesData['reserve-0'].value).toBeGreaterThan(0);
      expect(reservesData['reserve-1'].value).toBeGreaterThan(0);
      expect(reservesData['reserve-2'].value).toBeGreaterThan(0);
    });
  });

  describe('get-outcome-balance', () => {
    it('should return zero balance for user with no tokens', () => {
      const balance = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-outcome-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );

      expect(balance.result).toBeOk(Cl.uint(0));
    });
  });

  describe('is-market-active', () => {
    it('should return true for active market', () => {
      const isActive = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'is-market-active',
        [Cl.uint(1)],
        deployer
      );

      expect(isActive.result).toBeOk(Cl.bool(true));
    });

    it('should return error for non-existent market', () => {
      const isActive = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'is-market-active',
        [Cl.uint(999)],
        deployer
      );

      expect(isActive.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });
  });

  describe('get-accumulated-fees', () => {
    it('should return zero fees for new market', () => {
      const fees = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-accumulated-fees',
        [Cl.uint(1)],
        deployer
      );

      expect(fees.result).toBeOk();
      const feesData = (fees.result as any).value.value;
      expect(feesData['accumulated-fees'].value).toBe(0);
      expect(feesData['creator-fees'].value).toBe(0);
      expect(feesData['protocol-fees'].value).toBe(0);
    });
  });
});

describe('Multi-Outcome Pool V2 - Add Liquidity', () => {
  beforeEach(() => {
    // Create a test market
    fundWallet(deployer, 10_000_000);
    simnet.callPublicFn(
      'multi-outcome-pool-v2',
      'create-market',
      [
        Cl.stringUtf8('Test Market'),
        Cl.uint(2000),
        Cl.uint(3000),
        Cl.uint(10_000_000n),
        Cl.uint(3),
        Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
        Cl.uint(5_000_000n),
      ],
      deployer
    );
  });

  describe('add-liquidity', () => {
    it('should add liquidity and mint LP tokens', () => {
      const addAmount = 5_000_000n; // 5 USDC

      fundWallet(wallet1, Number(addAmount));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'add-liquidity',
        [Cl.uint(1), Cl.uint(addAmount)],
        wallet1
      );

      expect(result.result).toBeOk();

      // Verify LP tokens were minted
      const lpBalance = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-lp-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(lpBalance.result).toBeOk();
      expect((lpBalance.result as any).value.value).toBeGreaterThan(0);
    });

    it('should reject adding liquidity to non-existent market', () => {
      fundWallet(wallet1, 5_000_000);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'add-liquidity',
        [Cl.uint(999), Cl.uint(5_000_000n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject adding liquidity below minimum', () => {
      fundWallet(wallet1, Number(MINIMUM_LIQUIDITY) - 1);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'add-liquidity',
        [Cl.uint(1), Cl.uint(MINIMUM_LIQUIDITY - 1n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });
  });
});

describe('Multi-Outcome Pool V2 - Buy Outcome', () => {
  beforeEach(() => {
    // Create a test market
    fundWallet(deployer, 10_000_000);
    simnet.callPublicFn(
      'multi-outcome-pool-v2',
      'create-market',
      [
        Cl.stringUtf8('Test Market'),
        Cl.uint(5000),
        Cl.uint(6000),
        Cl.uint(10_000_000n),
        Cl.uint(3),
        Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
        Cl.uint(5_000_000n),
      ],
      deployer
    );
  });

  describe('buy-outcome', () => {
    it('should buy outcome tokens correctly', () => {
      const buyAmount = 1_000_000n; // 1 USDC

      fundWallet(wallet1, Number(buyAmount));

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(1), Cl.uint(0), Cl.uint(buyAmount), Cl.uint(buyAmount)],
        wallet1
      );

      expect(result.result).toBeOk();

      // Verify outcome balance increased
      const balance = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-outcome-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      expect(balance.result).toBeOk();
      expect((balance.result as any).value.value).toBeGreaterThan(0);
    });

    it('should reject buying from non-existent market', () => {
      fundWallet(wallet1, 1_000_000);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(999), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(1_000_000n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject buying with invalid outcome', () => {
      fundWallet(wallet1, 1_000_000);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(1), Cl.uint(5), Cl.uint(1_000_000n), Cl.uint(1_000_000n)], // Market has 3 outcomes (0-2)
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });

    it('should reject buying with zero amount', () => {
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(1), Cl.uint(0), Cl.uint(0), Cl.uint(0)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject buying when max-cost is exceeded', () => {
      fundWallet(wallet1, 1_000_000);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(1), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(500_000n)], // max-cost < amount
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_SLIPPAGE_TOO_HIGH));
    });
  });
});

describe('Multi-Outcome Pool V2 - Sell Outcome', () => {
  beforeEach(() => {
    // Create a test market and buy some tokens
    fundWallet(deployer, 10_000_000);
    simnet.callPublicFn(
      'multi-outcome-pool-v2',
      'create-market',
      [
        Cl.stringUtf8('Test Market'),
        Cl.uint(5000),
        Cl.uint(6000),
        Cl.uint(10_000_000n),
        Cl.uint(3),
        Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
        Cl.uint(5_000_000n),
      ],
      deployer
    );

    // Buy some outcome tokens
    fundWallet(wallet1, 2_000_000);
    simnet.callPublicFn(
      'multi-outcome-pool-v2',
      'buy-outcome',
      [Cl.uint(1), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(2_000_000n)],
      wallet1
    );
  });

  describe('sell-outcome', () => {
    it('should sell outcome tokens correctly', () => {
      // Get current balance
      const balanceBefore = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-outcome-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1), Cl.uint(0)],
        deployer
      );
      const tokensToSell = (balanceBefore.result as any).value.value / 2n; // Sell half

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'sell-outcome',
        [Cl.uint(1), Cl.uint(0), Cl.uint(tokensToSell), Cl.uint(0)],
        wallet1
      );

      expect(result.result).toBeOk();
    });

    it('should reject selling from non-existent market', () => {
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'sell-outcome',
        [Cl.uint(999), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should reject selling with invalid outcome', () => {
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'sell-outcome',
        [Cl.uint(1), Cl.uint(5), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });

    it('should reject selling more tokens than owned', () => {
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'sell-outcome',
        [Cl.uint(1), Cl.uint(0), Cl.uint(999_999_999_999n), Cl.uint(0)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });
  });
});

describe('Multi-Outcome Pool V2 - Resolve Market', () => {
  beforeEach(() => {
    // Create a test market with deadline at block 100
    fundWallet(deployer, 10_000_000);
    simnet.callPublicFn(
      'multi-outcome-pool-v2',
      'create-market',
      [
        Cl.stringUtf8('Test Market'),
        Cl.uint(100),
        Cl.uint(200),
        Cl.uint(10_000_000n),
        Cl.uint(3),
        Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
        Cl.uint(5_000_000n),
      ],
      deployer
    );
  });

  describe('resolve', () => {
    it('should allow creator to resolve after deadline', () => {
      // Mine blocks to pass deadline
      mineToBlockHeight(101);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(1), Cl.uint(0)], // Outcome 0 wins
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify market is resolved
      const market = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-market',
        [Cl.uint(1)],
        deployer
      );
      const marketData = (market.result as any).value;
      expect(marketData.value['is-resolved'].value).toBe(true);
      expect(marketData.value['winning-outcome'].value.value).toBe(0);
    });

    it('should reject resolving before deadline', () => {
      // Current block height is less than deadline (100)
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(1), Cl.uint(0)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DEADLINE_NOT_PASSED));
    });

    it('should reject resolving by non-creator', () => {
      mineToBlockHeight(101);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(1), Cl.uint(0)],
        wallet1 // Not the creator
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject resolving already resolved market', () => {
      mineToBlockHeight(101);

      // First resolve
      simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(1), Cl.uint(0)],
        deployer
      );

      // Try to resolve again
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(1), Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_RESOLVED));
    });

    it('should reject resolving with invalid outcome', () => {
      mineToBlockHeight(101);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(1), Cl.uint(5)], // Market has 3 outcomes (0-2)
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });
  });
});

describe('Multi-Outcome Pool V2 - Claim Winnings', () => {
  describe('claim', () => {
    it('should allow winner to claim after dispute window', () => {
      // Create a test market with deadline at current block + 10
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resolutionDeadline = deadline + 10;

      fundWallet(deployer, 10_000_000);
      const createResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(10_000_000n),
          Cl.uint(3),
          Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );
      const marketId = (createResult.result as any).value.value;

      // Buy winning tokens for wallet1
      fundWallet(wallet1, 2_000_000);
      simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(2_000_000n)],
        wallet1
      );

      // Mine past deadline and resolve
      mineToBlockHeight(deadline + 1);
      simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      // Verify market is resolved
      const market = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      const marketData = (market.result as any).value;
      expect(marketData.value['is-resolved'].value).toBe(true);

      // Mine blocks to pass dispute window
      mineToBlockHeight(deadline + 1 + Number(DISPUTE_WINDOW) + 1);

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'claim',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeOk();
      expect((result.result as any).value.value).toBeGreaterThan(0);
    });

    it('should reject claiming during dispute window', () => {
      // Create a test market with a guaranteed future deadline
      const deadline = 10000;
      const resolutionDeadline = 10100;

      fundWallet(deployer, 10_000_000);
      const createResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(10_000_000n),
          Cl.uint(3),
          Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );
      const marketId = (createResult.result as any).value.value;

      // Buy winning tokens for wallet1
      fundWallet(wallet1, 2_000_000);
      simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(2_000_000n)],
        wallet1
      );

      // Mine past deadline and resolve
      mineToBlockHeight(deadline + 1);
      const resolveResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );
      // Verify resolve succeeded
      expect(resolveResult.result).toBeOk();

      // Try to claim while still within dispute window
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'claim',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_ACTIVE));
    });

    it('should reject claiming twice', () => {
      // Create a test market with a guaranteed future deadline
      const deadline = 11000;
      const resolutionDeadline = 11100;

      fundWallet(deployer, 10_000_000);
      const createResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(10_000_000n),
          Cl.uint(3),
          Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );
      const marketId = (createResult.result as any).value.value;

      // Buy winning tokens for wallet1
      fundWallet(wallet1, 2_000_000);
      simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(2_000_000n)],
        wallet1
      );

      // Mine past deadline and resolve
      mineToBlockHeight(deadline + 1);
      const resolveResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );
      expect(resolveResult.result).toBeOk();

      // Mine blocks to pass dispute window
      mineToBlockHeight(deadline + 1 + Number(DISPUTE_WINDOW) + 1);

      // First claim
      const firstClaim = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'claim',
        [Cl.uint(marketId)],
        wallet1
      );
      expect(firstClaim.result).toBeOk();

      // Try to claim again
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'claim',
        [Cl.uint(marketId)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_CLAIMED));
    });

    it('should reject claiming for user with no winning tokens', () => {
      // Create a test market with a guaranteed future deadline
      // Use the current block height + 1000 to ensure deadline is far in the future
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const resolutionDeadline = deadline + 1000;

      fundWallet(deployer, 10_000_000);
      const createResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.uint(resolutionDeadline),
          Cl.uint(10_000_000n),
          Cl.uint(3),
          Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );
      const marketId = (createResult.result as any).value.value;

      // Buy losing tokens (outcome 1) for wallet2
      fundWallet(wallet2, 2_000_000);
      simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(1), Cl.uint(2_000_000n), Cl.uint(2_000_000n)],
        wallet2
      );

      // Mine to reach the deadline
      mineToBlockHeight(deadline + 1);

      const resolveResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );
      expect(resolveResult.result).toBeOk();

      // Mine blocks to pass dispute window
      mineToBlockHeight(deadline + 1 + Number(DISPUTE_WINDOW) + 1);

      // wallet2 bought outcome 1 tokens, which lost
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'claim',
        [Cl.uint(marketId)],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NO_WINNINGS));
    });

    it('should reject claiming from non-existent market', () => {
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'claim',
        [Cl.uint(999)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });
  });
});

describe('Multi-Outcome Pool V2 - Remove Liquidity', () => {
  describe('remove-liquidity', () => {
    it('should remove liquidity and return USDC', () => {
      // Create a test market
      fundWallet(deployer, 10_000_000);
      const createResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(5000),
          Cl.uint(6000),
          Cl.uint(10_000_000n),
          Cl.uint(3),
          Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );
      const marketId = (createResult.result as any).value.value;

      // Get current LP balance
      const lpBalance = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(deployer)],
        deployer
      );
      const lpAmount = (lpBalance.result as any).value.value / 2n; // Remove half

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(lpAmount)],
        deployer
      );

      expect(result.result).toBeOk();
      expect((result.result as any).value.value).toBeGreaterThan(0);
    });

    it('should reject removing below minimum liquidity', () => {
      // Create a test market
      fundWallet(deployer, 10_000_000);
      simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(5000),
          Cl.uint(6000),
          Cl.uint(10_000_000n),
          Cl.uint(3),
          Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'remove-liquidity',
        [Cl.uint(1), Cl.uint(MINIMUM_LIQUIDITY - 1n)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });

    it('should reject removing from non-existent market', () => {
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'remove-liquidity',
        [Cl.uint(999), Cl.uint(1_000_000n)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });
  });
});

describe('Multi-Outcome Pool V2 - LP Token Composability', () => {
  describe('SIP-013 LP Token Transfers', () => {
    it('should allow LP token transfer to another user', () => {
      // Create a test market
      fundWallet(deployer, 10_000_000);
      const createResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(5000),
          Cl.uint(6000),
          Cl.uint(10_000_000n),
          Cl.uint(3),
          Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );
      const marketId = (createResult.result as any).value.value;
      const token_id = MULTI_OUTCOME_ID_OFFSET + BigInt(marketId);

      const transferAmount = 1_000_000n;

      // Transfer LP tokens
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(token_id), Cl.uint(transferAmount), Cl.standardPrincipal(deployer), Cl.standardPrincipal(wallet1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify new owner has LP tokens
      const newBalance = simnet.callReadOnlyFn(
        'multi-outcome-pool-v2',
        'get-lp-balance',
        [Cl.uint(marketId), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(newBalance.result).toBeOk(Cl.uint(transferAmount));
    });

    it('should allow new owner to remove liquidity', () => {
      // Create a test market
      fundWallet(deployer, 10_000_000);
      const createResult = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(5000),
          Cl.uint(6000),
          Cl.uint(10_000_000n),
          Cl.uint(3),
          Cl.list([Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')]),
          Cl.uint(5_000_000n),
        ],
        deployer
      );
      const marketId = (createResult.result as any).value.value;
      const token_id = MULTI_OUTCOME_ID_OFFSET + BigInt(marketId);

      const transferAmount = 2_000_000n;

      // Transfer LP tokens
      simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(token_id), Cl.uint(transferAmount), Cl.standardPrincipal(deployer), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Remove liquidity as new owner
      const result = simnet.callPublicFn(
        'multi-outcome-pool-v2',
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(transferAmount)],
        wallet1
      );

      expect(result.result).toBeOk();
      expect((result.result as any).value.value).toBeGreaterThan(0);
    });
  });
});
