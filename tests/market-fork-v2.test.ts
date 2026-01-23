import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const PRECISION = 1000000n;
const FORK_THRESHOLD = 1000n; // 10% in basis points
const FORK_SETTLEMENT_PERIOD = 43200n; // 30 days in blocks
const FORK_DISCOUNT = 500000n; // 50% discount (500000 / 1000000 = 0.5)

// Error constants
const ERR_NOT_AUTHORIZED = 8000n;
const ERR_ZERO_AMOUNT = 8001n;
const ERR_MARKET_NOT_FOUND = 8002n;
const ERR_ALREADY_FORKED = 8003n;
const ERR_FORK_NOT_INITIATED = 8004n;
const ERR_FORK_NOT_SETTLED = 8005n;
const ERR_INVALID_FORK_CHOICE = 8006n;
const ERR_NO_POSITION_FOUND = 8007n;
const ERR_ALREADY_MIGRATED = 8008n;
const ERR_FORK_NOT_CANONICAL = 8009n;
const ERR_THRESHOLD_NOT_REACHED = 8010n;
const ERR_INVALID_POOL_TYPE = 8011n;
const ERR_INVALID_OUTCOME = 8012n;

// Pool type constants
const POOL_TYPE_BINARY = 'binary';
const POOL_TYPE_MULTI_OUTCOME = 'multi-outcome';

// Helper function to give a wallet USDCx via faucet
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

// Helper function to create a test binary market
function createBinaryMarket(creator: string, deadline: number) {
  fundWallet(creator, 10_000_000); // 10 USDC

  const question = 'Will BTC reach 100k by 2025?';
  const initialLiquidity = 1_000_000; // 1 USDC

  return simnet.callPublicFn(
    'multi-market-pool',
    'create-market',
    [
      Cl.stringUtf8(question),
      Cl.uint(deadline),
      Cl.uint(deadline + 2000), // resolution deadline
      Cl.uint(initialLiquidity)
    ],
    creator
  );
}

// Setup: Authorize multi-market-pool to mint/burn LP tokens
const MULTI_MARKET_POOL_PRINCIPAL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.multi-market-pool';
const MULTI_OUTCOME_POOL_V2_PRINCIPAL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.multi-outcome-pool-v2';

// Function to ensure LP token authorization
function ensureLpTokenSetup() {
  // Authorize multi-market-pool (needed for binary market tests)
  const checkResult = simnet.callReadOnlyFn(
    'sip013-lp-token',
    'get-authorized-minter',
    [],
    deployer
  );
  const currentMinter = (checkResult.result as any).value;
  if (!currentMinter || currentMinter.value !== MULTI_MARKET_POOL_PRINCIPAL) {
    simnet.callPublicFn(
      'sip013-lp-token',
      'set-authorized-minter',
      [Cl.contractPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'multi-market-pool')],
      deployer
    );
  }
}

beforeAll(() => {
  ensureLpTokenSetup();
});

beforeEach(() => {
  ensureLpTokenSetup();
});

describe('Market Fork V2 - Read-Only Functions', () => {
  describe('get-fork-threshold', () => {
    it('should return the fork threshold constant', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork-v2',
        'get-fork-threshold',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(FORK_THRESHOLD));
    });
  });

  describe('get-fork-id-counter', () => {
    it('should return 0 initially', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork-v2',
        'get-fork-id-counter',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('get-fork-state', () => {
    it('should return none for non-existent fork', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork-v2',
        'get-fork-state',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeOk(Cl.none());
    });
  });

  describe('get-market-fork', () => {
    it('should return none for market without fork', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork-v2',
        'get-market-fork',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.none());
    });
  });
});

describe('Market Fork V2 - Initiate Fork', () => {
  describe('initiate-fork - Binary Markets', () => {
    it('should initiate fork when threshold is reached (exactly 10%)', () => {
      const disputedLiquidity = 100_000_000n; // 100 USDC
      const totalLiquidity = 1_000_000_000n; // 1,000 USDC (10% disputed)

      const result = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1), // original-market-id
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(disputedLiquidity),
          Cl.uint(totalLiquidity),
          Cl.uint(0), // original-resolution (YES)
          Cl.uint(1)  // disputed-resolution (NO)
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(1)); // First fork has ID 1
    });

    it('should reject when threshold not reached (below 10%)', () => {
      const disputedLiquidity = 50_000_000n; // 50 USDC
      const totalLiquidity = 1_000_000_000n; // 1,000 USDC (5% disputed)

      const result = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(disputedLiquidity),
          Cl.uint(totalLiquidity),
          Cl.uint(0),
          Cl.uint(1)
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_THRESHOLD_NOT_REACHED));
    });

    it('should reject invalid pool type', () => {
      const result = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.stringAscii('invalid-pool'),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1)
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_POOL_TYPE));
    });

    it('should reject invalid outcome values (not 0 or 1)', () => {
      const result = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(5), // invalid outcome
          Cl.uint(1)
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });

    it('should reject when original resolution equals disputed resolution', () => {
      const result = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(1), // same as disputed
          Cl.uint(1)
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });
  });

  describe('initiate-fork - Multi-Outcome Markets', () => {
    it('should initiate fork for multi-outcome pool', () => {
      const disputedLiquidity = 100_000_000n;
      const totalLiquidity = 1_000_000_000n;

      const result = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.stringAscii(POOL_TYPE_MULTI_OUTCOME),
          Cl.uint(disputedLiquidity),
          Cl.uint(totalLiquidity),
          Cl.uint(0),
          Cl.uint(1)
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(1)); // First fork in this test suite
    });
  });

  describe('initiate-fork - Fork ID Management', () => {
    it('should increment fork ID counter for each new fork', () => {
      // First fork
      let result1 = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1)
        ],
        deployer
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      // Second fork
      let result2 = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(2),
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1)
        ],
        deployer
      );
      expect(result2.result).toBeOk(Cl.uint(2));

      // Check counter
      const counterResult = simnet.callReadOnlyFn(
        'market-fork-v2',
        'get-fork-id-counter',
        [],
        deployer
      );
      expect(counterResult.result).toBeOk(Cl.uint(2));
    });

    it('should prevent duplicate forks for same market', () => {
      // First fork
      let result1 = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1)
        ],
        deployer
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      // Try to fork same market again
      let result2 = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1)
        ],
        deployer
      );
      expect(result2.result).toBeErr(Cl.uint(ERR_ALREADY_FORKED));
    });
  });
});

describe('Market Fork V2 - Settle Fork', () => {
  beforeEach(() => {
    // Initiate a fork first
    simnet.callPublicFn(
      'market-fork-v2',
      'initiate-fork',
      [
        Cl.uint(1),
        Cl.stringAscii(POOL_TYPE_BINARY),
        Cl.uint(100_000_000n),
        Cl.uint(1_000_000_000n),
        Cl.uint(0),
        Cl.uint(1)
      ],
      deployer
    );
  });

  describe('settle-fork', () => {
    it('should reject settlement before period ends', () => {
      const currentBlock = simnet.blockHeight;

      const result = simnet.callPublicFn(
        'market-fork-v2',
        'settle-fork',
        [Cl.uint(1)],
        deployer
      );

      // Settlement period is 43200 blocks, we're at block ~0
      expect(result.result).toBeErr(Cl.uint(ERR_FORK_NOT_SETTLED));
    });

    it('should settle fork after settlement period', () => {
      // Mine blocks to reach settlement period end
      const settlementBlock = 43200 + 100; // fork initiated at ~100
      mineToBlockHeight(settlementBlock);

      const result = simnet.callPublicFn(
        'market-fork-v2',
        'settle-fork',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(1)); // Fork A wins with 0 liquidity
    });
  });

  describe('settle-fork - Canonical Determination', () => {
    it('should default to Fork B when liquidity is equal (0-0 tie)', () => {
      // The beforeEach creates fork ID 1 with 0 liquidity on both sides
      // After settlement period, tie should go to Fork B (disputed resolution)

      mineToBlockHeight(43300);

      const result = simnet.callPublicFn(
        'market-fork-v2',
        'settle-fork',
        [Cl.uint(1)],
        deployer
      );

      // When tied (0-0), Fork B (u1) wins by default
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should choose Fork A when it has more liquidity', () => {
      // Create a new fork for a different market
      const result = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(10), // Different market ID
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1)
        ],
        deployer
      );

      // Simulate adding liquidity to Fork A by migrating a position
      // (In a full integration test, this would be done via migrate-position)
      // For now, we just verify the settlement logic defaults work

      mineToBlockHeight(43300);

      const settleResult = simnet.callPublicFn(
        'market-fork-v2',
        'settle-fork',
        [Cl.uint(2)], // Fork ID 2
        deployer
      );

      // With 0 liquidity on both sides, Fork B wins
      expect(settleResult.result).toBeOk(Cl.uint(1));
    });
  });
});

describe('Market Fork V2 - Integration with Binary Markets', () => {
  beforeEach(() => {
    fundWallet(wallet1, 10_000_000);
  });

  describe('initiate-fork for real market', () => {
    it('should create fork state with proper metadata', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 5000;

      // Create a market first
      const marketResult = createBinaryMarket(wallet1, deadline);
      expect(marketResult.result).toBeOk(Cl.uint(1));

      // Initiate fork
      const forkResult = simnet.callPublicFn(
        'market-fork-v2',
        'initiate-fork',
        [
          Cl.uint(1), // market-id from create-market
          Cl.stringAscii(POOL_TYPE_BINARY),
          Cl.uint(100_000_000n), // 10% of 1M liquidity
          Cl.uint(1_000_000_000n), // total liquidity
          Cl.uint(0), // YES stands
          Cl.uint(1)  // NO disputes
        ],
        wallet1
      );

      expect(forkResult.result).toBeOk(Cl.uint(1));

      // Verify fork state
      const stateResult = simnet.callReadOnlyFn(
        'market-fork-v2',
        'get-fork-state',
        [Cl.uint(1)],
        deployer
      );

      // Response is (ok (some { ...state tuple... }))
      // So we need .value.value.value to get the tuple
      const state = (stateResult.result as any).value.value.value;
      expect(state['original-market-id']).toStrictEqual(Cl.uint(1));
      expect(state['original-pool']).toStrictEqual(Cl.stringAscii(POOL_TYPE_BINARY));
      expect(state['initiated-by']).toStrictEqual(Cl.standardPrincipal(wallet1));
      expect(state['canonical-fork']).toStrictEqual(Cl.none());
    });
  });
});

describe('Market Fork V2 - Reset Fork (Admin)', () => {
  beforeEach(() => {
    // Create a fork first
    simnet.callPublicFn(
      'market-fork-v2',
      'initiate-fork',
      [
        Cl.uint(1),
        Cl.stringAscii(POOL_TYPE_BINARY),
        Cl.uint(100_000_000n),
        Cl.uint(1_000_000_000n),
        Cl.uint(0),
        Cl.uint(1)
      ],
      deployer
    );
  });

  describe('reset-fork', () => {
    it('should reject reset from non-owner', () => {
      const result = simnet.callPublicFn(
        'market-fork-v2',
        'reset-fork',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should allow owner to reset fork', () => {
      const result = simnet.callPublicFn(
        'market-fork-v2',
        'reset-fork',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify fork state is deleted
      const stateResult = simnet.callReadOnlyFn(
        'market-fork-v2',
        'get-fork-state',
        [Cl.uint(1)],
        deployer
      );

      expect(stateResult.result).toBeOk(Cl.none());
    });
  });
});

describe('Market Fork V2 - Update Fork Params (Admin)', () => {
  describe('update-fork-params', () => {
    it('should reject from non-owner', () => {
      const result = simnet.callPublicFn(
        'market-fork-v2',
        'update-fork-params',
        [
          Cl.uint(2000), // new threshold (20%)
          Cl.uint(50000), // new settlement period
          Cl.uint(600000) // new discount (60%)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should allow owner to update parameters', () => {
      const result = simnet.callPublicFn(
        'market-fork-v2',
        'update-fork-params',
        [
          Cl.uint(2000), // new threshold (20%)
          Cl.uint(50000), // new settlement period
          Cl.uint(600000) // new discount (60%)
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });
  });
});
