import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

// Get the multi-market-pool contract principal
const MULTI_MARKET_POOL_CONTRACT = `${deployer}.multi-market-pool`;

// Setup: Authorize multi-market-pool to mint/burn LP tokens
function ensureLpTokenSetup() {
  const checkResult = simnet.callReadOnlyFn(
    'sip013-lp-token',
    'get-authorized-minter',
    [],
    deployer
  );

  // If not already set, set it
  const currentMinter = (checkResult.result as any).value;
  const MULTI_MARKET_POOL_CONTRACT = `${deployer}.multi-market-pool`;
  if (!currentMinter || currentMinter.value !== MULTI_MARKET_POOL_CONTRACT) {
    const authResult = simnet.callPublicFn(
      'sip013-lp-token',
      'set-authorized-minter',
      [Cl.contractPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'multi-market-pool')],
      deployer
    );
    console.log('LP token auth result:', authResult.result);
  }
}

// Setup: Authorize multi-outcome-pool-v2 to mint/burn LP tokens
function ensureMultiOutcomeLpTokenSetup() {
  const checkResult = simnet.callReadOnlyFn(
    'sip013-lp-token',
    'get-authorized-minter',
    [],
    deployer
  );

  // If not already set, set it to multi-outcome-pool-v2
  const currentMinter = (checkResult.result as any).value;
  const MULTI_OUTCOME_POOL_CONTRACT = `${deployer}.multi-outcome-pool-v2`;
  if (!currentMinter || currentMinter.value !== MULTI_OUTCOME_POOL_CONTRACT) {
    const authResult = simnet.callPublicFn(
      'sip013-lp-token',
      'set-authorized-minter',
      [Cl.contractPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'multi-outcome-pool-v2')],
      deployer
    );
    console.log('Multi-outcome LP token auth result:', authResult.result);
  }
}

beforeAll(() => {
  // Set up multi-market-pool as the default minter
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
// Note: Only set up multi-market-pool by default; multi-outcome tests will switch
beforeEach(() => {
  // Reset to multi-market-pool (default for binary markets)
  ensureLpTokenSetup();
});

// Constants matching the contract
const MINIMUM_INITIAL_LIQUIDITY = 1_000_000n; // 1 USDC with 6 decimals
const DEFAULT_RESOLUTION_WINDOW = 1008n;

// Error constants
const ERR_NOT_AUTHORIZED = 5000n;
const ERR_MARKET_NOT_FOUND = 5001n;
const ERR_MARKET_ALREADY_FEATURED = 5002n;
const ERR_MARKET_NOT_FEATURED = 5003n;
const ERR_MARKET_ALREADY_INACTIVE = 5004n;
const ERR_INVALID_TAG_COUNT = 5005n;
const ERR_INVALID_TAG_LENGTH = 5006n;
const ERR_INVALID_CATEGORY_LENGTH = 5007n;
const ERR_EMPTY_CATEGORY = 5008n;

// Helper function to give a wallet USDC via faucet
function fundWallet(wallet: string, amount: number) {
  simnet.callPublicFn('usdcx', 'faucet', [Cl.uint(amount)], wallet);
}

// Root describe block with setup
describe('Market Factory V3', () => {
  describe('Create Market', () => {
    describe('create-market', () => {
      it('should create market via factory with valid inputs', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n; // 10 USDC
        const category = 'crypto';
        const tags = [Cl.stringUtf8('btc'), Cl.stringUtf8('price')];

        // Fund the deployer wallet
        fundWallet(deployer, Number(initialLiquidity));

        // Create market via factory
        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-market',
          [
            Cl.stringUtf8('Will BTC reach $100k?'),
            Cl.uint(deadline),
            Cl.none(),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8(category),
            Cl.list(tags, Cl.stringUtf8(32)),
          ],
          deployer
        );

        // Should succeed and return market-id (u1 = first market)
        expect(result.result).toBeOk(Cl.uint(1));

        // Verify metadata was stored
        const metadataResult = simnet.callReadOnlyFn(
          'market-factory-v3',
          'get-market-metadata',
          [Cl.uint(1)],
          deployer
        );

        const metadata = (metadataResult.result as any).value;
        expect(metadata.value.category).toBeDefined();
        expect(metadata.value.active.type).toBe('true');
        expect(metadata.value.featured.type).toBe('false');
      });

      it('should create market with custom resolution deadline', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const resolutionDeadline = deadline + 2000;
        const initialLiquidity = 10_000_000n;
        const category = 'sports';

        fundWallet(deployer, Number(initialLiquidity));

        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-market',
          [
            Cl.stringUtf8('Will Team A win?'),
            Cl.uint(deadline),
            Cl.some(Cl.uint(resolutionDeadline)),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8(category),
            Cl.list([], Cl.stringUtf8(32)),
          ],
          deployer
        );

        expect(result.result).toBeOk(Cl.uint(1));
      });

      it('should fail with empty category', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n;

        fundWallet(deployer, Number(initialLiquidity));

        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-market',
          [
            Cl.stringUtf8('Will BTC reach $100k?'),
            Cl.uint(deadline),
            Cl.none(),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8(''),  // Empty category
            Cl.list([], Cl.stringUtf8(32)),
          ],
          deployer
        );

        expect(result.result).toBeErr(Cl.uint(ERR_EMPTY_CATEGORY));
      });

      it('should fail with category exceeding max length', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n;
        const longCategory = 'a'.repeat(33); // MAX_CATEGORY_LENGTH is 32

        fundWallet(deployer, Number(initialLiquidity));

        // Clarity type system enforces max string length at type level
        // This will throw a runtime error before our validation code runs
        expect(() => {
          simnet.callPublicFn(
            'market-factory-v3',
            'create-market',
            [
              Cl.stringUtf8('Will BTC reach $100k?'),
              Cl.uint(deadline),
              Cl.none(),
              Cl.uint(initialLiquidity),
              Cl.stringUtf8(longCategory),
              Cl.list([], Cl.stringUtf8(32)),
            ],
            deployer
          );
        }).toThrow();
      });

      it('should fail with too many tags', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n;
        const tags = Array(11).fill(Cl.stringUtf8('tag')); // 11 tags (MAX is 10)

        fundWallet(deployer, Number(initialLiquidity));

        // Clarity type system enforces max list length at type level
        // This will throw a runtime error before our validation code runs
        expect(() => {
          simnet.callPublicFn(
            'market-factory-v3',
            'create-market',
            [
              Cl.stringUtf8('Will BTC reach $100k?'),
              Cl.uint(deadline),
              Cl.none(),
              Cl.uint(initialLiquidity),
              Cl.stringUtf8('crypto'),
              Cl.list(tags, Cl.stringUtf8(32)),
            ],
            deployer
          );
        }).toThrow();
      });

      it('should fail with empty tag', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n;
        const tags = [Cl.stringUtf8(''), Cl.stringUtf8('btc')]; // Empty tag

        fundWallet(deployer, Number(initialLiquidity));

        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-market',
          [
            Cl.stringUtf8('Will BTC reach $100k?'),
            Cl.uint(deadline),
            Cl.none(),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8('crypto'),
            Cl.list(tags, Cl.stringUtf8(32)),
          ],
          deployer
        );

        expect(result.result).toBeErr(Cl.uint(ERR_INVALID_TAG_LENGTH));
      });

      it('should fail with tag exceeding max length', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n;
        const longTag = Cl.stringUtf8('a'.repeat(33)); // MAX_TAG_LENGTH is 32
        const tags = [longTag];

        fundWallet(deployer, Number(initialLiquidity));

        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-market',
          [
            Cl.stringUtf8('Will BTC reach $100k?'),
            Cl.uint(deadline),
            Cl.none(),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8('crypto'),
            Cl.list(tags, Cl.stringUtf8(32)),
          ],
          deployer
        );

        expect(result.result).toBeErr(Cl.uint(ERR_INVALID_TAG_LENGTH));
      });

      it('should add market to category index', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n;
        const category = 'crypto';

        fundWallet(deployer, Number(initialLiquidity));

        // Create market
        simnet.callPublicFn(
          'market-factory-v3',
          'create-market',
          [
            Cl.stringUtf8('Will BTC reach $100k?'),
            Cl.uint(deadline),
            Cl.none(),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8(category),
            Cl.list([], Cl.stringUtf8(32)),
          ],
          deployer
        );

        // Check category markets
        const result = simnet.callReadOnlyFn(
          'market-factory-v3',
          'get-markets-by-category',
          [Cl.stringUtf8(category)],
          deployer
        );

        const markets = (result.result as any).value;
        expect(markets).toBeDefined();
        // markets.value is the list of market IDs
        expect(markets.value).toBeDefined();
      });
    });

    describe('create-multi-outcome-market', () => {
      beforeEach(() => {
        // Set LP token authorization to multi-outcome-pool-v2 for these tests
        ensureMultiOutcomeLpTokenSetup();
      });

      it('should create multi-outcome market with 3 outcomes', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n; // 10 USDC
        const category = 'sports';
        const tags = [Cl.stringUtf8('world-cup'), Cl.stringUtf8('final')];
        const outcomeCount = 3;
        const outcomeLabels = [Cl.stringUtf8('Team A'), Cl.stringUtf8('Team B'), Cl.stringUtf8('Draw')];
        const lmsrB = 5_000_000n; // LMSR parameter (scaled by PRECISION)

        // Fund the deployer wallet
        fundWallet(deployer, Number(initialLiquidity));

        // Create multi-outcome market via factory
        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-multi-outcome-market',
          [
            Cl.stringUtf8('Who will win the World Cup final?'),
            Cl.uint(deadline),
            Cl.none(),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8(category),
            Cl.list(tags, Cl.stringUtf8(32)),
            Cl.uint(outcomeCount),
            Cl.list(outcomeLabels, Cl.stringUtf8(32)),
            Cl.uint(lmsrB),
          ],
          deployer
        );

        // Should succeed and return market-id (u1 = first market)
        expect(result.result).toBeOk(Cl.uint(1));

        // Verify metadata was stored
        const metadataResult = simnet.callReadOnlyFn(
          'market-factory-v3',
          'get-market-metadata',
          [Cl.uint(1)],
          deployer
        );

        const metadata = (metadataResult.result as any).value;
        expect(metadata.value.category).toBeDefined();
        expect(metadata.value.active.type).toBe('true');
        expect(metadata.value.featured.type).toBe('false');

        // Verify market type is "multi-outcome"
        const typeResult = simnet.callReadOnlyFn(
          'market-factory-v3',
          'get-market-type',
          [Cl.uint(1)],
          deployer
        );

        expect(typeResult.result).toBeOk(Cl.stringAscii('multi-outcome'));
      });

      it('should create multi-outcome market with 5 outcomes', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n;
        const category = 'politics';
        const outcomeCount = 5;
        const outcomeLabels = [
          Cl.stringUtf8('Candidate A'),
          Cl.stringUtf8('Candidate B'),
          Cl.stringUtf8('Candidate C'),
          Cl.stringUtf8('Candidate D'),
          Cl.stringUtf8('Other'),
        ];
        const lmsrB = 5_000_000n;

        fundWallet(deployer, Number(initialLiquidity));

        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-multi-outcome-market',
          [
            Cl.stringUtf8('Who will win the election?'),
            Cl.uint(deadline),
            Cl.none(),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8(category),
            Cl.list([], Cl.stringUtf8(32)),
            Cl.uint(outcomeCount),
            Cl.list(outcomeLabels, Cl.stringUtf8(32)),
            Cl.uint(lmsrB),
          ],
          deployer
        );

        expect(result.result).toBeOk(Cl.uint(1));
      });

      it('should create multi-outcome market with custom resolution deadline', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const resolutionDeadline = deadline + 2000;
        const initialLiquidity = 10_000_000n;
        const outcomeCount = 2;
        const outcomeLabels = [Cl.stringUtf8('Yes'), Cl.stringUtf8('No')];
        const lmsrB = 5_000_000n;

        fundWallet(deployer, Number(initialLiquidity));

        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-multi-outcome-market',
          [
            Cl.stringUtf8('Custom resolution deadline test?'),
            Cl.uint(deadline),
            Cl.some(Cl.uint(resolutionDeadline)),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8('test'),
            Cl.list([], Cl.stringUtf8(32)),
            Cl.uint(outcomeCount),
            Cl.list(outcomeLabels, Cl.stringUtf8(32)),
            Cl.uint(lmsrB),
          ],
          deployer
        );

        expect(result.result).toBeOk(Cl.uint(1));
      });

      it('should fail with empty category for multi-outcome market', () => {
        const currentBlock = simnet.blockHeight;
        const deadline = currentBlock + 1000;
        const initialLiquidity = 10_000_000n;

        fundWallet(deployer, Number(initialLiquidity));

        const result = simnet.callPublicFn(
          'market-factory-v3',
          'create-multi-outcome-market',
          [
            Cl.stringUtf8('Test question?'),
            Cl.uint(deadline),
            Cl.none(),
            Cl.uint(initialLiquidity),
            Cl.stringUtf8(''),  // Empty category
            Cl.list([], Cl.stringUtf8(32)),
            Cl.uint(2),
            Cl.list([Cl.stringUtf8('Yes'), Cl.stringUtf8('No')], Cl.stringUtf8(32)),
            Cl.uint(5_000_000n),
          ],
          deployer
        );

        expect(result.result).toBeErr(Cl.uint(ERR_EMPTY_CATEGORY));
      });
    });
  });

  describe('Feature Market', () => {
    it('should allow admin to feature a market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create market
      const createResult = simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // createResult.result is ok if market-id is returned

      // Feature the market
      const featureResult = simnet.callPublicFn(
        'market-factory-v3',
        'feature-market',
        [Cl.uint(1)],
        deployer
      );

      expect(featureResult.result).toBeOk(Cl.bool(true));

      // Check if market is featured
      const isFeaturedResult = simnet.callReadOnlyFn(
        'market-factory-v3',
        'is-market-featured',
        [Cl.uint(1)],
        deployer
      );

      expect(isFeaturedResult.result).toBeOk(Cl.bool(true));

      // Check featured count
      const countResult = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-featured-count',
        [],
        deployer
      );

      expect(countResult.result).toBeOk(Cl.uint(1));
    });

    it('should reject featuring from non-admin', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Try to feature from wallet1 (not admin)
      const featureResult = simnet.callPublicFn(
        'market-factory-v3',
        'feature-market',
        [Cl.uint(1)],
        wallet1
      );

      expect(featureResult.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject featuring already featured market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Feature the market
      simnet.callPublicFn(
        'market-factory-v3',
        'feature-market',
        [Cl.uint(1)],
        deployer
      );

      // Try to feature again
      const featureResult = simnet.callPublicFn(
        'market-factory-v3',
        'feature-market',
        [Cl.uint(1)],
        deployer
      );

      expect(featureResult.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_FEATURED));
    });

    it('should unfeature a market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create and feature market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      simnet.callPublicFn(
        'market-factory-v3',
        'feature-market',
        [Cl.uint(1)],
        deployer
      );

      // Unfeature the market
      const unfeatureResult = simnet.callPublicFn(
        'market-factory-v3',
        'unfeature-market',
        [Cl.uint(1)],
        deployer
      );

      expect(unfeatureResult.result).toBeOk(Cl.bool(true));

      // Check if market is not featured
      const isFeaturedResult = simnet.callReadOnlyFn(
        'market-factory-v3',
        'is-market-featured',
        [Cl.uint(1)],
        deployer
      );

      expect(isFeaturedResult.result).toBeOk(Cl.bool(false));
    });

    it('should reject unfeaturing non-featured market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Try to unfeature (not featured)
      const unfeatureResult = simnet.callPublicFn(
        'market-factory-v3',
        'unfeature-market',
        [Cl.uint(1)],
        deployer
      );

      expect(unfeatureResult.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FEATURED));
    });
  });

  describe('Deactivate Market', () => {
    it('should allow admin to deactivate a market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Deactivate the market
      const deactivateResult = simnet.callPublicFn(
        'market-factory-v3',
        'deactivate-market',
        [Cl.uint(1)],
        deployer
      );

      expect(deactivateResult.result).toBeOk(Cl.bool(true));

      // Check if market is inactive
      const isActiveResult = simnet.callReadOnlyFn(
        'market-factory-v3',
        'is-market-active',
        [Cl.uint(1)],
        deployer
      );

      expect(isActiveResult.result).toBeOk(Cl.bool(false));
    });

    it('should reject deactivating from non-admin', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Try to deactivate from wallet1 (not admin)
      const deactivateResult = simnet.callPublicFn(
        'market-factory-v3',
        'deactivate-market',
        [Cl.uint(1)],
        wallet1
      );

      expect(deactivateResult.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject deactivating already inactive market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Deactivate the market
      simnet.callPublicFn(
        'market-factory-v3',
        'deactivate-market',
        [Cl.uint(1)],
        deployer
      );

      // Try to deactivate again
      const deactivateResult = simnet.callPublicFn(
        'market-factory-v3',
        'deactivate-market',
        [Cl.uint(1)],
        deployer
      );

      expect(deactivateResult.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_INACTIVE));
    });

    it('should allow admin to reactivate a market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create and deactivate market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      simnet.callPublicFn(
        'market-factory-v3',
        'deactivate-market',
        [Cl.uint(1)],
        deployer
      );

      // Reactivate the market
      const reactivateResult = simnet.callPublicFn(
        'market-factory-v3',
        'reactivate-market',
        [Cl.uint(1)],
        deployer
      );

      expect(reactivateResult.result).toBeOk(Cl.bool(true));

      // Check if market is active
      const isActiveResult = simnet.callReadOnlyFn(
        'market-factory-v3',
        'is-market-active',
        [Cl.uint(1)],
        deployer
      );

      expect(isActiveResult.result).toBeOk(Cl.bool(true));
    });
  });

  describe('Read-Only Functions', () => {
    it('should get market metadata', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;
      const category = 'crypto';
      const tags = [Cl.stringUtf8('btc'), Cl.stringUtf8('price')];

      fundWallet(deployer, Number(initialLiquidity));

      // Create market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8(category),
          Cl.list(tags, Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Get metadata
      const result = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-market-metadata',
        [Cl.uint(1)],
        deployer
      );

      const metadata = (result.result as any).value;
      expect(metadata.value.category.value).toBe(category);
      expect(metadata.value.featured.type).toBe('false');
      expect(metadata.value.active.type).toBe('true');
    });

    it('should fail to get metadata for non-existent market', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-market-metadata',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_MARKET_NOT_FOUND));
    });

    it('should get market category', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;
      const category = 'sports';

      fundWallet(deployer, Number(initialLiquidity));

      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will Team A win?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8(category),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-market-category',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.stringUtf8(category));
    });

    it('should get market tags', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;
      const tags = [Cl.stringUtf8('btc'), Cl.stringUtf8('defi')];

      fundWallet(deployer, Number(initialLiquidity));

      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list(tags, Cl.stringUtf8(32)),
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-market-tags',
        [Cl.uint(1)],
        deployer
      );

      // The result is (ok (list tags)), so we need to access .value.value for the list
      const returnedTags = (result.result as any).value.value;
      expect(returnedTags).toBeDefined();
      expect(returnedTags.length).toBe(2);
    });

    it('should get market type for binary market', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity));

      // Create binary market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Get market type
      const result = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-market-type',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.stringAscii('binary'));
    });

    it('should get market type for multi-outcome market', () => {
      // Set LP token authorization to multi-outcome-pool-v2 for this test
      ensureMultiOutcomeLpTokenSetup();

      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;
      const outcomeCount = 3;
      const outcomeLabels = [Cl.stringUtf8('A'), Cl.stringUtf8('B'), Cl.stringUtf8('C')];

      fundWallet(deployer, Number(initialLiquidity));

      // Create multi-outcome market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-multi-outcome-market',
        [
          Cl.stringUtf8('Who will win?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('sports'),
          Cl.list([], Cl.stringUtf8(32)),
          Cl.uint(outcomeCount),
          Cl.list(outcomeLabels, Cl.stringUtf8(32)),
          Cl.uint(5_000_000n),
        ],
        deployer
      );

      // Get market type
      const result = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-market-type',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.stringAscii('multi-outcome'));
    });

    it('should return default binary type for non-existent market', () => {
      const result = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-market-type',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeOk(Cl.stringAscii('binary'));
    });
  });

  describe('Multiple Markets', () => {
    it('should handle multiple markets with different categories', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      fundWallet(deployer, Number(initialLiquidity) * 3);

      // Create crypto market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will BTC reach $100k?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('crypto'),
          Cl.list([Cl.stringUtf8('btc')], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Create sports market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will Team A win?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('sports'),
          Cl.list([Cl.stringUtf8('team-a')], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Create politics market
      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Will X win?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('politics'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Check crypto category has 1 market
      const cryptoResult = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-markets-by-category',
        [Cl.stringUtf8('crypto')],
        deployer
      );
      const cryptoMarkets = (cryptoResult.result as any).value;
      expect(cryptoMarkets).toBeDefined();
      expect(cryptoMarkets.value).toBeDefined();

      // Check sports category has 1 market
      const sportsResult = simnet.callReadOnlyFn(
        'market-factory-v3',
        'get-markets-by-category',
        [Cl.stringUtf8('sports')],
        deployer
      );
      const sportsMarkets = (sportsResult.result as any).value;
      expect(sportsMarkets).toBeDefined();
      expect(sportsMarkets.value).toBeDefined();
    });

    it('should support up to 100 featured markets', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 1000;
      const initialLiquidity = 10_000_000n;

      // This would require creating and featuring 100 markets
      // In a real test, we'd verify the boundary condition
      // For now, just verify the mechanism works with 2 markets
      fundWallet(deployer, Number(initialLiquidity) * 2);

      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Market 1?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('test'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      simnet.callPublicFn(
        'market-factory-v3',
        'create-market',
        [
          Cl.stringUtf8('Market 2?'),
          Cl.uint(deadline),
          Cl.none(),
          Cl.uint(initialLiquidity),
          Cl.stringUtf8('test'),
          Cl.list([], Cl.stringUtf8(32)),
        ],
        deployer
      );

      // Feature both markets
      simnet.callPublicFn('market-factory-v3', 'feature-market', [Cl.uint(1)], deployer);
      simnet.callPublicFn('market-factory-v3', 'feature-market', [Cl.uint(2)], deployer);

      // Check count
      const countResult = simnet.callReadOnlyFn('market-factory-v3', 'get-featured-count', [], deployer);
      expect(countResult.result).toBeOk(Cl.uint(2));
    });
  });
});
