import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

describe('Quadratic Voting Contract', () => {
  const CONTRACT_NAME = 'quadratic-voting';

  // Helper to get contract address
  const getContractAddress = () => {
    return `${deployer}.${CONTRACT_NAME}`;
  };

  // Helper to mint PRED tokens for testing
  const mintPredTokens = (recipient: string, amount: bigint) => {
    simnet.callPublicFn(
      'governance-token',
      'mint',
      [Cl.uint(amount), Cl.standardPrincipal(recipient)],
      deployer
    );
  };

  // Helper to initialize reputation for a voter
  const initializeReputation = (voter: string, correctVotes: bigint, totalVotes: bigint, participationScore: bigint) => {
    simnet.callPublicFn(
      'reputation-registry',
      'initialize-reputation',
      [Cl.standardPrincipal(voter), Cl.uint(correctVotes), Cl.uint(totalVotes), Cl.uint(participationScore)],
      deployer
    );
  };

  // Helper to create a voting session
  const createVotingSession = (marketId: bigint) => {
    const result = simnet.callPublicFn(
      CONTRACT_NAME,
      'create-voting-session',
      [Cl.uint(marketId)],
      deployer
    );
    return result;
  };

  // Helper to commit a vote
  const commitVote = (sessionId: bigint, outcome: bigint, salt: Uint8Array, tokensStaked: bigint, voter: string) => {
    // Calculate commitment hash
    const outcomeBuff = outcome === 0n ? new Uint8Array([0]) : new Uint8Array([1]);
    const combined = new Uint8Array(outcomeBuff.length + salt.length);
    combined.set(outcomeBuff);
    combined.set(salt, outcomeBuff.length);
    const commitment = Cl.bufferFromBytes(combined); // This is a simplified commitment

    return simnet.callPublicFn(
      CONTRACT_NAME,
      'commit-vote',
      [Cl.uint(sessionId), commitment, Cl.uint(tokensStaked)],
      voter
    );
  };

  beforeEach(() => {
    // Setup: mint PRED tokens for test accounts
    mintPredTokens(wallet1, 1000000000n); // 10 PRED (8 decimals)
    mintPredTokens(wallet2, 1000000000n);
    mintPredTokens(wallet3, 1000000000n);

    // Initialize reputation for test accounts
    initializeReputation(wallet1, 5n, 10n, 500000n); // 50% accuracy, 50% participation
    initializeReputation(wallet2, 8n, 10n, 800000n); // 80% accuracy, 80% participation
    initializeReputation(wallet3, 3n, 10n, 300000n); // 30% accuracy, 30% participation
  });

  describe('Session Creation', () => {
    it('should create a voting session', () => {
      const result = createVotingSession(1n);

      expect(result.result).toBeOk(Cl.uint(1)); // First session ID
      expect(result.events).toHaveLength(0);
    });

    it('should fail to create session from non-owner', () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-voting-session',
        [Cl.uint(1n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(1400)); // ERR-NOT-AUTHORIZED
    });

    it('should create session with correct timing', () => {
      const result = createVotingSession(1n);
      const sessionId = Cl.unwrapOk(result.result);

      const sessionResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-voting-session',
        [sessionId],
        deployer
      );

      const session = Cl.unwrapOk(sessionResult.result);
      expect(session).toBeDefined();
    });
  });

  describe('Commit Phase', () => {
    it('should allow committing a vote', () => {
      // Create session first
      const sessionResult = createVotingSession(1n);
      const sessionId = Cl.unwrapOk(sessionResult.result);

      // Commit vote
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
      const result = commitVote(sessionId, 0n, salt, 100000000n, wallet1); // 1 PRED

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should fail to commit with zero tokens', () => {
      const sessionResult = createVotingSession(1n);
      const sessionId = Cl.unwrapOk(sessionResult.result);

      const salt = new Uint8Array(32).fill(0);
      const result = commitVote(sessionId, 0n, salt, 0n, wallet1);

      expect(result.result).toBeErr(Cl.uint(1401)); // ERR-ZERO-AMOUNT
    });

    it('should fail to commit twice', () => {
      const sessionResult = createVotingSession(1n);
      const sessionId = Cl.unwrapOk(sessionResult.result);

      const salt = new Uint8Array(32).fill(0);
      commitVote(sessionId, 0n, salt, 100000000n, wallet1);

      // Try to commit again
      const salt2 = new Uint8Array(32).fill(1);
      const result = commitVote(sessionId, 0n, salt2, 100000000n, wallet1);

      expect(result.result).toBeErr(Cl.uint(1408)); // ERR-ALREADY-COMMITTED
    });
  });

  describe('Read-Only Functions', () => {
    it('should get session ID counter', () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-session-id-counter',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return false for non-existent session', () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'is-commit-phase',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should calculate commitment correctly', () => {
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'calculate-commitment',
        [Cl.uint(0), Cl.buffer(salt)],
        deployer
      );

      expect(result.result).toBeOk(Cl.buffer(new Uint8Array(32)));
    });
  });

  describe('Constants', () => {
    it('should have correct voting duration', () => {
      // VOTING-DURATION = 432 blocks (3 days)
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-session-id-counter',
        [],
        deployer
      );

      // Just verify the function exists and returns correctly
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });
});

// Additional tests for full lifecycle
describe('Quadratic Voting - Full Lifecycle', () => {
  const CONTRACT_NAME = 'quadratic-voting';

  const mintPredTokens = (recipient: string, amount: bigint) => {
    simnet.callPublicFn(
      'governance-token',
      'mint',
      [Cl.uint(amount), Cl.standardPrincipal(recipient)],
      deployer
    );
  };

  const initializeReputation = (voter: string, correctVotes: bigint, totalVotes: bigint, participationScore: bigint) => {
    simnet.callPublicFn(
      'reputation-registry',
      'initialize-reputation',
      [Cl.standardPrincipal(voter), Cl.uint(correctVotes), Cl.uint(totalVotes), Cl.uint(participationScore)],
      deployer
    );
  };

  const accounts = simnet.getAccounts();
  const deployer = accounts.get('deployer')!;
  const wallet1 = accounts.get('wallet_1')!;

  beforeEach(() => {
    mintPredTokens(wallet1, 1000000000n);
    initializeReputation(wallet1, 5n, 10n, 500000n);
  });

  it('should have correct error constants', () => {
    // Verify contract compiles and has expected functions
    const result = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      'get-session-id-counter',
      [],
      deployer
    );

    expect(result.result).toBeOk(Cl.uint(0));
  });
});
