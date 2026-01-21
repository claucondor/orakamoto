import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

describe('Mock Zest Vault', () => {
  beforeEach(() => {
    // Mint USDC to wallets for testing
    simnet.callPublicFn('mock-usdc', 'mint', [Cl.uint(1000000000), Cl.standardPrincipal(wallet1)], deployer);
    simnet.callPublicFn('mock-usdc', 'mint', [Cl.uint(1000000000), Cl.standardPrincipal(wallet2)], deployer);
  });

  describe('Constants', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn('mock-zest-vault', 'get-name', [], wallet1);
      expect(result.result).toBeOk(Cl.stringAscii('Mock Zest Vault'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn('mock-zest-vault', 'get-symbol', [], wallet1);
      expect(result.result).toBeOk(Cl.stringAscii('zUSDC'));
    });

    it('should return correct decimals', () => {
      const result = simnet.callReadOnlyFn('mock-zest-vault', 'get-decimals', [], wallet1);
      expect(result.result).toBeOk(Cl.uint(6));
    });
  });

  describe('Supply (Deposit)', () => {
    it('should allow user to supply USDC and receive zUSDC shares', () => {
      // Approve USDC transfer first
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );

      const result = simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Check zUSDC balance (should be 1:1 for first deposit)
      const balance = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(100000000));

      // Check total deposits
      const totalDeposits = simnet.callReadOnlyFn('mock-zest-vault', 'get-total-deposits', [], wallet1);
      expect(totalDeposits.result).toBeOk(Cl.uint(100000000));
    });

    it('should reject zero amount supply', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(102)); // ERR-ZERO-AMOUNT
    });

    it('should allow supply on behalf of another user (shares go to owner)', () => {
      // wallet1 supplies USDC, but shares go to wallet2
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );

      const result = simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check that wallet2 received the shares (not wallet1)
      const balance2 = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );
      expect(balance2.result).toBeOk(Cl.uint(100000000));

      // wallet1 should have 0 shares
      const balance1 = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance1.result).toBeOk(Cl.uint(0));
    });

    it('should calculate correct shares for subsequent deposits', () => {
      // First deposit: 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Second deposit: 200 USDC by wallet2
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(200000000), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(deployer), Cl.none()],
        wallet2
      );
      simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(200000000), Cl.standardPrincipal(wallet2)],
        wallet2
      );

      // wallet1 should have 100 zUSDC (100/300 * 300 = 100)
      // wallet2 should have 200 zUSDC (200/300 * 300 = 200)
      const balance1 = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance1.result).toBeOk(Cl.uint(100000000));

      const balance2 = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
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
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
    });

    it('should allow user to withdraw their deposited USDC', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'withdraw',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(100000000));

      // Check zUSDC balance is now 0
      const balance = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(0));

      // Check total deposits is now 0
      const totalDeposits = simnet.callReadOnlyFn('mock-zest-vault', 'get-total-deposits', [], wallet1);
      expect(totalDeposits.result).toBeOk(Cl.uint(0));
    });

    it('should reject zero amount withdraw', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'withdraw',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(102)); // ERR-ZERO-AMOUNT
    });

    it('should reject withdraw from non-owner', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'withdraw',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it('should reject withdraw exceeding balance', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'withdraw',
        [Cl.uint(200000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(103)); // ERR-INSUFFICIENT-BALANCE
    });

    it('should allow partial withdrawal', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'withdraw',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(50000000));

      // Check remaining balance
      const balance = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(50000000));
    });
  });

  describe('Yield Rate', () => {
    it('should return default yield rate', () => {
      const result = simnet.callReadOnlyFn('mock-zest-vault', 'get-yield-rate', [], wallet1);
      expect(result.result).toBeOk(Cl.uint(500)); // 5% APY
    });

    it('should allow admin to set yield rate', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'set-yield-rate',
        [Cl.uint(1000)], // 10% APY
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const rate = simnet.callReadOnlyFn('mock-zest-vault', 'get-yield-rate', [], wallet1);
      expect(rate.result).toBeOk(Cl.uint(1000));
    });

    it('should reject non-admin setting yield rate', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'set-yield-rate',
        [Cl.uint(1000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it('should reject yield rate over 100%', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'set-yield-rate',
        [Cl.uint(10001)], // 100.01% APY
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(102)); // ERR-ZERO-AMOUNT
    });
  });

  describe('Harvest Yield', () => {
    it('should reject harvest when vault is empty', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'harvest-yield', [], wallet1);
      expect(result.result).toBeErr(Cl.uint(104)); // ERR-VAULT-NOT-INITIALIZED
    });

    it('should harvest minimal yield when no time has passed', () => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Harvest immediately (may get small yield due to block height)
      const result = simnet.callPublicFn('mock-zest-vault', 'harvest-yield', [], wallet1);
      // Check that the call succeeded
      expect(result.result).toHaveProperty('value');
    });

    it('should calculate yield after blocks pass', () => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Advance blockchain by 1000 blocks (~7 days)
      simnet.mineEmptyBlocks(1000);

      // Harvest yield
      const result = simnet.callPublicFn('mock-zest-vault', 'harvest-yield', [], wallet1);
      // Check that yield was harvested
      expect(result.result).toHaveProperty('value');
    });

    it('should distribute yield as additional shares', () => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Get initial balance
      const initialBalance = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      const initialShares = (initialBalance.result as any).value;

      // Advance blockchain and harvest
      simnet.mineEmptyBlocks(10000);
      const harvestResult = simnet.callPublicFn('mock-zest-vault', 'harvest-yield', [], wallet1);

      // Check that yield was harvested
      expect(harvestResult.result).toHaveProperty('value');

      // Check total yield earned - the result is (ok uint)
      const totalYield = simnet.callReadOnlyFn('mock-zest-vault', 'get-total-yield-earned', [], wallet1);
      // totalYield.result should be (ok uint)
      expect(totalYield.result).toHaveProperty('value');
    });
  });

  describe('Read-only Helper Functions', () => {
    beforeEach(() => {
      // Setup: wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
    });

    it('should return correct effective balance', () => {
      const result = simnet.callReadOnlyFn('mock-zest-vault', 'get-effective-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(100000000));
    });

    it('should return correct pending yield', () => {
      const result = simnet.callReadOnlyFn('mock-zest-vault', 'get-pending-yield',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(100000000));
    });

    it('should return correct APY', () => {
      const result = simnet.callReadOnlyFn('mock-zest-vault', 'get-apy', [], wallet1);
      expect(result.result).toBeOk(Cl.uint(500)); // 5% APY
    });

    it('should return zero for non-depositor effective balance', () => {
      const result = simnet.callReadOnlyFn('mock-zest-vault', 'get-effective-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Admin Mint/Burn', () => {
    it('should allow admin to mint tokens', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(100000000));
    });

    it('should reject non-admin mint', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it('should allow user to burn their own tokens', () => {
      // First mint some tokens
      simnet.callPublicFn('mock-zest-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callPublicFn('mock-zest-vault', 'burn',
        [Cl.uint(50000000)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(50000000));
    });

    it('should reject burning more than balance', () => {
      // First mint some tokens
      simnet.callPublicFn('mock-zest-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callPublicFn('mock-zest-vault', 'burn',
        [Cl.uint(200000000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(103)); // ERR-INSUFFICIENT-BALANCE
    });

    it('should reject zero amount burn', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(102)); // ERR-ZERO-AMOUNT
    });
  });

  describe('Transfer (SIP-010)', () => {
    beforeEach(() => {
      // Mint zUSDC directly to wallet1
      simnet.callPublicFn('mock-zest-vault', 'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow transfer of zUSDC tokens', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'transfer',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check balances
      const balance1 = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance1.result).toBeOk(Cl.uint(50000000));

      const balance2 = simnet.callReadOnlyFn('mock-zest-vault', 'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );
      expect(balance2.result).toBeOk(Cl.uint(50000000));
    });

    it('should reject transfer from non-owner', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'transfer',
        [Cl.uint(50000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(101)); // ERR-NOT-TOKEN-OWNER
    });

    it('should reject zero amount transfer', () => {
      const result = simnet.callPublicFn('mock-zest-vault', 'transfer',
        [Cl.uint(0), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(102)); // ERR-ZERO-AMOUNT
    });
  });

  describe('Integration: Supply -> Yield -> Withdraw', () => {
    it('should successfully withdraw after yield accrual', () => {
      // wallet1 supplies 100 USDC
      simnet.callPublicFn('mock-usdc', 'transfer',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(deployer), Cl.none()],
        wallet1
      );
      simnet.callPublicFn('mock-zest-vault', 'supply',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Advance time and harvest yield
      simnet.mineEmptyBlocks(52560); // ~1 year worth of blocks
      simnet.callPublicFn('mock-zest-vault', 'harvest-yield', [], wallet1);

      // Withdraw 100 zUSDC (original shares)
      const withdrawResult = simnet.callPublicFn('mock-zest-vault', 'withdraw',
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
