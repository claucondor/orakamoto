import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

// Constants matching the contract
const MINIMUM_COLLATERAL = 50_000_000n; // 50 USDC with 6 decimals
const DEFAULT_RESOLUTION_WINDOW = 1008n; // ~7 days in blocks

// Error constants
const ERR_NOT_AUTHORIZED = 2000n;
const ERR_INVALID_QUESTION = 2001n;
const ERR_INVALID_DEADLINE = 2002n;
const ERR_INVALID_RESOLUTION_DEADLINE = 2003n;
const ERR_INSUFFICIENT_COLLATERAL = 2004n;
const ERR_MARKET_NOT_FOUND = 2005n;
const ERR_MARKET_NOT_ACTIVE = 2006n;
const ERR_MARKET_ALREADY_INACTIVE = 2007n;
const ERR_ZERO_AMOUNT = 2008n;

describe('Market Factory', () => {
  describe('Constants', () => {
    it('should have correct MINIMUM-COLLATERAL value', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-minimum-collateral',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(MINIMUM_COLLATERAL));
    });

    it('should have correct DEFAULT-RESOLUTION-WINDOW value', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-default-resolution-window',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(DEFAULT_RESOLUTION_WINDOW));
    });

    it('should start with zero markets', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Create Market', () => {
    it('should create a market with minimum collateral', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Give wallet1 enough USDC
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Will Bitcoin reach $100k by 2025?'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(1));

      // Check market count increased
      const countResult = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      expect(countResult.result).toBeOk(Cl.uint(1));
    });

    it('should create a market using default resolution deadline', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;

      // Give wallet1 enough USDC
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Will ETH hit $5k?'),
          Cl.uint(deadline),
          Cl.none(), // Use default resolution deadline
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(1));

      // Verify the market was created with correct data
      const marketResult = simnet.callReadOnlyFn(
        'market-factory',
        'get-market',
        [Cl.uint(1)],
        deployer
      );

      expect(marketResult.result.type).toBe('ok');
    });

    it('should reject market with empty question', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8(''),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_QUESTION));
    });

    it('should reject market with deadline in the past', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock - 1;
      const resDeadline = currentBlock + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_DEADLINE));
    });

    it('should reject market with resolution deadline before trading deadline', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline - 1;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_RESOLUTION_DEADLINE));
    });

    it('should reject market with insufficient collateral', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;
      const insufficientCollateral = MINIMUM_COLLATERAL - 1n;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(insufficientCollateral)], wallet1);

      const result = simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Test market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(insufficientCollateral),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_COLLATERAL));
    });

    it('should create multiple markets with sequential IDs', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Create first market
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      const result1 = simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Market 1'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      // Create second market
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      const result2 = simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Market 2'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );
      expect(result2.result).toBeOk(Cl.uint(2));

      // Check count
      const countResult = simnet.callReadOnlyFn(
        'market-factory',
        'get-market-count',
        [],
        deployer
      );
      expect(countResult.result).toBeOk(Cl.uint(2));
    });
  });

  describe('Get Market', () => {
    it('should return market details for valid market ID', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Test Question'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-market',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result.type).toBe('ok');
      const market = (result.result as any).value.value;
      expect(market['creator']).toStrictEqual(Cl.standardPrincipal(wallet1));
      expect(market['question']).toStrictEqual(Cl.stringUtf8('Test Question'));
      expect(market['deadline']).toStrictEqual(Cl.uint(deadline));
      expect(market['resolution-deadline']).toStrictEqual(Cl.uint(resDeadline));
      expect(market['active']).toStrictEqual(Cl.bool(true));
    });

    it('should return error for non-existent market ID', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-market',
        [Cl.uint(999)],
        deployer
      );

      // The get-market function returns (err ERR-MARKET-NOT-FOUND) which is (err (err u2005))
      // The outer err comes from the response type, inner err from the match
      expect(result.result.type).toBe('err');
      const innerErr = (result.result as any).value;
      expect(innerErr.type).toBe('err');
      expect(innerErr.value).toBeUint(ERR_MARKET_NOT_FOUND);
    });
  });

  describe('Get Creator Markets', () => {
    it('should return empty list for creator with no markets', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-creator-markets',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );

      expect(result.result).toBeOk(Cl.list([]));
    });

    it('should return list of market IDs for creator', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Create two markets for wallet1
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Market 1'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Market 2'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-factory',
        'get-creator-markets',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.list([Cl.uint(1), Cl.uint(2)]));
    });
  });

  describe('Deactivate Market', () => {
    it('should allow contract owner to deactivate a market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      // Deactivate as deployer (contract owner)
      const result = simnet.callPublicFn(
        'market-factory',
        'deactivate-market',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify market is now inactive
      const marketResult = simnet.callReadOnlyFn(
        'market-factory',
        'get-market',
        [Cl.uint(1)],
        deployer
      );

      expect(marketResult.result.type).toBe('ok');
      const market = (marketResult.result as any).value.value;
      expect(market['active']).toStrictEqual(Cl.bool(false));
    });

    it('should reject non-owner trying to deactivate a market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      // Try to deactivate as wallet1 (not owner)
      const result = simnet.callPublicFn(
        'market-factory',
        'deactivate-market',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject deactivating already inactive market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(MINIMUM_COLLATERAL)], wallet1);
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
        ],
        wallet1
      );

      // Deactivate once
      simnet.callPublicFn(
        'market-factory',
        'deactivate-market',
        [Cl.uint(1)],
        deployer
      );

      // Try to deactivate again
      const result = simnet.callPublicFn(
        'market-factory',
        'deactivate-market',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_INACTIVE));
    });

    it('should reject deactivating non-existent market', () => {
      const result = simnet.callPublicFn(
        'market-factory',
        'deactivate-market',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });
  });

  describe('Collateral Transfer', () => {
    it('should transfer collateral from creator to contract', () => {
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

      // Create market
      simnet.callPublicFn(
        'market-factory',
        'create-market',
        [
          Cl.stringUtf8('Test Market'),
          Cl.uint(deadline),
          Cl.some(Cl.uint(resDeadline)),
          Cl.uint(MINIMUM_COLLATERAL),
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
});
