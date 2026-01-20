import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const ERR_NOT_AUTHORIZED = 500n;
const ERR_NOT_TOKEN_OWNER = 501n;
const ERR_ZERO_AMOUNT = 502n;
const ERR_INSUFFICIENT_BALANCE = 503n;

describe('Governance Token ($PRED)', () => {
  describe('SIP-010 Metadata', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn('governance-token', 'get-name', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('StackPredict Governance'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn('governance-token', 'get-symbol', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('PRED'));
    });

    it('should return correct decimals (8)', () => {
      const result = simnet.callReadOnlyFn('governance-token', 'get-decimals', [], deployer);
      expect(result.result).toBeOk(Cl.uint(8));
    });

    it('should return token URI as none', () => {
      const result = simnet.callReadOnlyFn('governance-token', 'get-token-uri', [], deployer);
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return zero total supply initially', () => {
      const result = simnet.callReadOnlyFn('governance-token', 'get-total-supply', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero balance initially', () => {
      const result = simnet.callReadOnlyFn(
        'governance-token',
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
        'governance-token',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = simnet.callReadOnlyFn(
        'governance-token',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(amount));
    });

    it('should reject mint from non-owner', () => {
      const amount = 1_000_000_000n;
      const result = simnet.callPublicFn(
        'governance-token',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject mint with zero amount', () => {
      const result = simnet.callPublicFn(
        'governance-token',
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
        'governance-token',
        'mint',
        [Cl.uint(amount1), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Second mint
      simnet.callPublicFn(
        'governance-token',
        'mint',
        [Cl.uint(amount2), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Check total supply
      const supply = simnet.callReadOnlyFn('governance-token', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(amount1 + amount2));
    });
  });

  describe('Transfer Functionality', () => {
    beforeEach(() => {
      // Mint some tokens to wallet1 before each test
      simnet.callPublicFn(
        'governance-token',
        'mint',
        [Cl.uint(10_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to transfer tokens', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'governance-token',
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
        'governance-token',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(senderBalance.result).toBeOk(Cl.uint(5_000_000_000n));

      const recipientBalance = simnet.callReadOnlyFn(
        'governance-token',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(recipientBalance.result).toBeOk(Cl.uint(5_000_000_000n));
    });

    it('should reject transfer from non-token-owner', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'governance-token',
        'transfer',
        [
          Cl.uint(amount),
          Cl.standardPrincipal(wallet1), // wallet1 is the owner
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet2 // wallet2 tries to transfer wallet1's tokens
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_TOKEN_OWNER));
    });

    it('should reject transfer with zero amount', () => {
      const result = simnet.callPublicFn(
        'governance-token',
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

    it('should reject transfer exceeding balance', () => {
      const result = simnet.callPublicFn(
        'governance-token',
        'transfer',
        [
          Cl.uint(15_000_000_000n), // More than wallet1's balance
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1n)); // ft-transfer? returns err u1 for insufficient balance
    });

    it('should allow transfer with memo', () => {
      const amount = 1_000_000_000n;
      const memo = Cl.some(Cl.bufferFromUtf8('Test memo'));
      const result = simnet.callPublicFn(
        'governance-token',
        'transfer',
        [
          Cl.uint(amount),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          memo,
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });
  });

  describe('Burn Functionality', () => {
    beforeEach(() => {
      // Mint some tokens to wallet1 before each test
      simnet.callPublicFn(
        'governance-token',
        'mint',
        [Cl.uint(10_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to burn their own tokens', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'governance-token',
        'burn',
        [Cl.uint(amount)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance decreased
      const balance = simnet.callReadOnlyFn(
        'governance-token',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(5_000_000_000n));

      // Verify total supply decreased
      const supply = simnet.callReadOnlyFn('governance-token', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(5_000_000_000n));
    });

    it('should reject burn with zero amount', () => {
      const result = simnet.callPublicFn(
        'governance-token',
        'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject burn exceeding balance', () => {
      const result = simnet.callPublicFn(
        'governance-token',
        'burn',
        [Cl.uint(15_000_000_000n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });

    it('should allow burning all tokens', () => {
      const result = simnet.callPublicFn(
        'governance-token',
        'burn',
        [Cl.uint(10_000_000_000n)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn(
        'governance-token',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Delegation Functionality', () => {
    it('should allow user to delegate voting power', () => {
      const result = simnet.callPublicFn(
        'governance-token',
        'delegate',
        [Cl.standardPrincipal(wallet2)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject self-delegation', () => {
      const result = simnet.callPublicFn(
        'governance-token',
        'delegate',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should return delegatee address when delegation exists', () => {
      // Set up delegation
      simnet.callPublicFn(
        'governance-token',
        'delegate',
        [Cl.standardPrincipal(wallet2)],
        wallet1
      );

      // Check delegation
      const result = simnet.callReadOnlyFn(
        'governance-token',
        'get-delegation',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.standardPrincipal(wallet2));
    });

    it('should return self when no delegation exists', () => {
      const result = simnet.callReadOnlyFn(
        'governance-token',
        'get-delegation',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.standardPrincipal(wallet1));
    });
  });

  describe('Voting Power', () => {
    it('should return zero voting power initially', () => {
      const result = simnet.callReadOnlyFn(
        'governance-token',
        'get-voting-power',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return token balance as voting power', () => {
      // Mint tokens
      simnet.callPublicFn(
        'governance-token',
        'mint',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'governance-token',
        'get-voting-power',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(100_000_000_000n));
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete token lifecycle', () => {
      // 1. Mint tokens to wallet1
      const mintResult = simnet.callPublicFn(
        'governance-token',
        'mint',
        [Cl.uint(50_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(mintResult.result).toBeOk(Cl.bool(true));

      // 2. Transfer half to wallet2
      const transferResult = simnet.callPublicFn(
        'governance-token',
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

      // 3. Wallet2 delegates to wallet3
      const delegateResult = simnet.callPublicFn(
        'governance-token',
        'delegate',
        [Cl.standardPrincipal(wallet3)],
        wallet2
      );
      expect(delegateResult.result).toBeOk(Cl.bool(true));

      // 4. Wallet1 burns some tokens
      const burnResult = simnet.callPublicFn(
        'governance-token',
        'burn',
        [Cl.uint(5_000_000_000n)],
        wallet1
      );
      expect(burnResult.result).toBeOk(Cl.bool(true));

      // Verify final state
      const wallet1Balance = simnet.callReadOnlyFn(
        'governance-token',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(wallet1Balance.result).toBeOk(Cl.uint(20_000_000_000n));

      const wallet2Balance = simnet.callReadOnlyFn(
        'governance-token',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(wallet2Balance.result).toBeOk(Cl.uint(25_000_000_000n));

      const totalSupply = simnet.callReadOnlyFn('governance-token', 'get-total-supply', [], deployer);
      expect(totalSupply.result).toBeOk(Cl.uint(45_000_000_000n));
    });

    it('should track voting power correctly after transfers', () => {
      // Mint to wallet1
      simnet.callPublicFn(
        'governance-token',
        'mint',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Check initial voting power
      const initialPower = simnet.callReadOnlyFn(
        'governance-token',
        'get-voting-power',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(initialPower.result).toBeOk(Cl.uint(100_000_000_000n));

      // Transfer half to wallet2
      simnet.callPublicFn(
        'governance-token',
        'transfer',
        [
          Cl.uint(50_000_000_000n),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );

      // Check updated voting powers
      const wallet1Power = simnet.callReadOnlyFn(
        'governance-token',
        'get-voting-power',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(wallet1Power.result).toBeOk(Cl.uint(50_000_000_000n));

      const wallet2Power = simnet.callReadOnlyFn(
        'governance-token',
        'get-voting-power',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(wallet2Power.result).toBeOk(Cl.uint(50_000_000_000n));
    });
  });
});
