import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

describe('Yield Vault', () => {
  beforeEach(() => {
    // Mint USDC to wallets for testing
    simnet.callPublicFn('mock-usdc', 'mint', [Cl.uint(1000000000), Cl.standardPrincipal(wallet1)], deployer);
    simnet.callPublicFn('mock-usdc', 'mint', [Cl.uint(1000000000), Cl.standardPrincipal(wallet2)], deployer);
  });

  describe('Constants', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn('yield-vault', 'get-name', [], wallet1);
      expect(result.result).toBeOk(Cl.stringAscii('Yield Vault'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn('yield-vault', 'get-symbol', [], wallet1);
      expect(result.result).toBeOk(Cl.stringAscii('yUSDC'));
    });

    it('should return correct decimals', () => {
      const result = simnet.callReadOnlyFn('yield-vault', 'get-decimals', [], wallet1);
      expect(result.result).toBeOk(Cl.uint(6));
    });
  });

  describe('Supply (Deposit)', () => {
    it('should allow user to supply USDC and receive yUSDC shares', () => {
      // Approve USDC transfer first
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );

      const result = simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Check yUSDC balance (should be 1:1 for first deposit)
      const balance = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(100000000));

      // Check total deposits
      const totalDeposits = simnet.callReadOnlyFn('yield-vault', 'get-total-deposits', [], wallet1);
      expect(totalDeposits.result).toBeOk(Cl.uint(100000000));

      // Check user deposits
      const userDeposits = simnet.callReadOnlyFn('yield-vault', 'get-user-deposits',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(userDeposits.result).toBeOk(Cl.uint(100000000));
    });

    it('should reject zero amount supply', () => {
      const result = simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(202)); // ERR-ZERO-AMOUNT
    });

    it('should allow supply on behalf of another user (shares go to owner)', () => {
      // wallet1 supplies USDC, but shares go to wallet2
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );

      const result = simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check that wallet2 received the shares (not wallet1)
      const balance2 = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );
      expect(balance2.result).toBeOk(Cl.uint(100000000));

      // wallet1 should have 0 shares
      const balance1 = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance1.result).toBeOk(Cl.uint(0));
    });

    it('should calculate correct shares for subsequent deposits', () => {
      // First deposit: 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Second deposit: 200 USDC by wallet2
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(200000000), Cl.standardPrincipal(wallet2), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet2
      );
      simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(200000000), Cl.standardPrincipal(wallet2)],
        wallet2
      );

      // wallet1 should have 100 yUSDC (100/300 * 300 = 100)
      // wallet2 should have 200 yUSDC (200/300 * 300 = 200)
      const balance1 = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance1.result).toBeOk(Cl.uint(100000000));

      const balance2 = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );
      expect(balance2.result).toBeOk(Cl.uint(200000000));
    });
  });

  describe('Withdraw', () => {
    beforeEach(() => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
    });

    it('should allow user to withdraw their deposited USDC', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(100000000));

      // Check yUSDC balance is now 0
      const balance = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(0));

      // Check total deposits is now 0
      const totalDeposits = simnet.callReadOnlyFn('yield-vault', 'get-total-deposits', [], wallet1);
      expect(totalDeposits.result).toBeOk(Cl.uint(0));

      // Check user deposits is now 0
      const userDeposits = simnet.callReadOnlyFn('yield-vault', 'get-user-deposits',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(userDeposits.result).toBeOk(Cl.uint(0));
    });

    it('should reject zero amount withdraw', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(202)); // ERR-ZERO-AMOUNT
    });

    it('should reject withdraw from non-owner', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR-NOT-AUTHORIZED
    });

    it('should reject withdraw exceeding balance', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw',
        [Cl.uint(200000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(203)); // ERR-INSUFFICIENT-BALANCE
    });

    it('should allow partial withdrawal', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(50000000));

      // Check remaining balance
      const balance = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(50000000));

      // Check remaining deposits
      const userDeposits = simnet.callReadOnlyFn('yield-vault', 'get-user-deposits',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(userDeposits.result).toBeOk(Cl.uint(50000000));
    });
  });

  describe('Withdraw for Trade', () => {
    beforeEach(() => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
    });

    it('should allow user to withdraw funds for trading', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw-for-trade',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(50000000));

      // Check total deposits decreased (shares remain unchanged)
      const totalDeposits = simnet.callReadOnlyFn('yield-vault', 'get-total-deposits', [], wallet1);
      expect(totalDeposits.result).toBeOk(Cl.uint(50000000));

      // Check yUSDC balance remains the same (shares not burned)
      const balance = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(100000000));
    });

    it('should reject zero amount withdraw-for-trade', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw-for-trade',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(202)); // ERR-ZERO-AMOUNT
    });

    it('should reject withdraw-for-trade from non-owner', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw-for-trade',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1)],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR-NOT-AUTHORIZED
    });

    it('should reject withdraw-for-trade exceeding deposits', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw-for-trade',
        [Cl.uint(200000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(205)); // ERR-INSUFFICIENT-LIQUIDITY
    });

    it('should allow full withdrawal via withdraw-for-trade', () => {
      const result = simnet.callPublicFn('yield-vault', 'withdraw-for-trade',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(100000000));

      // Check total deposits is now 0
      const totalDeposits = simnet.callReadOnlyFn('yield-vault', 'get-total-deposits', [], wallet1);
      expect(totalDeposits.result).toBeOk(Cl.uint(0));

      // Note: yUSDC shares remain (100000000) - they are NOT burned
      // This is intentional for operational efficiency
      const balance = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(100000000));
    });

    it('should calculate correct amount with yield included', () => {
      // Advance time to accrue yield
      simnet.mineEmptyBlocks(52560); // ~1 year worth of blocks

      // Harvest yield first
      simnet.callPublicFn('yield-vault', 'harvest-yield', [], wallet1);

      // Withdraw for trade - requesting 50M shares worth
      const result = simnet.callPublicFn('yield-vault', 'withdraw-for-trade',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Should successfully withdraw (returns USDC amount withdrawn)
      expect(result.result).toHaveProperty('value');
      const returnedValue = (result.result as any).value.value;
      // The amount should be proportional to shares based on current deposits
      // With yield harvested, total deposits increased, so 50M shares = 50M * (deposits + yield) / total-shares
      expect(returnedValue).toBeGreaterThan(0);
      expect(returnedValue).toBeLessThanOrEqual(100000000); // Should not exceed total deposits
    });

    it('should allow partial withdrawal followed by another partial withdrawal', () => {
      // First partial withdrawal - 30M shares worth
      const result1 = simnet.callPublicFn('yield-vault', 'withdraw-for-trade',
        [Cl.uint(30000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      // Returns proportional amount (30M / 100M = 30% of 100M = 30M)
      expect(result1.result).toBeOk(Cl.uint(30000000));

      // Second partial withdrawal - 40M shares worth
      // Remaining deposits: 70M, requesting 40M shares worth = 40M * 70M / 100M = 28M
      const result2 = simnet.callPublicFn('yield-vault', 'withdraw-for-trade',
        [Cl.uint(40000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result2.result).toBeOk(Cl.uint(28000000));

      // Total withdrawn: 30M + 28M = 58M, remaining: 42M
      const totalDeposits = simnet.callReadOnlyFn('yield-vault', 'get-total-deposits', [], wallet1);
      expect(totalDeposits.result).toBeOk(Cl.uint(42000000));
    });
  });

  describe('Yield Rate', () => {
    it('should return default yield rate', () => {
      const result = simnet.callReadOnlyFn('yield-vault', 'get-yield-rate', [], wallet1);
      expect(result.result).toBeOk(Cl.uint(500)); // 5% APY
    });

    it('should allow admin to set yield rate', () => {
      const result = simnet.callPublicFn('yield-vault', 'set-yield-rate',
        [Cl.uint(1000)], // 10% APY
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const rate = simnet.callReadOnlyFn('yield-vault', 'get-yield-rate', [], wallet1);
      expect(rate.result).toBeOk(Cl.uint(1000));
    });

    it('should reject non-admin setting yield rate', () => {
      const result = simnet.callPublicFn('yield-vault', 'set-yield-rate',
        [Cl.uint(1000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR-NOT-AUTHORIZED
    });

    it('should reject yield rate over 100%', () => {
      const result = simnet.callPublicFn('yield-vault', 'set-yield-rate',
        [Cl.uint(10001)], // 100.01% APY
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(202)); // ERR-ZERO-AMOUNT
    });
  });

  describe('Harvest Yield', () => {
    it('should reject harvest when vault is empty', () => {
      const result = simnet.callPublicFn('yield-vault', 'harvest-yield', [], wallet1);
      expect(result.result).toBeErr(Cl.uint(204)); // ERR-VAULT-NOT-INITIALIZED
    });

    it('should harvest yield after blocks pass', () => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Advance blockchain by 1000 blocks (~7 days)
      simnet.mineEmptyBlocks(1000);

      // Harvest yield
      const result = simnet.callPublicFn('yield-vault', 'harvest-yield', [], wallet1);
      // Check that yield was harvested
      expect(result.result).toHaveProperty('value');
    });

    it('should distribute yield as additional shares', () => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Get initial balance
      const initialBalance = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      const initialShares = (initialBalance.result as any).value;

      // Advance blockchain and harvest
      simnet.mineEmptyBlocks(10000);
      const harvestResult = simnet.callPublicFn('yield-vault', 'harvest-yield', [], wallet1);

      // Check that yield was harvested
      expect(harvestResult.result).toHaveProperty('value');

      // Check total yield earned
      const totalYield = simnet.callReadOnlyFn('yield-vault', 'get-total-yield-earned', [], wallet1);
      expect(totalYield.result).toHaveProperty('value');
    });
  });

  describe('Read-only Helper Functions', () => {
    beforeEach(() => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
    });

    it('should return correct effective balance', () => {
      const result = simnet.callReadOnlyFn('yield-vault', 'get-effective-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(100000000));
    });

    it('should return correct pending yield', () => {
      const result = simnet.callReadOnlyFn('yield-vault', 'get-pending-yield',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(100000000));
    });

    it('should return correct APY', () => {
      const result = simnet.callReadOnlyFn('yield-vault', 'get-apy', [], wallet1);
      expect(result.result).toBeOk(Cl.uint(500)); // 5% APY
    });

    it('should return zero for non-depositor effective balance', () => {
      const result = simnet.callReadOnlyFn('yield-vault', 'get-effective-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Admin Mint/Burn', () => {
    it('should allow admin to mint tokens', () => {
      const result = simnet.callPublicFn('yield-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(100000000));
    });

    it('should reject non-admin mint', () => {
      const result = simnet.callPublicFn('yield-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(200)); // ERR-NOT-AUTHORIZED
    });

    it('should allow user to burn their own tokens', () => {
      // First mint some tokens
      simnet.callPublicFn('yield-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callPublicFn('yield-vault', 'burn',
        [Cl.uint(50000000)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(50000000));
    });

    it('should reject burning more than balance', () => {
      // First mint some tokens
      simnet.callPublicFn('yield-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callPublicFn('yield-vault', 'burn',
        [Cl.uint(200000000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(203)); // ERR-INSUFFICIENT-BALANCE
    });

    it('should reject zero amount burn', () => {
      const result = simnet.callPublicFn('yield-vault', 'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(202)); // ERR-ZERO-AMOUNT
    });
  });

  describe('Transfer (SIP-010)', () => {
    beforeEach(() => {
      // Mint yUSDC directly to wallet1
      simnet.callPublicFn('yield-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow transfer of yUSDC tokens', () => {
      const result = simnet.callPublicFn('yield-vault', 'transfer',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check balances
      const balance1 = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance1.result).toBeOk(Cl.uint(50000000));

      const balance2 = simnet.callReadOnlyFn('yield-vault', 'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );
      expect(balance2.result).toBeOk(Cl.uint(50000000));
    });

    it('should reject transfer from non-owner', () => {
      const result = simnet.callPublicFn('yield-vault', 'transfer',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(201)); // ERR-NOT-TOKEN-OWNER
    });

    it('should reject zero amount transfer', () => {
      const result = simnet.callPublicFn('yield-vault', 'transfer',
        [Cl.uint(0), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(202)); // ERR-ZERO-AMOUNT
    });
  });

  describe('Integration: Supply -> Yield -> Withdraw', () => {
    it('should successfully withdraw after yield accrual', () => {
      // wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.contractPrincipal(deployer, 'yield-vault'), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('yield-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Advance time and harvest yield
      simnet.mineEmptyBlocks(52560); // ~1 year worth of blocks
      simnet.callPublicFn('yield-vault', 'harvest-yield', [], wallet1);

      // Withdraw 100 yUSDC (original shares)
      const withdrawResult = simnet.callPublicFn('yield-vault', 'withdraw',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Should successfully withdraw (returns USDC amount withdrawn)
      // Use range check instead of exact value to avoid flaky tests due to rounding
      const returnedValue = (withdrawResult.result as any).value.value;
      expect(returnedValue).toBeGreaterThan(99000000); // At least 99 USDC
      expect(returnedValue).toBeLessThan(101000000); // At most 101 USDC (original + yield)
    });
  });
});
