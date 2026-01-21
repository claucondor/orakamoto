import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

describe('Yield Distributor Contract', () => {
  beforeEach(() => {
    // Setup: deploy contracts and mint USDC
    simnet.callPublicFn('mock-usdc', 'mint', [Cl.uint(100000000), Cl.standardPrincipal(wallet1)], deployer);
    simnet.callPublicFn('mock-usdc', 'mint', [Cl.uint(100000000), Cl.standardPrincipal(wallet2)], deployer);
  });

  describe('Constants', () => {
    it('should have correct token name', () => {
      const result = simnet.callReadOnlyFn('yield-distributor', 'get-name', [], wallet1);
      expect(result.result).toBeOk(Cl.stringAscii('Yield Distributor Token'));
    });

    it('should have correct token symbol', () => {
      const result = simnet.callReadOnlyFn('yield-distributor', 'get-symbol', [], wallet1);
      expect(result.result).toBeOk(Cl.stringAscii('yLD'));
    });

    it('should have correct decimals', () => {
      const result = simnet.callReadOnlyFn('yield-distributor', 'get-decimals', [], wallet1);
      expect(result.result).toBeOk(Cl.uint(6));
    });
  });

  describe('SIP-010 Token Functions', () => {
    it('should transfer yLD tokens', () => {
      // Mint tokens to wallet1 first
      simnet.callPublicFn(
        'yield-distributor',
        'mint',
        [Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callPublicFn(
        'yield-distributor',
        'transfer',
        [
          Cl.uint(500000),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject transfer from non-token-owner', () => {
      const result = simnet.callPublicFn(
        'yield-distributor',
        'transfer',
        [
          Cl.uint(500000),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      // ft-transfer? returns err u1 when sender doesn't have tokens
      expect(result.result).toBeErr(Cl.uint(1));
    });

    it('should reject zero amount transfer', () => {
      // Mint tokens to wallet1 first
      simnet.callPublicFn(
        'yield-distributor',
        'mint',
        [Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callPublicFn(
        'yield-distributor',
        'transfer',
        [
          Cl.uint(0),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(302)); // ERR-ZERO-AMOUNT
    });

    it('should get total supply', () => {
      // Mint tokens
      simnet.callPublicFn(
        'yield-distributor',
        'mint',
        [Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callReadOnlyFn('yield-distributor', 'get-total-supply', [], wallet1);
      expect(result.result).toBeOk(Cl.uint(1000000));
    });

    it('should return none for token URI', () => {
      const result = simnet.callReadOnlyFn('yield-distributor', 'get-token-uri', [], wallet1);
      expect(result.result).toBeOk(Cl.none());
    });
  });

  describe('Admin Functions', () => {
    it('should allow owner to mint tokens', () => {
      const result = simnet.callPublicFn(
        'yield-distributor',
        'mint',
        [Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject non-owner mint', () => {
      const result = simnet.callPublicFn(
        'yield-distributor',
        'mint',
        [Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(300)); // ERR-NOT-AUTHORIZED
    });

    it('should reject mint with zero amount', () => {
      const result = simnet.callPublicFn(
        'yield-distributor',
        'mint',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(302)); // ERR-ZERO-AMOUNT
    });

    it('should allow token holder to burn tokens', () => {
      // Mint tokens first
      simnet.callPublicFn(
        'yield-distributor',
        'mint',
        [Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callPublicFn(
        'yield-distributor',
        'burn',
        [Cl.uint(500000)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject burn with zero amount', () => {
      const result = simnet.callPublicFn(
        'yield-distributor',
        'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(302)); // ERR-ZERO-AMOUNT
    });

    it('should reject burn with insufficient balance', () => {
      const result = simnet.callPublicFn(
        'yield-distributor',
        'burn',
        [Cl.uint(1000000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(303)); // ERR-INSUFFICIENT-BALANCE
    });
  });

  describe('LP Balance Tracking', () => {
    it('should allow pool to update LP balance', () => {
      const pool = Cl.standardPrincipal(deployer);
      const result = simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, Cl.standardPrincipal(wallet1), Cl.uint(1000000)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject LP balance update from non-pool', () => {
      const pool = Cl.standardPrincipal(deployer);
      const result = simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, Cl.standardPrincipal(wallet1), Cl.uint(1000000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(300)); // ERR-NOT-AUTHORIZED
    });

    it('should allow pool to update total LP supply', () => {
      const pool = Cl.standardPrincipal(deployer);
      const result = simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject LP supply update from non-pool', () => {
      const pool = Cl.standardPrincipal(deployer);
      const result = simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(300)); // ERR-NOT-AUTHORIZED
    });

    it('should get LP time-weighted balance after update', () => {
      const pool = Cl.standardPrincipal(deployer);
      // Update LP balance
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, Cl.standardPrincipal(wallet1), Cl.uint(1000000)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'get-lp-time-weighted-balance',
        [pool, Cl.standardPrincipal(wallet1)],
        wallet1
      );
      // Result is (ok (tuple (balance u1000000) (last-update u4)))
      expect(result.result.type).toBe('ok');
    });

    it('should get pool total LP supply after update', () => {
      const pool = Cl.standardPrincipal(deployer);
      // Update pool LP supply
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'get-pool-total-lp-supply',
        [pool],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(5000000));
    });
  });

  describe('Yield Deposit and Calculation', () => {
    it('should reject yield deposit from unauthorized caller', () => {
      const pool = Cl.standardPrincipal(deployer);
      const result = simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(300)); // ERR-NOT-AUTHORIZED
    });

    it('should reject yield deposit with zero amount', () => {
      const pool = Cl.standardPrincipal(deployer);
      // Call from deployer (simulating yield-vault)
      const result = simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(0)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(302)); // ERR-ZERO-AMOUNT
    });

    it('should calculate pending yield correctly', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup: update LP balance and total supply, then deposit yield
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      // LP has 1/5 of total supply, should get 1/5 of yield = 200000
      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'calculate-pending-yield',
        [pool, lp],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(200000)); // (1000000 * 1000000) / 5000000 = 200000
    });

    it('should return zero pending yield if already claimed', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      // Claim yield first
      simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );

      // Now pending yield should be 0
      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'calculate-pending-yield',
        [pool, lp],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero pending yield if no LP info', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Deposit yield without updating LP balance
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'calculate-pending-yield',
        [pool, lp],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero pending yield if no LP supply', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Update LP balance but not total supply
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'calculate-pending-yield',
        [pool, lp],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Yield Claim', () => {
    it('should allow LP to claim yield', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      const result = simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(200000)); // 1/5 of yield
    });

    it('should reject claim if already claimed', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      // First claim
      simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );

      // Second claim should fail
      const result = simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(304)); // ERR-ALREADY-CLAIMED
    });

    it('should reject claim if no yield available', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup LP but no yield deposited
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );

      const result = simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(305)); // ERR-NO-YIELD-AVAILABLE
    });

    it('should reject claim if LP not initialized', () => {
      const pool = Cl.standardPrincipal(deployer);

      // Deposit yield but don't update LP balance
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      const result = simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(307)); // ERR-NOT-INITIALIZED
    });

    it('should update total claims after yield claim', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      // Claim yield
      simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );

      // Check total claims
      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'get-total-claims',
        [],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(200000));
    });

    it('should update pending yield tracking after claim', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      // Claim yield
      simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );

      // Check pending yield
      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'get-pending-yield',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(200000));
    });

    it('should update total yield accumulated after deposit', () => {
      const pool = Cl.standardPrincipal(deployer);

      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'get-total-yield-accumulated',
        [],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(1000000));
    });

    it('should check if user has claimed yield', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(1000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      // Before claim
      let result = simnet.callReadOnlyFn(
        'yield-distributor',
        'get-has-claimed-yield',
        [pool, lp],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(false));

      // Claim yield
      simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );

      // After claim
      result = simnet.callReadOnlyFn(
        'yield-distributor',
        'get-has-claimed-yield',
        [pool, lp],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });
  });

  describe('Integration Tests', () => {
    it('should handle full yield lifecycle: update balances -> deposit -> calculate -> claim', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp1 = Cl.standardPrincipal(wallet1);
      const lp2 = Cl.standardPrincipal(wallet2);

      // 1. Update LP balances for two LPs
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp1, Cl.uint(3000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp2, Cl.uint(2000000)],
        deployer
      );

      // 2. Update total LP supply (5M total)
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(5000000)],
        deployer
      );

      // 3. Deposit yield (1M)
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(1000000)],
        deployer
      );

      // 4. LP1 should get 600000 (60% of yield)
      let result = simnet.callReadOnlyFn(
        'yield-distributor',
        'calculate-pending-yield',
        [pool, lp1],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(600000));

      // 5. LP2 should get 400000 (40% of yield)
      result = simnet.callReadOnlyFn(
        'yield-distributor',
        'calculate-pending-yield',
        [pool, lp2],
        wallet2
      );
      expect(result.result).toBeOk(Cl.uint(400000));

      // 6. LP1 claims yield
      result = simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(600000));

      // 7. LP2 claims yield
      result = simnet.callPublicFn(
        'yield-distributor',
        'claim-yield',
        [pool],
        wallet2
      );
      expect(result.result).toBeOk(Cl.uint(400000));

      // 8. Verify total claims equals 1M
      result = simnet.callReadOnlyFn(
        'yield-distributor',
        'get-total-claims',
        [],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(1000000));
    });

    it('should handle multiple yield deposits', () => {
      const pool = Cl.standardPrincipal(deployer);
      const lp = Cl.standardPrincipal(wallet1);

      // Setup
      simnet.callPublicFn(
        'yield-distributor',
        'update-lp-balance',
        [pool, lp, Cl.uint(5000000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'update-pool-lp-supply',
        [pool, Cl.uint(10000000)],
        deployer
      );

      // Deposit yield twice
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(500000)],
        deployer
      );
      simnet.callPublicFn(
        'yield-distributor',
        'deposit-yield',
        [pool, Cl.uint(500000)],
        deployer
      );

      // LP should get 50% of total yield (1M) = 500000
      const result = simnet.callReadOnlyFn(
        'yield-distributor',
        'calculate-pending-yield',
        [pool, lp],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(500000));
    });
  });
});
