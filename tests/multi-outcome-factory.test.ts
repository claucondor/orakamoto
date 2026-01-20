import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

// Constants matching the contract
const MINIMUM_COLLATERAL = 50_000_000n; // 50 USDC with 6 decimals
const DEFAULT_RESOLUTION_WINDOW = 1008n; // ~7 days in blocks
const MAX_OUTCOMES = 10n;
const MIN_OUTCOMES = 2n;

// Error constants
const ERR_NOT_AUTHORIZED = 2000n;
const ERR_INVALID_QUESTION = 2001n;
const ERR_INVALID_DEADLINE = 2002n;
const ERR_INVALID_RESOLUTION_DEADLINE = 2003n;
const ERR_INSUFFICIENT_COLLATERAL = 2004n;
const ERR_MARKET_NOT_FOUND = 2005n;
const ERR_INVALID_OUTCOME_COUNT = 2009n;
const ERR_INVALID_OUTCOME_LABELS = 2010n;
const ERR_INVALID_LMSR_B = 2011n;

describe('Multi-Outcome Market Factory', () => {
  describe('Constants', () => {
    it('should have correct MAX-OUTCOMES value', () => {
      // We can't directly read constants, so we test via create-multi-outcome-market
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      // Try to create market with 11 outcomes (should fail - exceeds MAX_OUTCOMES)
      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(11), // More than MAX_OUTCOMES
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8('Option 2'),
            Cl.stringUtf8('Option 3'),
            Cl.stringUtf8('Option 4'),
            Cl.stringUtf8('Option 5'),
            Cl.stringUtf8('Option 6'),
            Cl.stringUtf8('Option 7'),
            Cl.stringUtf8('Option 8'),
            Cl.stringUtf8('Option 9'),
            Cl.stringUtf8('Option 10'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME_COUNT));
    });
  });

  describe('Create Multi-Outcome Market', () => {
    it('should create a 3-outcome market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Who will win the 2024 election?'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('Candidate A'),
            Cl.stringUtf8('Candidate B'),
            Cl.stringUtf8('Other'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(expectedMarketId));

      // Check market count increased
      const countResult = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      expect(countResult.result).toBeOk(Cl.uint(expectedMarketId));
    });

    it('should create a 10-outcome market (max)', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Which number will be drawn?'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(10),
          Cl.list([
            Cl.stringUtf8('1'),
            Cl.stringUtf8('2'),
            Cl.stringUtf8('3'),
            Cl.stringUtf8('4'),
            Cl.stringUtf8('5'),
            Cl.stringUtf8('6'),
            Cl.stringUtf8('7'),
            Cl.stringUtf8('8'),
            Cl.stringUtf8('9'),
            Cl.stringUtf8('10'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should reject market with less than 2 outcomes', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(1), // Less than MIN_OUTCOMES
          Cl.list([
            Cl.stringUtf8('Option 1'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME_COUNT));
    });

    it('should reject market with mismatched outcome labels count', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3), // 3 outcomes
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8('Option 2'),
            // Only 2 labels provided for 3 outcomes
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME_LABELS));
    });

    it('should reject market with empty outcome labels', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8(''), // Empty label
            Cl.stringUtf8('Option 3'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME_LABELS));
    });

    it('should reject market with zero LMSR b parameter', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8('Option 2'),
            Cl.stringUtf8('Option 3'),
          ]),
          Cl.uint(0), // Zero LMSR b
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_LMSR_B));
    });

    it('should reject market with insufficient collateral', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;
      const insufficientCollateral = MINIMUM_COLLATERAL - 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(insufficientCollateral)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(insufficientCollateral),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8('Option 2'),
            Cl.stringUtf8('Option 3'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_COLLATERAL));
    });

    it('should create market using default resolution deadline', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.none(), // Use default resolution deadline
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8('Option 2'),
            Cl.stringUtf8('Option 3'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(expectedMarketId));
    });
  });

  describe('Get Market Type', () => {
    it('should return correct market type for binary market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Binary market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-type',
        [Cl.uint(expectedMarketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.stringUtf8('binary'));
    });

    it('should return correct market type for multi-outcome market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Multi-outcome market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8('Option 2'),
            Cl.stringUtf8('Option 3'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-type',
        [Cl.uint(expectedMarketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.stringUtf8('multi-outcome'));
    });

    it('should return error for non-existent market', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-type',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result.type).toBe('err');
    });
  });

  describe('Get Outcome Labels', () => {
    it('should return correct labels for binary market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Binary market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-outcome-labels',
        [Cl.uint(expectedMarketId)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.list([
          Cl.stringUtf8('Yes'),
          Cl.stringUtf8('No'),
          Cl.stringUtf8(''),
          Cl.stringUtf8(''),
          Cl.stringUtf8(''),
          Cl.stringUtf8(''),
          Cl.stringUtf8(''),
          Cl.stringUtf8(''),
          Cl.stringUtf8(''),
          Cl.stringUtf8(''),
        ])
      );
    });

    it('should return correct labels for 3-outcome market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('3-outcome market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('A'),
            Cl.stringUtf8('B'),
            Cl.stringUtf8('C'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-outcome-labels',
        [Cl.uint(expectedMarketId)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.list([
          Cl.stringUtf8('A'),
          Cl.stringUtf8('B'),
          Cl.stringUtf8('C'),
        ])
      );
    });
  });

  describe('Get LMSR b', () => {
    it('should return 0 for binary market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Binary market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-lmsr-b',
        [Cl.uint(expectedMarketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return correct LMSR b for multi-outcome market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;
      const lmsrB = 10000000n; // 10.0 in scaled units

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Multi-outcome market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8('Option 2'),
            Cl.stringUtf8('Option 3'),
          ]),
          Cl.uint(lmsrB),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-lmsr-b',
        [Cl.uint(expectedMarketId)],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(lmsrB));
    });

    it('should return error for non-existent market', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-lmsr-b',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result.type).toBe('err');
    });
  });

  describe('Collateral Transfer', () => {
    it('should transfer collateral from creator to contract for multi-outcome market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Give wallet1 exactly minimum collateral
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      // Check wallet1 balance before
      const balanceBefore = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balanceBefore.result).toBeOk(Cl.uint(MINIMUM_COLLATERAL));

      // Create multi-outcome market
      simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(3),
          Cl.list([
            Cl.stringUtf8('Option 1'),
            Cl.stringUtf8('Option 2'),
            Cl.stringUtf8('Option 3'),
          ]),
          Cl.uint(1000000),
        ],
        wallet1
      );

      // Check wallet1 balance after (should be 0)
      const balanceAfter = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balanceAfter.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Get Market', () => {
    it('should return complete market data for multi-outcome market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;
      const lmsrB = 5000000n;

      // Get current market count to determine expected market ID
      const countBefore = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      const expectedMarketId = (countBefore.result as any).value.value + 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Test Question'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
          Cl.uint(4),
          Cl.list([
            Cl.stringUtf8('Option A'),
            Cl.stringUtf8('Option B'),
            Cl.stringUtf8('Option C'),
            Cl.stringUtf8('Option D'),
          ]),
          Cl.uint(lmsrB),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-market',
        [Cl.uint(expectedMarketId)],
        deployer
      );

      expect(result.result.type).toBe('ok');
      const market = (result.result as any).value.value;
      expect(market['creator']).toStrictEqual(Cl.standardPrincipal(wallet1));
      expect(market['question']).toStrictEqual(Cl.stringUtf8('Test Question'));
      expect(market['deadline']).toStrictEqual(Cl.uint(deadline));
      expect(market['resolution-deadline']).toStrictEqual(Cl.uint(resDeadline));
      expect(market['active']).toStrictEqual(Cl.bool(true));
      expect(market['market-type']).toStrictEqual(Cl.stringUtf8('multi-outcome'));
      expect(market['outcome-count']).toStrictEqual(Cl.uint(4));
      expect(market['lmsr-b']).toStrictEqual(Cl.uint(lmsrB));
    });
  });
});
