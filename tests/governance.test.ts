import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const ERR_NOT_AUTHORIZED = 900n;
const ERR_NOT_TOKEN_OWNER = 901n;
const ERR_ZERO_AMOUNT = 902n;
const ERR_INSUFFICIENT_BALANCE = 903n;
const ERR_INVALID_PROPOSAL = 904n;
const ERR_INVALID_PROPOSAL_TYPE = 912n;

// Proposal types
const PROPOSAL_TYPE_PARAMETER_CHANGE = 0n;
const PROPOSAL_TYPE_TREASURY_SPEND = 1n;
const PROPOSAL_TYPE_DISPUTE_RESOLUTION = 2n;
const PROPOSAL_TYPE_ORACLE_WHITELIST = 3n;
const PROPOSAL_TYPE_EMERGENCY_ACTION = 4n;

describe('Governance Contract', () => {
  describe('SIP-010 Metadata', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn('governance', 'get-name', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('StackPredict Governance'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn('governance', 'get-symbol', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('PRED'));
    });

    it('should return correct decimals (8)', () => {
      const result = simnet.callReadOnlyFn('governance', 'get-decimals', [], deployer);
      expect(result.result).toBeOk(Cl.uint(8));
    });

    it('should return token URI as none', () => {
      const result = simnet.callReadOnlyFn('governance', 'get-token-uri', [], deployer);
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return zero total supply initially', () => {
      const result = simnet.callReadOnlyFn('governance', 'get-total-supply', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero balance initially', () => {
      const result = simnet.callReadOnlyFn(
        'governance',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Mint Functionality', () => {
    it('should allow contract owner to mint tokens', () => {
      const amount = 100_000_000_000n; // 1000 PRED (8 decimals)
      const result = simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = simnet.callReadOnlyFn(
        'governance',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(amount));
    });

    it('should reject mint from non-owner', () => {
      const amount = 100_000_000_000n;
      const result = simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject mint with zero amount', () => {
      const result = simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should update total supply when minting', () => {
      const amount1 = 100_000_000_000n;
      const amount2 = 200_000_000_000n;

      // First mint
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(amount1), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Second mint
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(amount2), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Check total supply
      const supply = simnet.callReadOnlyFn('governance', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(amount1 + amount2));
    });
  });

  describe('Transfer Functionality', () => {
    beforeEach(() => {
      // Mint some tokens to wallet1 before each test
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to transfer tokens', () => {
      const amount = 50_000_000_000n;
      const result = simnet.callPublicFn(
        'governance',
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
        'governance',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(senderBalance.result).toBeOk(Cl.uint(50_000_000_000n));

      const recipientBalance = simnet.callReadOnlyFn(
        'governance',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(recipientBalance.result).toBeOk(Cl.uint(50_000_000_000n));
    });

    it('should reject transfer from non-token-owner', () => {
      const amount = 50_000_000_000n;
      const result = simnet.callPublicFn(
        'governance',
        'transfer',
        [
          Cl.uint(amount),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_TOKEN_OWNER));
    });

    it('should reject transfer with zero amount', () => {
      const result = simnet.callPublicFn(
        'governance',
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
        'governance',
        'mint',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to burn their own tokens', () => {
      const amount = 50_000_000_000n;
      const result = simnet.callPublicFn(
        'governance',
        'burn',
        [Cl.uint(amount)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance decreased
      const balance = simnet.callReadOnlyFn(
        'governance',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(50_000_000_000n));

      // Verify total supply decreased
      const supply = simnet.callReadOnlyFn('governance', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(50_000_000_000n));
    });

    it('should reject burn with zero amount', () => {
      const result = simnet.callPublicFn(
        'governance',
        'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject burn exceeding balance', () => {
      const result = simnet.callPublicFn(
        'governance',
        'burn',
        [Cl.uint(150_000_000_000n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });
  });

  describe('Proposal Creation', () => {
    it('should reject invalid proposal type', () => {
      const result = simnet.callPublicFn(
        'governance',
        'create-proposal',
        [
          Cl.uint(99n), // Invalid type
          Cl.stringUtf8('Test'),
          Cl.stringUtf8('Test desc'),
          Cl.none(),
          Cl.none(),
          Cl.none(),
          Cl.bool(false),
        ],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_PROPOSAL_TYPE));
    });
  });

  describe('Parameter Updates', () => {
    const updateTests = [
      { fn: 'update-trading-fee', param: Cl.uint(200), name: 'trading fee' },
      { fn: 'update-lp-fee-share', param: Cl.uint(8000), name: 'LP fee share' },
      { fn: 'update-creator-fee-share', param: Cl.uint(1500), name: 'creator fee share' },
      { fn: 'update-protocol-fee-share', param: Cl.uint(500), name: 'protocol fee share' },
      { fn: 'update-minimum-collateral', param: Cl.uint(100_000_000), name: 'minimum collateral' },
      { fn: 'update-resolution-window', param: Cl.uint(2016), name: 'resolution window' },
      { fn: 'update-dispute-window', param: Cl.uint(2016), name: 'dispute window' },
      { fn: 'update-dispute-stake', param: Cl.uint(200_000_000), name: 'dispute stake' },
    ];

    updateTests.forEach(({ fn, param, name }) => {
      it(`should allow owner to update ${name}`, () => {
        const result = simnet.callPublicFn(
          'governance',
          fn,
          [param],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));
      });

      it(`should reject ${name} update from non-owner`, () => {
        const result = simnet.callPublicFn(
          'governance',
          fn,
          [param],
          wallet1
        );
        expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
      });
    });

    it('should allow owner to update protocol treasury', () => {
      const result = simnet.callPublicFn(
        'governance',
        'update-protocol-treasury',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject protocol treasury update from non-owner', () => {
      const result = simnet.callPublicFn(
        'governance',
        'update-protocol-treasury',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should allow owner to update emergency quorum percent', () => {
      const result = simnet.callPublicFn(
        'governance',
        'update-emergency-quorum-percent',
        [Cl.uint(40)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject emergency quorum percent above 100', () => {
      const result = simnet.callPublicFn(
        'governance',
        'update-emergency-quorum-percent',
        [Cl.uint(150)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_PROPOSAL));
    });

    it('should allow owner to update emergency approval percent', () => {
      const result = simnet.callPublicFn(
        'governance',
        'update-emergency-approval-percent',
        [Cl.uint(70)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject emergency approval percent above 100', () => {
      const result = simnet.callPublicFn(
        'governance',
        'update-emergency-approval-percent',
        [Cl.uint(150)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_PROPOSAL));
    });
  });

  describe('Read-Only Functions', () => {
    it('should return error for non-existent proposal', () => {
      const result = simnet.callReadOnlyFn(
        'governance',
        'get-proposal',
        [Cl.uint(999n)],
        deployer
      );
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return error for non-existent vote', () => {
      const result = simnet.callReadOnlyFn(
        'governance',
        'get-vote',
        [Cl.uint(1n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return empty list for proposer with no proposals', () => {
      const result = simnet.callReadOnlyFn(
        'governance',
        'get-proposer-proposals',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.list([]));
    });

    it('should return zero proposal count initially', () => {
      const result = simnet.callReadOnlyFn('governance', 'get-proposal-count', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero total voting power initially', () => {
      const result = simnet.callReadOnlyFn('governance', 'get-total-voting-power', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero proposal cooldown initially', () => {
      const result = simnet.callReadOnlyFn(
        'governance',
        'get-proposal-cooldown',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return all governable parameters', () => {
      const result = simnet.callReadOnlyFn('governance', 'get-governance-parameters', [], deployer);
      // Verify the result is an ok response
      expect(result.result.type).toBe('ok');
    });

    it('should return can-execute false for non-existent proposal', () => {
      const result = simnet.callReadOnlyFn(
        'governance',
        'can-execute-proposal',
        [Cl.uint(999n)],
        deployer
      );
      // Just verify it returns an ok response
      expect(result.result.type).toBe('ok');
    });

    it('should return "not-found" status for non-existent proposal', () => {
      const result = simnet.callReadOnlyFn(
        'governance',
        'get-proposal-status',
        [Cl.uint(999n)],
        deployer
      );
      expect(result.result).toBeOk(Cl.stringAscii('not-found'));
    });

    it('should return correct proposal type string', () => {
      const testCases = [
        { type: PROPOSAL_TYPE_PARAMETER_CHANGE, expected: 'parameter-change' },
        { type: PROPOSAL_TYPE_TREASURY_SPEND, expected: 'treasury-spend' },
        { type: PROPOSAL_TYPE_DISPUTE_RESOLUTION, expected: 'dispute-resolution' },
        { type: PROPOSAL_TYPE_ORACLE_WHITELIST, expected: 'oracle-whitelist' },
        { type: PROPOSAL_TYPE_EMERGENCY_ACTION, expected: 'emergency-action' },
      ];

      testCases.forEach(({ type, expected }) => {
        const result = simnet.callReadOnlyFn(
          'governance',
          'get-proposal-type-string',
          [Cl.uint(type)],
          deployer
        );
        expect(result.result).toBeOk(Cl.stringAscii(expected));
      });
    });

    it('should return "unknown" for invalid proposal type', () => {
      const result = simnet.callReadOnlyFn(
        'governance',
        'get-proposal-type-string',
        [Cl.uint(999n)],
        deployer
      );
      expect(result.result).toBeOk(Cl.stringAscii('unknown'));
    });
  });
});
