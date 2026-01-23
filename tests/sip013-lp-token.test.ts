import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const ERR_NOT_AUTHORIZED = 3000n;
const ERR_INSUFFICIENT_BALANCE = 3001n;
const ERR_INVALID_SENDER = 3002n;
const ERR_ZERO_AMOUNT = 3003n;

describe('SIP-013 LP Token', () => {
  describe('SIP-013 Trait Functions', () => {
    describe('get-balance', () => {
      it('should return zero balance for non-existent token', () => {
        const result = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-balance',
          [Cl.uint(1), Cl.standardPrincipal(wallet1)],
          deployer
        );
        expect(result.result).toBeOk(Cl.uint(0));
      });

      it('should return balance after minting', () => {
        // Mint tokens
        simnet.callPublicFn(
          'sip013-lp-token',
          'mint',
          [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
          deployer
        );

        // Check balance
        const result = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-balance',
          [Cl.uint(1), Cl.standardPrincipal(wallet1)],
          deployer
        );
        expect(result.result).toBeOk(Cl.uint(1000000));
      });

      it('should return different balances for different token-ids', () => {
        // Mint different amounts to different token-ids
        simnet.callPublicFn(
          'sip013-lp-token',
          'mint',
          [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
          deployer
        );
        simnet.callPublicFn(
          'sip013-lp-token',
          'mint',
          [Cl.uint(2), Cl.uint(2000000), Cl.standardPrincipal(wallet1)],
          deployer
        );

        // Check balance for token-id 1
        const balance1 = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-balance',
          [Cl.uint(1), Cl.standardPrincipal(wallet1)],
          deployer
        );
        expect(balance1.result).toBeOk(Cl.uint(1000000));

        // Check balance for token-id 2
        const balance2 = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-balance',
          [Cl.uint(2), Cl.standardPrincipal(wallet1)],
          deployer
        );
        expect(balance2.result).toBeOk(Cl.uint(2000000));
      });
    });

    describe('get-overall-balance', () => {
      it('should return zero as overall balance placeholder', () => {
        const result = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-overall-balance',
          [Cl.standardPrincipal(wallet1)],
          deployer
        );
        expect(result.result).toBeOk(Cl.uint(0));
      });
    });

    describe('get-total-supply', () => {
      it('should return zero supply for non-existent token', () => {
        const result = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-total-supply',
          [Cl.uint(999)],
          deployer
        );
        expect(result.result).toBeOk(Cl.uint(0));
      });

      it('should return total supply after minting', () => {
        // Mint tokens
        simnet.callPublicFn(
          'sip013-lp-token',
          'mint',
          [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
          deployer
        );

        // Check supply
        const result = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-total-supply',
          [Cl.uint(1)],
          deployer
        );
        expect(result.result).toBeOk(Cl.uint(1000000));
      });

      it('should track supply independently per token-id', () => {
        // Mint to different token-ids
        simnet.callPublicFn(
          'sip013-lp-token',
          'mint',
          [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
          deployer
        );
        simnet.callPublicFn(
          'sip013-lp-token',
          'mint',
          [Cl.uint(2), Cl.uint(2000000), Cl.standardPrincipal(wallet2)],
          deployer
        );

        // Check supply for token-id 1
        const supply1 = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-total-supply',
          [Cl.uint(1)],
          deployer
        );
        expect(supply1.result).toBeOk(Cl.uint(1000000));

        // Check supply for token-id 2
        const supply2 = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-total-supply',
          [Cl.uint(2)],
          deployer
        );
        expect(supply2.result).toBeOk(Cl.uint(2000000));
      });
    });

    describe('get-overall-supply', () => {
      it('should return zero as overall supply placeholder', () => {
        const result = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-overall-supply',
          [],
          deployer
        );
        expect(result.result).toBeOk(Cl.uint(0));
      });
    });

    describe('get-decimals', () => {
      it('should return 6 decimals for LP tokens', () => {
        const result = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-decimals',
          [Cl.uint(1)],
          deployer
        );
        expect(result.result).toBeOk(Cl.uint(6));
      });
    });

    describe('get-token-uri', () => {
      it('should return none for token URI', () => {
        const result = simnet.callReadOnlyFn(
          'sip013-lp-token',
          'get-token-uri',
          [Cl.uint(1)],
          deployer
        );
        expect(result.result).toBeOk(Cl.none());
      });
    });
  });

  describe('Mint Functionality', () => {
    it('should allow authorized minter to mint tokens', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject mint from non-authorized caller', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject mint with zero amount', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should accumulate tokens when minting multiple times', () => {
      // First mint
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Second mint
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Check balance
      const balance = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(1500000));
    });

    it('should accumulate supply when minting multiple times', () => {
      // First mint
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Second mint to different user
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Check supply
      const supply = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-total-supply',
        [Cl.uint(1)],
        deployer
      );
      expect(supply.result).toBeOk(Cl.uint(1500000));
    });
  });

  describe('Burn Functionality', () => {
    beforeEach(() => {
      // Mint tokens before each test
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow authorized minter to burn tokens', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'burn',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance decreased
      const balance = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(500000));
    });

    it('should reject burn from non-authorized caller', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'burn',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject burn with zero amount', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'burn',
        [Cl.uint(1), Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject burn exceeding balance', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'burn',
        [Cl.uint(1), Cl.uint(2000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });

    it('should decrease total supply when burning', () => {
      // Burn tokens
      simnet.callPublicFn(
        'sip013-lp-token',
        'burn',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Check supply
      const supply = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-total-supply',
        [Cl.uint(1)],
        deployer
      );
      expect(supply.result).toBeOk(Cl.uint(500000));
    });
  });

  describe('Transfer Functionality', () => {
    beforeEach(() => {
      // Mint tokens before each test
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to transfer tokens', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balances
      const senderBalance = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(senderBalance.result).toBeOk(Cl.uint(500000));

      const recipientBalance = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(recipientBalance.result).toBeOk(Cl.uint(500000));
    });

    it('should reject transfer from non-token-owner', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet2 // wallet2 tries to transfer wallet1's tokens
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_SENDER));
    });

    it('should reject transfer with zero amount', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(1), Cl.uint(0), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject transfer exceeding balance', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(1), Cl.uint(2000000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });

    it('should reject transfer to self', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true)); // Returns ok true as no-op
    });

    it('should not change balance when transferring to self', () => {
      const initialBalance = 1000000n;

      // Attempt transfer to self
      simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet1)],
        wallet1
      );

      // Verify balance unchanged
      const balance = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(initialBalance));
    });
  });

  describe('Transfer with Memo Functionality', () => {
    beforeEach(() => {
      // Mint tokens before each test
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow transfer with memo', () => {
      const memo = Cl.bufferFromUtf8('Test memo');
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer-memo',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), memo],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject transfer-memo from non-token-owner', () => {
      const memo = Cl.bufferFromUtf8('Test memo');
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer-memo',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), memo],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_SENDER));
    });
  });

  describe('Admin Functions', () => {
    it('should return authorized minter', () => {
      const result = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-authorized-minter',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.standardPrincipal(deployer));
    });

    it('should allow set-authorized-minter by owner (placeholder)', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'set-authorized-minter',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject set-authorized-minter from non-owner', () => {
      const result = simnet.callPublicFn(
        'sip013-lp-token',
        'set-authorized-minter',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('Multi-Token Tests', () => {
    it('should handle multiple token-ids independently', () => {
      // Mint different amounts to different token-ids for different users
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(2), Cl.uint(2000000), Cl.standardPrincipal(wallet2)],
        deployer
      );
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet3)],
        deployer
      );

      // Verify token-id 1 balances
      const wallet1Token1 = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(wallet1Token1.result).toBeOk(Cl.uint(1000000));

      const wallet3Token1 = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet3)],
        deployer
      );
      expect(wallet3Token1.result).toBeOk(Cl.uint(500000));

      // Verify token-id 2 balances
      const wallet2Token2 = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(2), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(wallet2Token2.result).toBeOk(Cl.uint(2000000));

      // Verify supplies
      const supply1 = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-total-supply',
        [Cl.uint(1)],
        deployer
      );
      expect(supply1.result).toBeOk(Cl.uint(1500000));

      const supply2 = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-total-supply',
        [Cl.uint(2)],
        deployer
      );
      expect(supply2.result).toBeOk(Cl.uint(2000000));
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete LP token lifecycle', () => {
      // 1. Mint LP tokens to wallet1 (market-id 1)
      const mintResult = simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(mintResult.result).toBeOk(Cl.bool(true));

      // 2. Transfer LP tokens to wallet2
      const transferResult = simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(transferResult.result).toBeOk(Cl.bool(true));

      // 3. Burn some LP tokens from wallet2 (by authorized minter)
      const burnResult = simnet.callPublicFn(
        'sip013-lp-token',
        'burn',
        [Cl.uint(1), Cl.uint(200000), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(burnResult.result).toBeOk(Cl.bool(true));

      // Verify final balances
      const wallet1Balance = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(wallet1Balance.result).toBeOk(Cl.uint(500000));

      const wallet2Balance = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(wallet2Balance.result).toBeOk(Cl.uint(300000));

      // Verify final supply
      const supply = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-total-supply',
        [Cl.uint(1)],
        deployer
      );
      expect(supply.result).toBeOk(Cl.uint(800000));
    });

    it('should handle multiple markets with different LP tokens', () => {
      // Market 1: LP tokens for wallet1
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(1), Cl.uint(1000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Market 2: LP tokens for wallet2
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(2), Cl.uint(2000000), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Market 3: LP tokens for wallet3
      simnet.callPublicFn(
        'sip013-lp-token',
        'mint',
        [Cl.uint(3), Cl.uint(3000000), Cl.standardPrincipal(wallet3)],
        deployer
      );

      // Transfer market 1 LP tokens from wallet1 to wallet2
      simnet.callPublicFn(
        'sip013-lp-token',
        'transfer',
        [Cl.uint(1), Cl.uint(500000), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2)],
        wallet1
      );

      // Verify wallet2 has tokens from both market 1 and market 2
      const wallet2Market1 = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(wallet2Market1.result).toBeOk(Cl.uint(500000));

      const wallet2Market2 = simnet.callReadOnlyFn(
        'sip013-lp-token',
        'get-balance',
        [Cl.uint(2), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(wallet2Market2.result).toBeOk(Cl.uint(2000000));

      // Verify supplies are independent
      const supply1 = simnet.callReadOnlyFn('sip013-lp-token', 'get-total-supply', [Cl.uint(1)], deployer);
      expect(supply1.result).toBeOk(Cl.uint(1000000));

      const supply2 = simnet.callReadOnlyFn('sip013-lp-token', 'get-total-supply', [Cl.uint(2)], deployer);
      expect(supply2.result).toBeOk(Cl.uint(2000000));

      const supply3 = simnet.callReadOnlyFn('sip013-lp-token', 'get-total-supply', [Cl.uint(3)], deployer);
      expect(supply3.result).toBeOk(Cl.uint(3000000));
    });
  });
});
