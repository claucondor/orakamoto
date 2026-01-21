import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Contract addresses (constructed manually since getContractAddress is not available in newer SDK)
const MOCK_USDC_CONTRACT = `${deployer}.mock-usdc`;

// Error constants
const ERR_NOT_AUTHORIZED = 1500n;
const ERR_ZERO_AMOUNT = 1501n;
const ERR_MARKET_NOT_FOUND = 1502n;
const ERR_ALREADY_FORKED = 1503n;
const ERR_FORK_NOT_INITIATED = 1504n;
const ERR_FORK_NOT_SETTLED = 1505n;
const ERR_INVALID_FORK_CHOICE = 1506n;
const ERR_NO_POSITION_FOUND = 1507n;
const ERR_ALREADY_MIGRATED = 1508n;
const ERR_FORK_NOT_CANONICAL = 1509n;
const ERR_THRESHOLD_NOT_REACHED = 1510n;

// Constants
const FORK_THRESHOLD = 1000n; // 10% in basis points
const FORK_SETTLEMENT_PERIOD = 43200n; // 30 days in blocks
const FORK_DISCOUNT = 500000n; // 50% discount (500000 / 1000000 = 0.5)
const PRECISION = 1000000n;

describe('Market Fork Contract', () => {
  describe('Check Fork Threshold', () => {
    // Note: check-fork-threshold is a private function, so we test it indirectly
    // through the initiate-fork public function

    it('should return true when disputed percentage exceeds threshold', () => {
      // 10% disputed (exactly at threshold) - should succeed
      const disputeStake = 100_000_000n; // 100 USDC
      const totalSupply = 1_000_000_000n; // 1,000 USDC (10% disputed)

      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1), // original-market-id
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0), // original-resolution (YES)
          Cl.uint(1), // disputed-resolution (NO)
          Cl.principal(`${deployer}.mock-usdc`)
        ],
        wallet1
      );

      // Should succeed since 10% >= threshold
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should return false when disputed percentage is below threshold', () => {
      // 5% disputed (below threshold) - should fail
      const disputeStake = 50_000_000n; // 50 USDC
      const totalSupply = 1_000_000_000n; // 1,000 USDC (5% disputed)

      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1), // original-market-id
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0), // original-resolution (YES)
          Cl.uint(1), // disputed-resolution (NO)
          Cl.principal(`${deployer}.mock-usdc`)
        ],
        wallet1
      );

      // Should fail since 5% < threshold
      expect(result.result).toBeErr(Cl.uint(ERR_THRESHOLD_NOT_REACHED));
    });

    it('should handle zero total supply gracefully', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1), // original-market-id
          Cl.uint(100_000_000n),
          Cl.uint(0), // zero total supply
          Cl.uint(0), // original-resolution (YES)
          Cl.uint(1), // disputed-resolution (NO)
          Cl.principal(`${deployer}.mock-usdc`)
        ],
        wallet1
      );

      // Should fail with threshold not reached (0% disputed when total supply is 0)
      expect(result.result).toBeErr(Cl.uint(ERR_THRESHOLD_NOT_REACHED));
    });
  });

  describe('Initiate Fork', () => {
    it('should allow initiating fork when threshold is reached', () => {
      const disputeStake = 100_000_000n;
      const totalSupply = 1_000_000_000n;

      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1), // original-market-id
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0), // original-resolution (YES)
          Cl.uint(1), // disputed-resolution (NO)
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(1)); // fork-id
    });

    it('should reject when threshold is not reached', () => {
      const disputeStake = 50_000_000n; // 5% disputed
      const totalSupply = 1_000_000_000n;

      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_THRESHOLD_NOT_REACHED));
    });

    it('should reject invalid original resolution', () => {
      const disputeStake = 100_000_000n;
      const totalSupply = 1_000_000_000n;

      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(2), // Invalid resolution
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_FORK_CHOICE));
    });

    it('should reject invalid disputed resolution', () => {
      const disputeStake = 100_000_000n;
      const totalSupply = 1_000_000_000n;

      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0),
          Cl.uint(2), // Invalid resolution
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_FORK_CHOICE));
    });

    it('should reject when original and disputed resolutions are the same', () => {
      const disputeStake = 100_000_000n;
      const totalSupply = 1_000_000_000n;

      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0), // Both YES
          Cl.uint(0), // Both YES
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_FORK_CHOICE));
    });

    it('should reject initiating fork twice for same market', () => {
      const disputeStake = 100_000_000n;
      const totalSupply = 1_000_000_000n;

      // First initiation
      simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      // Second attempt
      const result = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_FORKED));
    });
  });

  describe('Migrate Position', () => {
    beforeEach(() => {
      // Set up a fork for testing
      const disputeStake = 100_000_000n;
      const totalSupply = 1_000_000_000n;

      simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );
    });

    it('should allow migrating to fork A', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1), // original-market-id
          Cl.uint(0), // fork-choice (A)
          Cl.uint(100_000_000n), // yes-balance
          Cl.uint(200_000_000n), // no-balance
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should allow migrating to fork B', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(1), // fork-choice (B)
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject invalid fork choice', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(2), // Invalid fork choice
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_FORK_CHOICE));
    });

    it('should reject when fork is not initiated', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(999), // Non-existent fork
          Cl.uint(0),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_FORK_NOT_INITIATED));
    });

    it('should reject when user already migrated', () => {
      // First migration
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      // Second attempt
      const result = simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_MIGRATED));
    });

    it('should track fork totals correctly', () => {
      // Migrate wallet1 to fork A
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      // Migrate wallet2 to fork A
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(50_000_000n),
          Cl.uint(150_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2
      );

      // Migrate wallet3 to fork B
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(300_000_000n),
          Cl.uint(100_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet3
      );

      // Check fork state
      const forkStateResult = simnet.callReadOnlyFn(
        'market-fork',
        'get-fork-state',
        [Cl.uint(1)],
        wallet1
      );

      const forkState = forkStateResult.result;
      // Check that fork state exists and has correct values (excluding timing-dependent initiated-at)
      expect(forkState).toBeOk(Cl.some(Cl.any()));

      // Extract and verify specific fields
      const forkStateValue = (forkState as any).value.value;
      expect(forkStateValue['original-market-id']).toEqual(Cl.uint(1));
      expect(forkStateValue['fork-a-market-id']).toEqual(Cl.uint(1));
      expect(forkStateValue['fork-b-market-id']).toEqual(Cl.uint(1000001));
      expect(forkStateValue['initiated-by']).toEqual(Cl.standardPrincipal(wallet1));
      expect(forkStateValue['settled-at']).toEqual(Cl.none());
      expect(forkStateValue['canonical-fork']).toEqual(Cl.none());
      expect(forkStateValue['total-staked-a']).toEqual(Cl.uint(500_000_000n));
      expect(forkStateValue['total-staked-b']).toEqual(Cl.uint(400_000_000n));
      expect(forkStateValue['dispute-stake']).toEqual(Cl.uint(100_000_000n));
      expect(forkStateValue['total-supply']).toEqual(Cl.uint(1_000_000_000n));
    });
  });

  describe('Settle Fork', () => {
    beforeEach(() => {
      // Set up a fork and migrate positions
      const disputeStake = 100_000_000n;
      const totalSupply = 1_000_000_000n;

      simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );
    });

    it('should reject settling before settlement period ends', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'settle-fork',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_FORK_NOT_SETTLED));
    });

    it('should settle fork A as canonical when it has more staked', () => {
      // Migrate more to fork A
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(1_000_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      // Migrate less to fork B
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(100_000_000n),
          Cl.uint(100_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2
      );

      // Advance block height to settle
      simnet.mineEmptyBlocks(Number(FORK_SETTLEMENT_PERIOD));

      const result = simnet.callPublicFn(
        'market-fork',
        'settle-fork',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(0)); // Fork A wins
    });

    it('should settle fork B as canonical when it has more staked', () => {
      // Migrate less to fork A
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(100_000_000n),
          Cl.uint(100_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      // Migrate more to fork B
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1_000_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2
      );

      // Advance block height to settle
      simnet.mineEmptyBlocks(Number(FORK_SETTLEMENT_PERIOD));

      const result = simnet.callPublicFn(
        'market-fork',
        'settle-fork',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(1)); // Fork B wins
    });

    it('should give fork B the win on ties', () => {
      // Equal staking
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(500_000_000n),
          Cl.uint(500_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(500_000_000n),
          Cl.uint(500_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2
      );

      // Advance block height to settle
      simnet.mineEmptyBlocks(Number(FORK_SETTLEMENT_PERIOD));

      const result = simnet.callPublicFn(
        'market-fork',
        'settle-fork',
        [Cl.uint(1)],
        wallet1
      );

      // On ties, fork B (disputed resolution) wins
      expect(result.result).toBeOk(Cl.uint(1));
    });
  });

  describe('Claim Functions', () => {
    beforeEach(() => {
      // Set up a fork, migrate positions, and settle
      const disputeStake = 100_000_000n;
      const totalSupply = 1_000_000_000n;

      // Initiate fork
      simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(disputeStake),
          Cl.uint(totalSupply),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      // Migrate wallet1 to fork A
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      // Migrate wallet2 to fork B
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2
      );

      // Settle fork (fork B wins)
      simnet.mineEmptyBlocks(Number(FORK_SETTLEMENT_PERIOD));
      simnet.callPublicFn(
        'market-fork',
        'settle-fork',
        [Cl.uint(1)],
        wallet1
      );
    });

    it('should allow claiming from canonical fork', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'claim-canonical',
        [
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2 // wallet2 migrated to fork B which won
      );

      expect(result.result).toBeOk(Cl.uint(300_000_000n)); // 100 + 200 = 300 USDC
    });

    it('should reject claiming canonical when user migrated to non-canonical', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'claim-canonical',
        [
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1 // wallet1 migrated to fork A which lost
      );

      expect(result.result).toBeErr(Cl.uint(ERR_FORK_NOT_CANONICAL));
    });

    it('should allow claiming from non-canonical fork at discount', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'claim-non-canonical',
        [
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1 // wallet1 migrated to fork A which lost
      );

      // 50% discount: 300 USDC * 0.5 = 150 USDC
      expect(result.result).toBeOk(Cl.uint(150_000_000n));
    });

    it('should reject claiming non-canonical when user migrated to canonical', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'claim-non-canonical',
        [
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2 // wallet2 migrated to fork B which won
      );

      expect(result.result).toBeErr(Cl.uint(ERR_FORK_NOT_CANONICAL));
    });

    it('should reject claiming when fork is not settled', () => {
      // Set up a new unsettled fork
      simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(2),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(2),
          Cl.uint(0),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      const result = simnet.callPublicFn(
        'market-fork',
        'claim-canonical',
        [
          Cl.uint(2),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_FORK_NOT_SETTLED));
    });

    it('should reject claiming when position not found', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'claim-canonical',
        [
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet3 // wallet3 never migrated
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NO_POSITION_FOUND));
    });
  });

  describe('Read-Only Functions', () => {
    beforeEach(() => {
      // Set up a fork for testing
      simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );
    });

    it('should get fork state', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork',
        'get-fork-state',
        [Cl.uint(1)],
        wallet1
      );

      // Verify fork state exists and has correct structure (excluding timing-dependent initiated-at)
      expect(result.result).toBeOk(Cl.some(Cl.any()));

      // Extract and verify specific fields
      const forkState = (result.result as any).value.value;
      expect(forkState['original-market-id']).toEqual(Cl.uint(1));
      expect(forkState['fork-a-market-id']).toEqual(Cl.uint(1));
      expect(forkState['fork-b-market-id']).toEqual(Cl.uint(1000001));
      expect(forkState['initiated-by']).toEqual(Cl.standardPrincipal(wallet1));
      expect(forkState['settled-at']).toEqual(Cl.none());
      expect(forkState['canonical-fork']).toEqual(Cl.none());
      expect(forkState['total-staked-a']).toEqual(Cl.uint(0));
      expect(forkState['total-staked-b']).toEqual(Cl.uint(0));
      expect(forkState['dispute-stake']).toEqual(Cl.uint(100_000_000n));
      expect(forkState['total-supply']).toEqual(Cl.uint(1_000_000_000n));
    });

    it('should get market fork', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork',
        'get-market-fork',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.some(Cl.uint(1)));
    });

    it('should get user position', () => {
      // Migrate a position first
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-fork',
        'get-user-position',
        [Cl.uint(1), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Verify position exists and has correct values (excluding timing-dependent migrated-at)
      expect(result.result).toBeOk(Cl.some(Cl.any()));

      // Extract and verify specific fields
      const position = (result.result as any).value.value;
      expect(position['yes-balance']).toEqual(Cl.uint(100_000_000n));
      expect(position['no-balance']).toEqual(Cl.uint(200_000_000n));
      expect(position['migrated-to']).toEqual(Cl.some(Cl.uint(0)));
      // migrated-at is timing-dependent, so we just check it exists
      expect(position['migrated-at']).toBeDefined();
    });

    it('should get fork users', () => {
      // Migrate positions
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(100_000_000n),
          Cl.uint(200_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'market-fork',
        'get-fork-users',
        [Cl.uint(1), Cl.uint(0)],
        wallet1
      );

      expect(result.result).toBeOk(
        Cl.list([Cl.standardPrincipal(wallet1)])
      );
    });

    it('should check if fork is settled', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork',
        'is-fork-settled',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should check if fork is canonical', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork',
        'is-fork-canonical',
        [Cl.uint(1), Cl.uint(0)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should get fork ID counter', () => {
      const result = simnet.callReadOnlyFn(
        'market-fork',
        'get-fork-id-counter',
        [],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(1));
    });
  });

  describe('Admin Functions', () => {
    it('should allow owner to reset fork', () => {
      // Set up a fork
      simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      const result = simnet.callPublicFn(
        'market-fork',
        'reset-fork',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject non-owner from resetting fork', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'reset-fork',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should allow owner to update fork params', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'update-fork-params',
        [
          Cl.uint(200000n), // new threshold (20%)
          Cl.uint(86400n), // new settlement period (60 days)
          Cl.uint(750000n) // new discount (75%)
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject non-owner from updating params', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'update-fork-params',
        [
          Cl.uint(200000n),
          Cl.uint(86400n),
          Cl.uint(750000n)
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject zero threshold', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'update-fork-params',
        [
          Cl.uint(0),
          Cl.uint(86400n),
          Cl.uint(750000n)
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject zero settlement period', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'update-fork-params',
        [
          Cl.uint(200000n),
          Cl.uint(0),
          Cl.uint(750000n)
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject discount exceeding precision', () => {
      const result = simnet.callPublicFn(
        'market-fork',
        'update-fork-params',
        [
          Cl.uint(200000n),
          Cl.uint(86400n),
          Cl.uint(1500000n) // 150% - exceeds 100%
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });
  });

  describe('Integration Tests', () => {
    it('should complete full fork lifecycle', () => {
      // Step 1: Initiate fork
      const initiateResult = simnet.callPublicFn(
        'market-fork',
        'initiate-fork',
        [
          Cl.uint(1),
          Cl.uint(100_000_000n),
          Cl.uint(1_000_000_000n),
          Cl.uint(0),
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );
      expect(initiateResult.result).toBeOk(Cl.uint(1));

      // Step 2: Migrate positions
      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(500_000_000n),
          Cl.uint(500_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );

      simnet.callPublicFn(
        'market-fork',
        'migrate-position',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(600_000_000n),
          Cl.uint(600_000_000n),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2
      );

      // Step 3: Settle fork (fork B wins)
      simnet.mineEmptyBlocks(Number(FORK_SETTLEMENT_PERIOD));
      const settleResult = simnet.callPublicFn(
        'market-fork',
        'settle-fork',
        [Cl.uint(1)],
        wallet1
      );
      expect(settleResult.result).toBeOk(Cl.uint(1));

      // Step 4: Canonical claim (wallet2)
      const canonicalClaim = simnet.callPublicFn(
        'market-fork',
        'claim-canonical',
        [
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet2
      );
      expect(canonicalClaim.result).toBeOk(Cl.uint(1_200_000_000n)); // 600 + 600

      // Step 5: Non-canonical claim (wallet1 at discount)
      const nonCanonicalClaim = simnet.callPublicFn(
        'market-fork',
        'claim-non-canonical',
        [
          Cl.uint(1),
          Cl.principal(MOCK_USDC_CONTRACT)
        ],
        wallet1
      );
      expect(nonCanonicalClaim.result).toBeOk(Cl.uint(500_000_000n)); // 1000 * 0.5 = 500
    });
  });
});
