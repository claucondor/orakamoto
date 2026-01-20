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
});
