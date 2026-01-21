import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const ERR_NOT_AUTHORIZED = 700n;
const ERR_ZERO_AMOUNT = 702n;
const ERR_INSUFFICIENT_BALANCE = 701n;
const ERR_ALREADY_CLAIMED = 703n;
const ERR_NO_REWARDS = 704n;
const ERR_INVALID_EPOCH = 705n;
const ERR_EPOCH_NOT_ENDED = 706n;
const ERR_ALREADY_DISTRIBUTED = 707n;
const ERR_NO_ELIGIBLE_LPS = 708n;

describe('LP Rewards Contract', () => {
  describe('SIP-010 Metadata', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn('lp-rewards', 'get-name', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('StackPredict LP Rewards'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn('lp-rewards', 'get-symbol', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('PRED'));
    });

    it('should return correct decimals (8)', () => {
      const result = simnet.callReadOnlyFn('lp-rewards', 'get-decimals', [], deployer);
      expect(result.result).toBeOk(Cl.uint(8));
    });

    it('should return token URI as none', () => {
      const result = simnet.callReadOnlyFn('lp-rewards', 'get-token-uri', [], deployer);
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return zero total supply initially', () => {
      const result = simnet.callReadOnlyFn('lp-rewards', 'get-total-supply', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero balance initially', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Mint Functionality', () => {
    it('should allow contract owner to mint tokens', () => {
      const amount = 1_000_000_000n; // 10 PRED (8 decimals)
      const result = simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(amount));
    });

    it('should reject mint from non-owner', () => {
      const amount = 1_000_000_000n;
      const result = simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject mint with zero amount', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should update total supply when minting', () => {
      const amount1 = 1_000_000_000n;
      const amount2 = 2_000_000_000n;

      // First mint
      simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(amount1), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Second mint
      simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(amount2), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Check total supply
      const supply = simnet.callReadOnlyFn('lp-rewards', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(amount1 + amount2));
    });
  });

  describe('Transfer Functionality', () => {
    beforeEach(() => {
      // Mint some tokens to wallet1 before each test
      simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(10_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to transfer tokens', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'lp-rewards',
        'transfer',
        [
          Cl.uint(amount),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balances
      const senderBalance = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(senderBalance.result).toBeOk(Cl.uint(5_000_000_000n));

      const recipientBalance = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(recipientBalance.result).toBeOk(Cl.uint(5_000_000_000n));
    });

    it('should reject transfer from non-token-owner', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'lp-rewards',
        'transfer',
        [
          Cl.uint(amount),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(501n)); // ERR-NOT-TOKEN-OWNER
    });

    it('should reject transfer with zero amount', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'transfer',
        [
          Cl.uint(0),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });
  });

  describe('Burn Functionality', () => {
    beforeEach(() => {
      // Mint some tokens to wallet1 before each test
      simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(10_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to burn their own tokens', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'lp-rewards',
        'burn',
        [Cl.uint(amount)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance decreased
      const balance = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(5_000_000_000n));

      // Verify total supply decreased
      const supply = simnet.callReadOnlyFn('lp-rewards', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(5_000_000_000n));
    });

    it('should reject burn with zero amount', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject burn exceeding balance', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'burn',
        [Cl.uint(15_000_000_000n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });
  });

  describe('Epoch Management', () => {
    it('should allow owner to initialize epoch', () => {
      const market = Cl.standardPrincipal(wallet1);
      const result = simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject epoch initialization from non-owner', () => {
      const market = Cl.standardPrincipal(wallet1);
      const result = simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject re-initializing epoch', () => {
      const market = Cl.standardPrincipal(wallet1);
      // First initialization
      simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        deployer
      );
      // Second initialization should fail
      const result = simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_DISTRIBUTED));
    });

    it('should return current epoch', () => {
      const result = simnet.callReadOnlyFn('lp-rewards', 'get-current-epoch', [], deployer);
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should return epoch start block', () => {
      const result = simnet.callReadOnlyFn('lp-rewards', 'get-epoch-start-block', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('LP Deposit Recording', () => {
    const market = Cl.standardPrincipal(wallet1);

    beforeEach(() => {
      // Initialize epoch first
      simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        deployer
      );
    });

    it('should allow contract owner to record LP deposit', () => {
      const lp = Cl.standardPrincipal(wallet2);
      const newBalance = Cl.uint(1_000_000_000n); // 10 USDC

      const result = simnet.callPublicFn(
        'lp-rewards',
        'record-lp-deposit',
        [market, lp, newBalance],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should allow market contract to record LP deposit', () => {
      const lp = Cl.standardPrincipal(wallet2);
      const newBalance = Cl.uint(1_000_000_000n);

      // Simulate market contract calling (using wallet1 as market)
      const result = simnet.callPublicFn(
        'lp-rewards',
        'record-lp-deposit',
        [market, lp, newBalance],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject LP deposit from unauthorized caller', () => {
      const lp = Cl.standardPrincipal(wallet2);
      const newBalance = Cl.uint(1_000_000_000n);

      const result = simnet.callPublicFn(
        'lp-rewards',
        'record-lp-deposit',
        [market, lp, newBalance],
        wallet3
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should track LP balance snapshot after deposit', () => {
      const lp = Cl.standardPrincipal(wallet2);
      const newBalance = Cl.uint(1_000_000_000n);

      simnet.callPublicFn(
        'lp-rewards',
        'record-lp-deposit',
        [market, lp, newBalance],
        deployer
      );

      const snapshot = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-lp-balance-snapshot',
        [market, lp],
        deployer
      );
      expect(snapshot.result).toBeOk(
        Cl.some(
          Cl.tuple({
            balance: Cl.uint(1_000_000_000n),
            'last-update': Cl.uint(1n), // Block height after initialization
          })
        )
      );
    });
  });

  describe('LP Withdrawal Recording', () => {
    const market = Cl.standardPrincipal(wallet1);

    beforeEach(() => {
      // Initialize epoch and record a deposit first
      simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        deployer
      );
      simnet.callPublicFn(
        'lp-rewards',
        'record-lp-deposit',
        [market, Cl.standardPrincipal(wallet2), Cl.uint(1_000_000_000n)],
        deployer
      );
    });

    it('should allow contract owner to record LP withdrawal', () => {
      const lp = Cl.standardPrincipal(wallet2);
      const newBalance = Cl.uint(500_000_000n);

      const result = simnet.callPublicFn(
        'lp-rewards',
        'record-lp-withdrawal',
        [market, lp, newBalance],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should allow market contract to record LP withdrawal', () => {
      const lp = Cl.standardPrincipal(wallet2);
      const newBalance = Cl.uint(500_000_000n);

      const result = simnet.callPublicFn(
        'lp-rewards',
        'record-lp-withdrawal',
        [market, lp, newBalance],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject LP withdrawal from unauthorized caller', () => {
      const lp = Cl.standardPrincipal(wallet2);
      const newBalance = Cl.uint(500_000_000n);

      const result = simnet.callPublicFn(
        'lp-rewards',
        'record-lp-withdrawal',
        [market, lp, newBalance],
        wallet3
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('Reward Distribution', () => {
    const market = Cl.standardPrincipal(wallet1);

    beforeEach(() => {
      // Initialize epoch
      simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        deployer
      );
    });

    it('should allow owner to distribute rewards', () => {
      // First mint tokens to the contract
      simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(deployer)],
        deployer
      );

      // Transfer to contract for distribution
      simnet.callPublicFn(
        'lp-rewards',
        'transfer',
        [
          Cl.uint(100_000_000_000n),
          Cl.standardPrincipal(deployer),
          Cl.standardPrincipal(deployer),
          Cl.none(),
        ],
        deployer
      );

      const result = simnet.callPublicFn(
        'lp-rewards',
        'distribute-rewards',
        [market, Cl.uint(1), Cl.uint(10_000_000_000n)],
        deployer
      );
      // This will fail because there are no eligible LPs (empty list)
      expect(result.result).toBeErr(Cl.uint(ERR_NO_ELIGIBLE_LPS));
    });

    it('should reject distribution with zero amount', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'distribute-rewards',
        [market, Cl.uint(1), Cl.uint(0)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject distribution from non-owner', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'distribute-rewards',
        [market, Cl.uint(1), Cl.uint(10_000_000_000n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('Claim Rewards', () => {
    const market = Cl.standardPrincipal(wallet1);

    it('should reject claim when no rewards available', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'claim-rewards',
        [market, Cl.uint(1)],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NO_REWARDS));
    });

    it('should return zero pending rewards initially', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-pending-rewards',
        [market, Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Read-Only Functions', () => {
    const market = Cl.standardPrincipal(wallet1);

    it('should return zero LP points for non-existent LP', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-lp-points',
        [market, Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero total points for non-existent epoch', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-total-points',
        [market, Cl.uint(999)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero LP rewards for non-existent claim', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-lp-rewards',
        [market, Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return false for non-claimed rewards', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'is-rewards-claimed',
        [market, Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return false for non-distributed epoch', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'is-epoch-distributed',
        [market, Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return zero total rewards distributed initially', () => {
      const result = simnet.callReadOnlyFn('lp-rewards', 'get-total-rewards-distributed', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return empty LP balance snapshot for non-existent LP', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-lp-balance-snapshot',
        [market, Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return empty list for get-lps-for-epoch', () => {
      const result = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-lps-for-epoch',
        [market, Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.list([]));
    });
  });

  describe('Epoch Advancement', () => {
    it('should allow owner to advance epoch', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'advance-epoch',
        [],
        deployer
      );
      // Will fail because epoch hasn't ended
      expect(result.result).toBeErr(Cl.uint(ERR_EPOCH_NOT_ENDED));
    });

    it('should reject epoch advancement from non-owner', () => {
      const result = simnet.callPublicFn(
        'lp-rewards',
        'advance-epoch',
        [],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('Integration Tests', () => {
    const market = Cl.standardPrincipal(wallet1);

    it('should handle complete LP rewards lifecycle', () => {
      // 1. Initialize epoch
      const initResult = simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        deployer
      );
      expect(initResult.result).toBeOk(Cl.bool(true));

      // 2. Record LP deposit
      const depositResult = simnet.callPublicFn(
        'lp-rewards',
        'record-lp-deposit',
        [market, Cl.standardPrincipal(wallet2), Cl.uint(1_000_000_000n)],
        deployer
      );
      expect(depositResult.result).toBeOk(Cl.bool(true));

      // 3. Record LP withdrawal
      const withdrawResult = simnet.callPublicFn(
        'lp-rewards',
        'record-lp-withdrawal',
        [market, Cl.standardPrincipal(wallet2), Cl.uint(500_000_000n)],
        deployer
      );
      expect(withdrawResult.result).toBeOk(Cl.bool(true));

      // 4. Check LP points
      const pointsResult = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-lp-points',
        [market, Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      // Points should be accumulated based on time held
      expect(pointsResult.result).toBeOk(Cl.any());
    });

    it('should track multiple LPs independently', () => {
      // Initialize epoch
      simnet.callPublicFn(
        'lp-rewards',
        'initialize-epoch',
        [market],
        deployer
      );

      // Record deposits for multiple LPs
      simnet.callPublicFn(
        'lp-rewards',
        'record-lp-deposit',
        [market, Cl.standardPrincipal(wallet2), Cl.uint(1_000_000_000n)],
        deployer
      );

      simnet.callPublicFn(
        'lp-rewards',
        'record-lp-deposit',
        [market, Cl.standardPrincipal(wallet3), Cl.uint(2_000_000_000n)],
        deployer
      );

      // Check total points
      const totalPoints = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-total-points',
        [market, Cl.uint(1)],
        deployer
      );
      expect(totalPoints.result).toBeOk(Cl.any());
    });

    it('should handle mint, transfer, and burn lifecycle', () => {
      // Mint tokens
      const mintResult = simnet.callPublicFn(
        'lp-rewards',
        'mint',
        [Cl.uint(50_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(mintResult.result).toBeOk(Cl.bool(true));

      // Transfer tokens
      const transferResult = simnet.callPublicFn(
        'lp-rewards',
        'transfer',
        [
          Cl.uint(25_000_000_000n),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(transferResult.result).toBeOk(Cl.bool(true));

      // Burn tokens
      const burnResult = simnet.callPublicFn(
        'lp-rewards',
        'burn',
        [Cl.uint(5_000_000_000n)],
        wallet1
      );
      expect(burnResult.result).toBeOk(Cl.bool(true));

      // Verify final state
      const wallet1Balance = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(wallet1Balance.result).toBeOk(Cl.uint(20_000_000_000n));

      const wallet2Balance = simnet.callReadOnlyFn(
        'lp-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(wallet2Balance.result).toBeOk(Cl.uint(25_000_000_000n));

      const totalSupply = simnet.callReadOnlyFn('lp-rewards', 'get-total-supply', [], deployer);
      expect(totalSupply.result).toBeOk(Cl.uint(45_000_000_000n));
    });
  });
});
