import { describe, it, expect } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;

// Constants matching the contract
const ERR_INVALID_DURATION = 805n;

// Lock duration constants (in blocks)
const MIN_LOCK_DURATION = 1008n; // 1 week
const MAX_LOCK_DURATION = 210240n; // 4 years

describe('Vote-Escrow Contract', () => {
  describe('Read-Only Functions - Constants', () => {
    it('should return max lock duration', () => {
      const result = simnet.callReadOnlyFn('vote-escrow', 'get-max-lock-duration', [], deployer);
      expect(result.result).toBeOk(Cl.uint(MAX_LOCK_DURATION));
    });

    it('should return min lock duration', () => {
      const result = simnet.callReadOnlyFn('vote-escrow', 'get-min-lock-duration', [], deployer);
      expect(result.result).toBeOk(Cl.uint(MIN_LOCK_DURATION));
    });

    it('should return current block height', () => {
      const result = simnet.callReadOnlyFn('vote-escrow', 'get-current-block-height', [], deployer);
      expect(result.result).toBeOk(Cl.uint(simnet.blockHeight));
    });
  });

  describe('Read-Only Functions - Lock State', () => {
    it('should return none for get-lock when no lock exists', () => {
      const result = simnet.callReadOnlyFn(
        'vote-escrow',
        'get-lock',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return zero voting power for user with no lock', () => {
      const result = simnet.callReadOnlyFn(
        'vote-escrow',
        'get-voting-power',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return false for has-active-lock when no lock exists', () => {
      const result = simnet.callReadOnlyFn(
        'vote-escrow',
        'has-active-lock',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return zero total locked initially', () => {
      const result = simnet.callReadOnlyFn('vote-escrow', 'get-total-locked', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Voting Power Calculation', () => {
    it('should calculate voting power correctly for minimum lock duration', () => {
      const amount = 100_000_000_000n; // 1000 PRED
      const duration = MIN_LOCK_DURATION;

      const result = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(duration)],
        deployer
      );

      // voting-power = amount * (lock-duration / MAX-LOCK-DURATION)
      // = 100_000_000_000 * (1008 / 210240)
      // = 100_000_000_000 * 1008 / 210240 = 479_452_054
      expect(result.result).toBeOk(Cl.uint(479452054n));
    });

    it('should calculate maximum voting power for maximum lock duration', () => {
      const amount = 100_000_000_000n; // 1000 PRED
      const duration = MAX_LOCK_DURATION;

      const result = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(duration)],
        deployer
      );

      // voting-power = amount * (MAX / MAX) = amount
      expect(result.result).toBeOk(Cl.uint(100_000_000_000n));
    });

    it('should reject calculating voting power with invalid duration (below minimum)', () => {
      const amount = 100_000_000_000n;
      const duration = MIN_LOCK_DURATION - 1n;

      const result = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(duration)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_DURATION));
    });

    it('should reject calculating voting power with invalid duration (above maximum)', () => {
      const amount = 100_000_000_000n;
      const duration = MAX_LOCK_DURATION + 1n;

      const result = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(duration)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_DURATION));
    });

    it('should calculate max voting power for given amount', () => {
      const amount = 50_000_000_000n;

      const result = simnet.callReadOnlyFn(
        'vote-escrow',
        'get-max-voting-power',
        [Cl.uint(amount)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(50_000_000_000n));
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete voting power lifecycle', () => {
      // Check initial voting power (should be 0)
      const initialPower = simnet.callReadOnlyFn(
        'vote-escrow',
        'get-voting-power',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(initialPower.result).toBeOk(Cl.uint(0));

      // Check initial total locked
      const initialTotal = simnet.callReadOnlyFn('vote-escrow', 'get-total-locked', [], deployer);
      expect(initialTotal.result).toBeOk(Cl.uint(0));
    });

    it('should calculate voting power proportionally to lock duration', () => {
      const amount = 100_000_000_000n;

      // Calculate voting power for different durations
      const oneWeek = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(MIN_LOCK_DURATION)],
        deployer
      );

      const oneYear = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(52416n)], // ~1 year
        deployer
      );

      const fourYears = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(MAX_LOCK_DURATION)],
        deployer
      );

      // All should succeed with expected values
      expect(oneWeek.result).toBeOk(Cl.uint(479452054n)); // 1000 PRED * 1008 / 210240
      expect(oneYear.result).toBeOk(Cl.uint(24931506849n)); // 1000 PRED * 52416 / 210240
      expect(fourYears.result).toBeOk(Cl.uint(amount));

      // Verify ordering - extract values from Cl.uint objects
      const weekPower = (oneWeek.result as any).value.value;
      const yearPower = (oneYear.result as any).value.value;
      const maxPower = (fourYears.result as any).value.value;

      expect(yearPower).toBeGreaterThan(weekPower);
      expect(maxPower).toBeGreaterThan(yearPower);
      expect(maxPower).toBe(amount);
    });

    it('should handle multiple users with different lock strategies', () => {
      const amount = 100_000_000_000n;

      // User 1: Short lock (minimum)
      const shortLock = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(MIN_LOCK_DURATION)],
        deployer
      );

      // User 2: Medium lock (1 year)
      const mediumLock = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(52416n)],
        deployer
      );

      // User 3: Long lock (maximum)
      const longLock = simnet.callReadOnlyFn(
        'vote-escrow',
        'calculate-voting-power',
        [Cl.uint(amount), Cl.uint(MAX_LOCK_DURATION)],
        deployer
      );

      // All should succeed and return uint values
      expect(shortLock.result).toBeOk(Cl.uint(479452054n)); // 1000 PRED * 1008 / 210240
      expect(mediumLock.result).toBeOk(Cl.uint(24931506849n)); // 1000 PRED * 52416 / 210240
      expect(longLock.result).toBeOk(Cl.uint(amount));

      // Verify ordering - extract values from Cl.uint objects
      const weekPower = (shortLock.result as any).value.value;
      const yearPower = (mediumLock.result as any).value.value;
      const maxPower = (longLock.result as any).value.value;

      expect(yearPower).toBeGreaterThan(weekPower);
      expect(maxPower).toBeGreaterThan(yearPower);
      expect(maxPower).toBe(amount);
    });
  });
});
