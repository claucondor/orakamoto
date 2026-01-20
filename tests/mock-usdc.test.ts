import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const FAUCET_LIMIT = 10_000_000_000n; // 10000 USDC with 6 decimals
const ERR_NOT_AUTHORIZED = 100n;
const ERR_NOT_TOKEN_OWNER = 101n;
const ERR_FAUCET_LIMIT_EXCEEDED = 102n;
const ERR_INSUFFICIENT_BALANCE = 103n;
const ERR_ZERO_AMOUNT = 104n;

describe('Mock USDC Token', () => {
  describe('SIP-010 Metadata', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn('mock-usdc', 'get-name', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('Mock USDC'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn('mock-usdc', 'get-symbol', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('mUSDC'));
    });

    it('should return correct decimals (6)', () => {
      const result = simnet.callReadOnlyFn('mock-usdc', 'get-decimals', [], deployer);
      expect(result.result).toBeOk(Cl.uint(6));
    });

    it('should return token URI as none', () => {
      const result = simnet.callReadOnlyFn('mock-usdc', 'get-token-uri', [], deployer);
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return zero total supply initially', () => {
      const result = simnet.callReadOnlyFn('mock-usdc', 'get-total-supply', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero balance initially', () => {
      const result = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Faucet Functionality', () => {
    it('should allow claiming tokens from faucet', () => {
      const amount = 1_000_000_000n; // 1000 USDC
      const result = simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(amount)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(amount));
    });

    it('should allow multiple faucet claims up to limit', () => {
      const firstClaim = 5_000_000_000n; // 5000 USDC
      const secondClaim = 3_000_000_000n; // 3000 USDC

      // First claim
      const result1 = simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(firstClaim)],
        wallet1
      );
      expect(result1.result).toBeOk(Cl.bool(true));

      // Second claim
      const result2 = simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(secondClaim)],
        wallet1
      );
      expect(result2.result).toBeOk(Cl.bool(true));

      // Verify total balance
      const balance = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(firstClaim + secondClaim));
    });

    it('should allow claiming exactly the faucet limit', () => {
      const result = simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(FAUCET_LIMIT)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(FAUCET_LIMIT));
    });

    it('should reject faucet claims exceeding limit', () => {
      const result = simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(FAUCET_LIMIT + 1n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_FAUCET_LIMIT_EXCEEDED));
    });

    it('should reject additional claims after limit reached', () => {
      // First claim full limit
      simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(FAUCET_LIMIT)],
        wallet1
      );

      // Try to claim more
      const result = simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(1n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_FAUCET_LIMIT_EXCEEDED));
    });

    it('should reject zero amount faucet claims', () => {
      const result = simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should track faucet claims correctly per user', () => {
      const amount = 5_000_000_000n;
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(amount)], wallet1);

      // Check claimed amount
      const claimed = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-faucet-claims',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(claimed.result).toBeOk(Cl.uint(amount));

      // Check remaining
      const remaining = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-faucet-remaining',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(remaining.result).toBeOk(Cl.uint(FAUCET_LIMIT - amount));
    });

    it('should have separate faucet limits per user', () => {
      // Wallet1 claims full limit
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(FAUCET_LIMIT)], wallet1);

      // Wallet2 should still be able to claim
      const result = simnet.callPublicFn(
        'mock-usdc',
        'faucet',
        [Cl.uint(FAUCET_LIMIT)],
        wallet2
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify both have tokens
      const balance1 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      const balance2 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );
      expect(balance1.result).toBeOk(Cl.uint(FAUCET_LIMIT));
      expect(balance2.result).toBeOk(Cl.uint(FAUCET_LIMIT));
    });
  });

  describe('Transfer Functionality', () => {
    beforeEach(() => {
      // Setup: give wallet1 some tokens via faucet
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(5_000_000_000n)], wallet1);
    });

    it('should allow transfer between accounts', () => {
      const transferAmount = 1_000_000_000n; // 1000 USDC

      const result = simnet.callPublicFn(
        'mock-usdc',
        'transfer',
        [
          Cl.uint(transferAmount),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check balances
      const balance1 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      const balance2 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );

      expect(balance1.result).toBeOk(Cl.uint(5_000_000_000n - transferAmount));
      expect(balance2.result).toBeOk(Cl.uint(transferAmount));
    });

    it('should allow transfer with memo', () => {
      const memo = new Uint8Array([0x01, 0x02, 0x03]);
      const result = simnet.callPublicFn(
        'mock-usdc',
        'transfer',
        [
          Cl.uint(1_000_000_000n),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.some(Cl.buffer(memo)),
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject transfer of zero amount', () => {
      const result = simnet.callPublicFn(
        'mock-usdc',
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

    it('should reject transfer when sender is not tx-sender', () => {
      const result = simnet.callPublicFn(
        'mock-usdc',
        'transfer',
        [
          Cl.uint(1_000_000_000n),
          Cl.standardPrincipal(wallet1), // sender
          Cl.standardPrincipal(wallet2), // recipient
          Cl.none(),
        ],
        wallet2 // tx-sender is wallet2, not wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_TOKEN_OWNER));
    });

    it('should reject transfer exceeding balance', () => {
      const balance = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'mock-usdc',
        'transfer',
        [
          Cl.uint(balance + 1n),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      // ft-transfer? returns (err u1) for insufficient balance (native Clarity error)
      expect(result.result).toBeErr(Cl.uint(1));
    });

    it('should update total supply correctly after transfers', () => {
      // Get initial supply after faucet
      const supplyBefore = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-total-supply',
        [],
        deployer
      );
      expect(supplyBefore.result).toBeOk(Cl.uint(5_000_000_000n));

      // Transfer should not change total supply
      simnet.callPublicFn(
        'mock-usdc',
        'transfer',
        [
          Cl.uint(1_000_000_000n),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );

      const supplyAfter = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-total-supply',
        [],
        deployer
      );
      expect(supplyAfter.result).toBeOk(Cl.uint(5_000_000_000n));
    });
  });

  describe('Mint Access Control', () => {
    it('should allow contract owner to mint tokens', () => {
      const mintAmount = 1_000_000_000n;
      const result = simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(mintAmount));
    });

    it('should reject mint from non-owner', () => {
      const result = simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(1_000_000_000n), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject mint of zero amount', () => {
      const result = simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should allow owner to mint to any address', () => {
      // Mint to wallet1
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(1_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Mint to wallet2
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(2_000_000_000n), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Verify balances
      const balance1 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      const balance2 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );

      expect(balance1.result).toBeOk(Cl.uint(1_000_000_000n));
      expect(balance2.result).toBeOk(Cl.uint(2_000_000_000n));
    });

    it('should update total supply after minting', () => {
      const mintAmount = 1_000_000_000n;
      simnet.callPublicFn(
        'mock-usdc',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const supply = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-total-supply',
        [],
        deployer
      );
      expect(supply.result).toBeOk(Cl.uint(mintAmount));
    });
  });

  describe('Burn Functionality', () => {
    beforeEach(() => {
      // Setup: give wallet1 tokens via faucet
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(5_000_000_000n)], wallet1);
    });

    it('should allow token holder to burn their tokens', () => {
      const burnAmount = 1_000_000_000n;
      const result = simnet.callPublicFn(
        'mock-usdc',
        'burn',
        [Cl.uint(burnAmount)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify reduced balance
      const balance = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(balance.result).toBeOk(Cl.uint(5_000_000_000n - burnAmount));
    });

    it('should reject burn of zero amount', () => {
      const result = simnet.callPublicFn('mock-usdc', 'burn', [Cl.uint(0)], wallet1);
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject burn exceeding balance', () => {
      const result = simnet.callPublicFn(
        'mock-usdc',
        'burn',
        [Cl.uint(5_000_000_001n)],
        wallet1
      );
      // ft-burn? returns (err u1) for insufficient balance, but our wrapper returns ERR-INSUFFICIENT-BALANCE
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });

    it('should update total supply after burning', () => {
      const initialSupply = 5_000_000_000n;
      const burnAmount = 2_000_000_000n;

      // Check supply before burn
      const supplyBefore = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-total-supply',
        [],
        deployer
      );
      expect(supplyBefore.result).toBeOk(Cl.uint(initialSupply));

      // Burn tokens
      simnet.callPublicFn('mock-usdc', 'burn', [Cl.uint(burnAmount)], wallet1);

      // Check supply after burn
      const supplyAfter = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-total-supply',
        [],
        deployer
      );
      expect(supplyAfter.result).toBeOk(Cl.uint(initialSupply - burnAmount));
    });

    it('should allow user to burn all their tokens', () => {
      const balance = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'mock-usdc',
        'burn',
        [Cl.uint(balance)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const finalBalance = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(finalBalance.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete lifecycle: faucet -> transfer -> burn', () => {
      // 1. Wallet1 gets tokens from faucet
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(5_000_000_000n)], wallet1);

      // 2. Wallet1 transfers to wallet2
      simnet.callPublicFn(
        'mock-usdc',
        'transfer',
        [
          Cl.uint(2_000_000_000n),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );

      // 3. Wallet2 burns some tokens
      simnet.callPublicFn('mock-usdc', 'burn', [Cl.uint(500_000_000n)], wallet2);

      // Verify final balances
      const balance1 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      const balance2 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );
      const totalSupply = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-total-supply',
        [],
        deployer
      );

      expect(balance1.result).toBeOk(Cl.uint(3_000_000_000n)); // 5000 - 2000
      expect(balance2.result).toBeOk(Cl.uint(1_500_000_000n)); // 2000 - 500
      expect(totalSupply.result).toBeOk(Cl.uint(4_500_000_000n)); // 5000 - 500 burned
    });

    it('should handle multiple users independently', () => {
      // All three wallets claim from faucet
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(3_000_000_000n)], wallet1);
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(4_000_000_000n)], wallet2);
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(5_000_000_000n)], wallet3);

      // Wallet1 transfers to wallet2
      simnet.callPublicFn(
        'mock-usdc',
        'transfer',
        [
          Cl.uint(1_000_000_000n),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );

      // Wallet2 transfers to wallet3
      simnet.callPublicFn(
        'mock-usdc',
        'transfer',
        [
          Cl.uint(2_000_000_000n),
          Cl.standardPrincipal(wallet2),
          Cl.standardPrincipal(wallet3),
          Cl.none(),
        ],
        wallet2
      );

      // Check final balances
      const balance1 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      const balance2 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        wallet2
      );
      const balance3 = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-balance',
        [Cl.standardPrincipal(wallet3)],
        wallet3
      );

      expect(balance1.result).toBeOk(Cl.uint(2_000_000_000n)); // 3000 - 1000
      expect(balance2.result).toBeOk(Cl.uint(3_000_000_000n)); // 4000 + 1000 - 2000
      expect(balance3.result).toBeOk(Cl.uint(7_000_000_000n)); // 5000 + 2000

      // Total supply should be sum of all faucet claims
      const totalSupply = simnet.callReadOnlyFn(
        'mock-usdc',
        'get-total-supply',
        [],
        deployer
      );
      expect(totalSupply.result).toBeOk(Cl.uint(12_000_000_000n));
    });
  });
});
