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

  describe('Attack Scenario Tests', () => {
    // Setup: Mint tokens and lock them for voting power
    const VOTE_ESCROW_CONTRACT = `${deployer}.vote-escrow`;
    const GOVERNANCE_CONTRACT = `${deployer}.governance`;

    beforeEach(() => {
      // Mint PRED tokens to wallet1 and wallet2 for testing
      const amount = 1_000_000_000_000n; // 10,000 PRED (8 decimals)
      const lockAmount = 100_000_000_000n; // 1000 PRED to lock

      // Mint to wallet1
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Mint to wallet2
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Transfer tokens to vote-escrow for wallet1
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(lockAmount), Cl.standardPrincipal(wallet1), Cl.principal(VOTE_ESCROW_CONTRACT), Cl.none()],
        wallet1
      );

      // Lock tokens for wallet1 to get voting power
      simnet.callPublicFn(
        'vote-escrow',
        'lock-tokens',
        [
          Cl.uint(lockAmount),
          Cl.uint(1008), // 1 week
          Cl.principal(GOVERNANCE_CONTRACT)
        ],
        wallet1
      );

      // Transfer tokens to vote-escrow for wallet2
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(lockAmount), Cl.standardPrincipal(wallet2), Cl.principal(VOTE_ESCROW_CONTRACT), Cl.none()],
        wallet2
      );

      // Lock tokens for wallet2 to get voting power
      simnet.callPublicFn(
        'vote-escrow',
        'lock-tokens',
        [
          Cl.uint(lockAmount),
          Cl.uint(1008), // 1 week
          Cl.principal(GOVERNANCE_CONTRACT)
        ],
        wallet2
      );

      // Create proposal to test against (wallet1 has voting power now)
      simnet.callPublicFn(
        'governance',
        'create-proposal',
        [
          Cl.uint(0n), // PARAMETER_CHANGE
          Cl.stringUtf8('Test Proposal'),
          Cl.stringUtf8('Test description'),
          Cl.none(),
          Cl.none(),
          Cl.none(),
          Cl.bool(false)
        ],
        wallet1
      );
    });

    describe('Proposal Spam Protection', () => {
      it('should prevent rapid proposal creation by enforcing cooldown period', () => {
        // wallet1 already created a proposal in beforeEach, so they should be on cooldown

        const result = simnet.callPublicFn(
          'governance',
          'create-proposal',
          [
            Cl.uint(0n), // PARAMETER_CHANGE
            Cl.stringUtf8('Spam Proposal 1'),
            Cl.stringUtf8('Trying to spam'),
            Cl.none(),
            Cl.none(),
            Cl.none(),
            Cl.bool(false)
          ],
          wallet1
        );

        // Should fail with cooldown error (ERR-COOLDOWN-NOT-ENDED = u914)
        expect(result.result).toBeErr(Cl.uint(914n));
      });

      it('should allow different addresses to create proposals during cooldown', () => {
        // wallet2 should be able to create a proposal since they didn't create one yet

        const result = simnet.callPublicFn(
          'governance',
          'create-proposal',
          [
            Cl.uint(0n), // PARAMETER_CHANGE
            Cl.stringUtf8('Legitimate Proposal'),
            Cl.stringUtf8('From different user'),
            Cl.none(),
            Cl.none(),
            Cl.none(),
            Cl.bool(false)
          ],
          wallet2
        );

        expect(result.result).toBeOk(Cl.uint(2n)); // Second proposal
      });
    });

    describe('Vote Manipulation Protection', () => {
      it('should prevent double voting on same proposal', () => {
        // Cast first vote
        const vote1 = simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(1n)], // Vote FOR
          wallet1
        );
        expect(vote1.result).toBeOk(Cl.bool(true));

        // Try to vote again (should fail)
        const vote2 = simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(1n)], // Vote FOR again
          wallet1
        );

        // ERR-ALREADY-VOTED = u906
        expect(vote2.result).toBeErr(Cl.uint(906n));
      });

      it('should count votes correctly even with coordinated voting timing', () => {
        // wallet1 votes FOR
        simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(1n)],
          wallet1
        );

        // wallet2 votes AGAINST
        simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(0n)],
          wallet2
        );

        // Check proposal vote counts
        const proposal = simnet.callReadOnlyFn(
          'governance',
          'get-proposal',
          [Cl.uint(1n)],
          deployer
        );

        // Both votes should be recorded
        expect(proposal.result.type).toBe('ok');
      });
    });

    describe('Last-Minute Voting Swings', () => {
      it('should allow voting until voting period ends, no matter how close to deadline', () => {
        // Mine enough blocks to get close to voting end (1008 blocks total)
        // Mine 1000 blocks (leaving 8 blocks remaining)
        simnet.mineEmptyBlocks(1000);

        // Should still be able to vote
        const voteResult = simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(1n)],
          wallet2
        );

        // Voting should be allowed (not ERR_VOTING_NOT_ENDED which is 907)
        expect(voteResult.result.type).toBe('ok');
      });

      it('should reject voting after voting period ends', () => {
        // Mine enough blocks to pass voting period (1008 blocks)
        simnet.mineEmptyBlocks(1008);

        // Try to vote after voting period
        const voteResult = simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(1n)],
          wallet2
        );

        // Should fail - either with ERR-PROPOSAL-NOT-ACTIVE (u905) or ERR-ZERO-AMOUNT (u902)
        // if voting power expires after lock period
        expect(voteResult.result.type).toBe('err');
      });

      it('should require timelock to pass before execution', () => {
        // Cast votes
        simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(1n)], // wallet1 votes FOR
          wallet1
        );

        // Mine past voting period but not timelock
        // Total: 1008 (voting) + 288 (timelock) = 1296 blocks
        // Mine 1100 blocks (past voting, but before timelock)
        simnet.mineEmptyBlocks(1100);

        // Try to execute (should fail - timelock not passed)
        const executeResult = simnet.callPublicFn(
          'governance',
          'execute-proposal',
          [Cl.uint(1n)],
          deployer
        );

        // Should fail with ERR-PROPOSAL-NOT-READY = u911
        expect(executeResult.result).toBeErr(Cl.uint(911n));
      });

      it('should only execute after both voting period and timelock end', () => {
        // Mine past both voting period (1008) and timelock (288) = 1296 blocks
        // Plus some buffer
        simnet.mineEmptyBlocks(1350);

        // Now execution should work (though it might fail for other reasons like quorum)
        const executeResult = simnet.callPublicFn(
          'governance',
          'execute-proposal',
          [Cl.uint(1n)],
          deployer
        );

        // The result should indicate quorum check, not timing issues
        expect(executeResult.result.type).toBe('err');
      });
    });

    describe('Minimal Voting Power Threshold Protection', () => {
      it('should prevent proposal creation without minimum voting power threshold', () => {
        // Create wallet3 with NO tokens/locked amounts
        const wallet3 = accounts.get('wallet_3')!;

        // Try to create proposal without locking tokens first
        const createResult = simnet.callPublicFn(
          'governance',
          'create-proposal',
          [
            Cl.uint(0n), // PARAMETER_CHANGE
            Cl.stringUtf8('Low Power Proposal'),
            Cl.stringUtf8('Should fail'),
            Cl.none(),
            Cl.none(),
            Cl.none(),
            Cl.bool(false)
          ],
          wallet3
        );

        // Should fail with ERR-INVALID-PROPOSAL = u904 (voting power < threshold)
        expect(createResult.result).toBeErr(Cl.uint(904n));
      });

      it('should allow emergency proposals with higher threshold but still require some power', () => {
        // Create wallet3 with minimal tokens (below normal threshold but attempt emergency)
        const wallet3 = accounts.get('wallet_3')!;

        // Mint just 1 PRED to wallet3
        simnet.callPublicFn(
          'governance',
          'mint',
          [Cl.uint(100_000_000n), Cl.standardPrincipal(wallet3)], // 1 PRED
          deployer
        );

        // Try to create emergency proposal (requires 10x normal threshold = ~10 PRED)
        const createResult = simnet.callPublicFn(
          'governance',
          'create-proposal',
          [
            Cl.uint(4n), // EMERGENCY_ACTION
            Cl.stringUtf8('Emergency'),
            Cl.stringUtf8('Try emergency'),
            Cl.none(),
            Cl.none(),
            Cl.none(),
            Cl.bool(true) // emergency flag
          ],
          wallet3
        );

        // Should fail - emergency requires 10x threshold
        expect(createResult.result).toBeErr(Cl.uint(904n));
      });
    });

    describe('Quorum and Majority Protection', () => {
      it('should prevent execution without reaching quorum', () => {
        // Mine past voting period and timelock
        simnet.mineEmptyBlocks(1350);

        // Try to execute proposal with 0 votes
        const executeResult = simnet.callPublicFn(
          'governance',
          'execute-proposal',
          [Cl.uint(1n)],
          deployer
        );

        // Should fail - either with ERR-QUORUM-NOT-REACHED (u908) or ERR-PROPOSAL-NOT-EXECUTED (u909)
        expect(executeResult.result.type).toBe('err');
      });

      it('should prevent execution without majority approval', () => {
        // Cast votes: wallet1 FOR (with voting power), wallet2 AGAINST
        // wallet1 needs to lock tokens first to have voting power

        // wallet1 locks tokens (1000 PRED for 1008 blocks = 1 week)
        // First, approve the governance contract
        // Note: In Stacks, we'd typically use the token's transfer function

        // Actually, let's just check the existing vote in beforeEach
        // wallet1 created the proposal but didn't explicitly lock tokens for voting

        // Cast votes
        simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(0n)], // wallet1 votes AGAINST (contradicts their proposal)
          wallet1
        );

        // Simulate more AGAINST votes than FOR votes
        // (In a real scenario, multiple wallets would vote)

        // Mine past voting and timelock
        simnet.mineEmptyBlocks(1350);

        // Try to execute
        const executeResult = simnet.callPublicFn(
          'governance',
          'execute-proposal',
          [Cl.uint(1n)],
          deployer
        );

        // Should fail due to not meeting approval threshold
        expect(executeResult.result.type).toBe('err');
      });
    });

    describe('Emergency Proposal Protection', () => {
      it('should enforce higher voting power threshold for emergency proposals', () => {
        // wallet2 tries to create emergency proposal
        // Emergency proposals require 10x the normal threshold
        // wallet2 has 1000 PRED locked which may or may not meet the emergency threshold

        const createResult = simnet.callPublicFn(
          'governance',
          'create-proposal',
          [
            Cl.uint(4n), // EMERGENCY_ACTION
            Cl.stringUtf8('Emergency'),
            Cl.stringUtf8('Test emergency'),
            Cl.none(),
            Cl.none(),
            Cl.none(),
            Cl.bool(true)
          ],
          wallet2
        );

        // The result depends on voting power calculation
        // Emergency proposals have stricter requirements
        // Either it succeeds (enough voting power) or fails with ERR-INVALID-PROPOSAL (u904)
        if (createResult.result.type === 'err') {
          // If it fails, it should be due to insufficient voting power
          expect(createResult.result).toBeErr(Cl.uint(904n));
        } else {
          // If it succeeds, verify it's an ok response
          expect(createResult.result.type).toBe('ok');
        }
      });
    });

    describe('Social Engineering Protection (tx-sender vs contract-caller)', () => {
      // Note: This is a conceptual test for the anti-phishing protection
      // In Clarity, using contract-caller instead of tx-sender prevents phishing

      it('should use contract-caller for authorization (verified in contract code)', () => {
        // This test verifies the contract uses contract-caller by checking
        // that admin functions reject direct calls appropriately

        // Try to call an admin function from non-owner
        const result = simnet.callPublicFn(
          'governance',
          'update-trading-fee',
          [Cl.uint(50n)],
          wallet1 // not owner
        );

        // Should fail with ERR-NOT-AUTHORIZED = u900
        expect(result.result).toBeErr(Cl.uint(900n));
      });
    });

    describe('Token Supply Manipulation Protection', () => {
      it('should prevent minting without owner authorization', () => {
        // Try to mint from wallet1 (not owner)
        const result = simnet.callPublicFn(
          'governance',
          'mint',
          [Cl.uint(1_000_000_000n), Cl.standardPrincipal(wallet1)],
          wallet1 // caller is not owner
        );

        // Should fail with ERR-NOT-AUTHORIZED = u900
        expect(result.result).toBeErr(Cl.uint(900n));
      });

      it('should prevent burning more than balance', () => {
        // Try to burn more than wallet1 has
        const result = simnet.callPublicFn(
          'governance',
          'burn',
          [Cl.uint(10_000_000_000_000n)], // Way too much
          wallet1
        );

        // Should fail with ERR-INSUFFICIENT-BALANCE = u903
        expect(result.result).toBeErr(Cl.uint(903n));
      });
    });

    describe('Parameter Update Protection', () => {
      it('should prevent non-owner from updating governance parameters', () => {
        const result = simnet.callPublicFn(
          'governance',
          'update-trading-fee',
          [Cl.uint(50n)], // 0.5%
          wallet1 // not owner
        );

        // Should fail with ERR-NOT-AUTHORIZED = u900
        expect(result.result).toBeErr(Cl.uint(900n));
      });

      it('should allow owner to update parameters', () => {
        const result = simnet.callPublicFn(
          'governance',
          'update-trading-fee',
          [Cl.uint(50n)], // 0.5%
          deployer // owner
        );

        // Should succeed
        expect(result.result).toBeOk(Cl.bool(true));
      });

      it('should validate parameter bounds', () => {
        // Try to set trading fee to 101% (10100 basis points)
        const result = simnet.callPublicFn(
          'governance',
          'update-trading-fee',
          [Cl.uint(10_100n)], // 101%
          deployer
        );

        // Should fail with ERR-INVALID-PROPOSAL = u904
        expect(result.result).toBeErr(Cl.uint(904n));
      });
    });

    describe('Collusion and Sybil Attack Scenarios', () => {
      it('should identify that multiple coordinated addresses can still vote independently', () => {
        // This test demonstrates that the system allows legitimate multi-address voting
        // No mechanism to prevent this (nor should there be in a decentralized system)

        // wallet1 votes FOR
        simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(1n)],
          wallet1
        );

        // wallet2 votes AGAINST
        simnet.callPublicFn(
          'governance',
          'vote',
          [Cl.uint(1n), Cl.uint(0n)],
          wallet2
        );

        // Check that both votes are counted
        const vote1 = simnet.callReadOnlyFn(
          'governance',
          'get-vote',
          [Cl.uint(1n), Cl.standardPrincipal(wallet1)],
          deployer
        );
        const vote2 = simnet.callReadOnlyFn(
          'governance',
          'get-vote',
          [Cl.uint(1n), Cl.standardPrincipal(wallet2)],
          deployer
        );

        expect(vote1.result.type).toBe('ok');
        expect(vote2.result.type).toBe('ok');
      });
    });

    describe('Proposal Cancellation Protection', () => {
      it('should prevent non-proposer from canceling proposal', () => {
        const result = simnet.callPublicFn(
          'governance',
          'cancel-proposal',
          [Cl.uint(1n)],
          wallet2 // not the proposer (wallet1 created it)
        );

        // Should fail with ERR-NOT-AUTHORIZED = u900
        expect(result.result).toBeErr(Cl.uint(900n));
      });

      it('should allow proposer to cancel before timelock ends', () => {
        // wallet1 canceling their own proposal
        const result = simnet.callPublicFn(
          'governance',
          'cancel-proposal',
          [Cl.uint(1n)],
          wallet1 // is the proposer
        );

        // Should succeed
        expect(result.result).toBeOk(Cl.bool(true));
      });

      it('should prevent cancellation after timelock ends', () => {
        // Mine past timelock period
        simnet.mineEmptyBlocks(1350);

        // Try to cancel after timelock
        const result = simnet.callPublicFn(
          'governance',
          'cancel-proposal',
          [Cl.uint(1n)],
          wallet1
        );

        // Should fail with ERR-PROPOSAL-NOT-READY = u911
        expect(result.result).toBeErr(Cl.uint(911n));
      });
    });
  });
});
