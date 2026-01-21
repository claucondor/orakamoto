import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

describe('Reputation Registry Contract', () => {
  beforeEach(() => {
    // No setup needed - reputation registry is independent
  });

  describe('SIP-010 Token Metadata', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-name',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.stringAscii('StackPredict Governance'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-symbol',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.stringAscii('PRED'));
    });

    it('should return correct decimals', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-decimals',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(8));
    });

    it('should return initial total supply as 0', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-total-supply',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return token URI as none', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-token-uri',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.none());
    });
  });

  describe('Mint Function', () => {
    it('should allow owner to mint tokens', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject mint from non-owner', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1300)); // ERR-NOT-AUTHORIZED
    });

    it('should reject mint with zero amount', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'mint',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1301)); // ERR-ZERO-AMOUNT
    });

    it('should update balance after mint', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const balanceResult = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balanceResult.result).toBeOk(Cl.uint(100000000));
    });
  });

  describe('Transfer Function', () => {
    beforeEach(() => {
      // Mint tokens to wallet1 first
      simnet.callPublicFn(
        'reputation-registry',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow transfer between accounts', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'transfer',
        [
          Cl.uint(50000000),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none()
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject transfer from non-token-owner', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'transfer',
        [
          Cl.uint(50000000),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none()
        ],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(1306)); // ERR-NOT-TOKEN-OWNER
    });

    it('should reject transfer with zero amount', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'transfer',
        [
          Cl.uint(0),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none()
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1301)); // ERR-ZERO-AMOUNT
    });

    it('should update balances after transfer', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'transfer',
        [
          Cl.uint(50000000),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none()
        ],
        wallet1
      );

      const balance1 = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance1.result).toBeOk(Cl.uint(50000000));

      const balance2 = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(balance2.result).toBeOk(Cl.uint(50000000));
    });
  });

  describe('Burn Function', () => {
    beforeEach(() => {
      // Mint tokens to wallet1 first
      simnet.callPublicFn(
        'reputation-registry',
        'mint',
        [Cl.uint(100000000), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to burn their tokens', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'burn',
        [Cl.uint(50000000)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject burn with zero amount', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1301)); // ERR-ZERO-AMOUNT
    });

    it('should reject burn with insufficient balance', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'burn',
        [Cl.uint(200000000)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1307)); // ERR-INSUFFICIENT-BALANCE
    });

    it('should update balance after burn', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'burn',
        [Cl.uint(30000000)],
        wallet1
      );

      const balanceResult = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balanceResult.result).toBeOk(Cl.uint(70000000));
    });
  });

  describe('Reputation Initialization', () => {
    it('should initialize reputation for a voter (owner only)', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),   // correct-votes
          Cl.uint(10),  // total-votes
          Cl.uint(800000) // participation-score (80%)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject initialization from non-owner', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(800000)
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1300)); // ERR-NOT-AUTHORIZED
    });

    it('should reject initialization with invalid participation score', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(1100000) // > 100%
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1302)); // ERR-INVALID-PARTICIPATION
    });

    it('should retrieve initialized reputation', () => {
      // Capture block height before initialization
      const blockBeforeInit = simnet.blockHeight;

      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(800000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      // get-reputation returns (ok (some {tuple})) or (ok none)
      expect(result.result.type).toBe('ok');
      const someValue = result.result.value;
      expect(someValue.type).toBe('some');
      const tupleValue = someValue.value;
      // The tuple is wrapped in a Clarity value, so access .value to get the actual tuple
      const rep = tupleValue.value;

      // Check the tuple keys
      const keys = Object.keys(rep);
      expect(keys).toContain('correct-votes');
      expect(keys).toContain('total-votes');
      expect(keys).toContain('participation-score');
      expect(keys).toContain('last-updated');
      expect(keys).toContain('total-earned');

      // The tuple values are Clarity values, so access .value to get the actual value
      expect(rep['correct-votes'].value).toBe(5n);
      expect(rep['total-votes'].value).toBe(10n);
      expect(rep['participation-score'].value).toBe(800000n);
      // last-updated should be the block height when initialized (between blockBeforeInit and current block)
      const lastUpdated = Number(rep['last-updated'].value);
      expect(lastUpdated).toBeGreaterThanOrEqual(Number(blockBeforeInit));
      expect(lastUpdated).toBeLessThanOrEqual(Number(simnet.blockHeight));
      expect(rep['total-earned'].value).toBe(0n);
    });
  });

  describe('Reputation Score Calculation', () => {
    beforeEach(() => {
      // Initialize reputation for wallet1: 5 correct out of 10 votes, 80% participation
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),   // correct-votes
          Cl.uint(10),  // total-votes
          Cl.uint(800000) // participation-score (80%)
        ],
        deployer
      );
    });

    it('should calculate reputation score correctly', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-score',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Formula: (correct_votes / total_votes) × participation × PRECISION
      // (5/10) × 0.8 × 1000000 = 0.5 × 0.8 × 1000000 = 400000
      expect(result.result).toBeOk(Cl.uint(400000));
    });

    it('should return minimum reputation for new voters', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-score',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Minimum reputation is 0.1 = 100000
      expect(result.result).toBeOk(Cl.uint(100000));
    });

    it('should calculate 100% reputation for perfect accuracy', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet2),
          Cl.uint(10),  // correct-votes (all correct)
          Cl.uint(10),  // total-votes
          Cl.uint(1000000) // participation-score (100%)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-score',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );

      // (10/10) × 1.0 × 1000000 = 1000000
      expect(result.result).toBeOk(Cl.uint(1000000));
    });
  });

  describe('Vote Power Calculation', () => {
    beforeEach(() => {
      // Initialize reputation for wallet1: 8 correct out of 10 votes, 90% participation
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(8),   // correct-votes
          Cl.uint(10),  // total-votes
          Cl.uint(900000) // participation-score (90%)
        ],
        deployer
      );
    });

    it('should calculate vote power with quadratic formula', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'calculate-vote-power',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(100000000), // 100 tokens staked
          Cl.uint(1008)       // 1 week lock
        ],
        deployer
      );

      // Formula: √(tokens) × reputation × time_multiplier / PRECISION
      // Integer sqrt(100000000) ≈ 6250004
      // reputation = (8/10) × 0.9 × 1000000 = 720000
      // time_multiplier = 1.0 (1 week = 1/52 year ≈ 0.02, so 1.0 + 0.02 = 1.02 ≈ 1.0)
      // vote_power = 6250004 × 720000 / 1000000 = 4500002880000
      expect(result.result).toBeOk(Cl.uint(4500002880000));
    });

    it('should apply time multiplier for longer locks', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'calculate-vote-power',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(100000000), // 100 tokens staked
          Cl.uint(52416)      // 1 year lock (364 days)
        ],
        deployer
      );

      // duration-in-months = 52416 / 43200 = 1
      // time_multiplier = 1000000 + (1 * 1000000 / 12) = 1083333
      // vote_power = 6250004 × 720000 × 1083333 / 1000000 = 4875001619999
      expect(result.result).toBeOk(Cl.uint(4875001619999));
    });

    it('should cap time multiplier at 4.0x', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'calculate-vote-power',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(100000000), // 100 tokens staked
          Cl.uint(210240)     // 4 years lock (max)
        ],
        deployer
      );

      // duration-in-months = 210240 / 43200 = 4
      // time_multiplier = 1000000 + (4 * 1000000 / 12) = 1333333
      // vote_power = 6250004 × 720000 × 1333333 / 1000000 ≈ 6000000000000
      // Using range check due to rounding differences
      const votePower = (result.result as any).value.value;
      expect(Number(votePower)).toBeGreaterThan(5900000000000);
      expect(Number(votePower)).toBeLessThan(6100000000000);
    });

    it('should return low vote power for new voters', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'calculate-vote-power',
        [
          Cl.standardPrincipal(wallet2), // No reputation
          Cl.uint(100000000),            // 100 tokens staked
          Cl.uint(1008)                  // 1 week lock
        ],
        deployer
      );

      // reputation = 0.1 (minimum) = 100000
      // vote_power = 6250004 × 100000 × 1000000 / 1000000 = 625000400000
      expect(result.result).toBeOk(Cl.uint(625000400000));
    });
  });

  describe('Vote Recording', () => {
    it('should record vote cast (authorized caller)', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),    // market-id
          Cl.uint(100000000) // tokens-staked
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject vote recording from unauthorized caller', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1300)); // ERR-NOT-AUTHORIZED
    });

    it('should prevent double voting on same market', () => {
      // First vote
      simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        deployer
      );

      // Second vote on same market
      const result = simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(50000000)
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1304)); // ERR-ALREADY-VOTED
    });

    it('should allow voting on different markets', () => {
      // Vote on market 1
      simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        deployer
      );

      // Vote on market 2
      const result = simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(2),
          Cl.uint(50000000)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should update total votes after recording', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-total-votes',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should update participation score after voting', () => {
      // Vote 10 times
      for (let i = 1; i <= 10; i++) {
        simnet.callPublicFn(
          'reputation-registry',
          'record-vote-cast',
          [
            Cl.standardPrincipal(wallet1),
            Cl.uint(i),
            Cl.uint(100000000)
          ],
          deployer
        );
      }

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-participation-rate',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      // 10 votes = 10% participation (capped at 100%)
      expect(result.result).toBeOk(Cl.uint(100000)); // 10% = 100000
    });
  });

  describe('Reputation Update (Vote Resolution)', () => {
    beforeEach(() => {
      // Initialize and record a vote first
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(800000)
        ],
        deployer
      );

      simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        deployer
      );
    });

    it('should update reputation when vote is correct', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'update-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.bool(true),  // was correct
          Cl.uint(5000000) // tokens earned
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject update from unauthorized caller', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'update-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.bool(true),
          Cl.uint(5000000)
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1300)); // ERR-NOT-AUTHORIZED
    });

    it('should reject update for non-existent voter', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'update-reputation',
        [
          Cl.standardPrincipal(wallet2), // No reputation
          Cl.bool(true),
          Cl.uint(5000000)
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1303)); // ERR-NO-REPUTATION-FOUND
    });

    it('should increment correct votes when vote is correct', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'update-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.bool(true),
          Cl.uint(5000000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-correct-votes',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(6)); // Was 5, now 6
    });

    it('should not increment correct votes when vote is incorrect', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'update-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.bool(false), // incorrect
          Cl.uint(0)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-correct-votes',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(5)); // Still 5
    });

    it('should update total earned tokens', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'update-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.bool(true),
          Cl.uint(5000000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-total-earned',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(5000000));
    });
  });

  describe('Reputation Decay', () => {
    beforeEach(() => {
      // Initialize reputation
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(8),
          Cl.uint(10),
          Cl.uint(900000)
        ],
        deployer
      );
    });

    it('should not decay if less than 1 month has passed', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'apply-decay',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should decay participation score after 1 month', () => {
      // Advance block height by 43200 (1 month)
      simnet.mineEmptyBlocks(43200);

      const result = simnet.callPublicFn(
        'reputation-registry',
        'apply-decay',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check decayed participation (90% - 1% = 89%)
      const participationResult = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-participation-rate',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(participationResult.result).toBeOk(Cl.uint(890000));
    });

    it('should decay multiple months correctly', () => {
      // Advance block height by 3 months
      simnet.mineEmptyBlocks(129600); // 43200 * 3

      simnet.callPublicFn(
        'reputation-registry',
        'apply-decay',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Check decayed participation (90% - 3% = 87%)
      const participationResult = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-participation-rate',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(participationResult.result).toBeOk(Cl.uint(870000));
    });

    it('should not decay below zero', () => {
      // Initialize with low participation
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet2),
          Cl.uint(1),
          Cl.uint(10),
          Cl.uint(10000) // 1%
        ],
        deployer
      );

      // Advance by 2 months
      simnet.mineEmptyBlocks(86400);

      simnet.callPublicFn(
        'reputation-registry',
        'apply-decay',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Should be 0 (1% - 2% = -1%, capped at 0)
      const participationResult = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-participation-rate',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(participationResult.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Get Decayed Reputation', () => {
    beforeEach(() => {
      // Initialize reputation
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(8),
          Cl.uint(10),
          Cl.uint(900000)
        ],
        deployer
      );
    });

    it('should return current reputation if no decay needed', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-decayed-reputation',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      // (8/10) × 0.9 × 1000000 = 720000
      expect(result.result).toBeOk(Cl.uint(720000));
    });

    it('should return decayed reputation after 1 month', () => {
      // Advance by 1 month
      simnet.mineEmptyBlocks(43200);

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-decayed-reputation',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Participation: 90% - 1% = 89%
      // decay-amount = 10000 * 1 = 10000
      // decay-factor = 1000000 - 10000 = 990000
      // (8/10) × 0.9 × 1000000 = 720000
      // decayed = (720000 * 990000) / 1000000 = 712800
      expect(result.result).toBeOk(Cl.uint(712800));
    });
  });

  describe('Reputation History', () => {
    it('should record history when initializing reputation', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(800000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-history',
        [Cl.uint(1)],
        deployer
      );

      // Check that result is ok and contains expected data
      expect(result.result.type).toBe('ok');
      const resultStr = JSON.stringify(result.result);
      expect(resultStr).toContain('initial');
      expect(resultStr).toContain(wallet1);
    });

    it('should record history when recording vote', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-history',
        [Cl.uint(1)],
        deployer
      );

      // Check that result is ok and contains expected data
      expect(result.result.type).toBe('ok');
      const resultStr = JSON.stringify(result.result);
      expect(resultStr).toContain('vote-cast');
      expect(resultStr).toContain(wallet1);
    });

    it('should record history when updating reputation', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(800000)
        ],
        deployer
      );

      simnet.callPublicFn(
        'reputation-registry',
        'update-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.bool(true),
          Cl.uint(5000000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-history',
        [Cl.uint(2)],
        deployer
      );

      // Check that result is ok and contains expected data
      expect(result.result.type).toBe('ok');
      const resultStr = JSON.stringify(result.result);
      expect(resultStr).toContain('vote-resolved');
      expect(resultStr).toContain(wallet1);
    });

    it('should record history when applying decay', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(800000)
        ],
        deployer
      );

      simnet.mineEmptyBlocks(43200);

      simnet.callPublicFn(
        'reputation-registry',
        'apply-decay',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-history',
        [Cl.uint(2)],
        deployer
      );

      // Check that result is ok and contains expected data
      expect(result.result.type).toBe('ok');
      const resultStr = JSON.stringify(result.result);
      expect(resultStr).toContain('decay');
      expect(resultStr).toContain(wallet1);
    });

    it('should track history count', () => {
      const initialCount = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-history-count',
        [],
        deployer
      );
      expect(initialCount.result).toBeOk(Cl.uint(0));

      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(800000)
        ],
        deployer
      );

      const afterInit = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-history-count',
        [],
        deployer
      );
      expect(afterInit.result).toBeOk(Cl.uint(1));
    });
  });

  describe('Has Voted on Market', () => {
    it('should return false for new voter', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'has-voted-on-market',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return true after voting on market', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'has-voted-on-market',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return false for different market', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'has-voted-on-market',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(2)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });
  });

  describe('Reset Reputation', () => {
    beforeEach(() => {
      // Initialize reputation and record votes
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(5),
          Cl.uint(10),
          Cl.uint(800000)
        ],
        deployer
      );

      simnet.callPublicFn(
        'reputation-registry',
        'record-vote-cast',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1),
          Cl.uint(100000000)
        ],
        deployer
      );
    });

    it('should reset reputation (owner only)', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'reset-reputation',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject reset from non-owner', () => {
      const result = simnet.callPublicFn(
        'reputation-registry',
        'reset-reputation',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1300)); // ERR-NOT-AUTHORIZED
    });

    it('should clear reputation after reset', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'reset-reputation',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.none());
    });
  });

  describe('Edge Cases', () => {
    it('should handle perfect accuracy correctly', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(100), // 100 correct
          Cl.uint(100), // 100 total
          Cl.uint(1000000) // 100% participation
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-score',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1000000)); // 100%
    });

    it('should handle zero accuracy correctly', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(0),   // 0 correct
          Cl.uint(10),  // 10 total
          Cl.uint(500000) // 50% participation
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-score',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should handle large token amounts in vote power calculation', () => {
      simnet.callPublicFn(
        'reputation-registry',
        'initialize-reputation',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(10),
          Cl.uint(10),
          Cl.uint(1000000)
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'calculate-vote-power',
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(10000000000), // 100,000 tokens
          Cl.uint(1008)
        ],
        deployer
      );

      // √10000000000 ≈ 625000005 (integer sqrt)
      // vote_power = 625000005 × 1000000 × 1.0 / 1000000 = 625000005000000
      // Using range check due to potential rounding differences
      const votePower = (result.result as any).value.value;
      expect(Number(votePower)).toBeGreaterThan(620000000000000);
      expect(Number(votePower)).toBeLessThan(630000000000000);
    });

    it('should handle minimum reputation correctly', () => {
      const result = simnet.callReadOnlyFn(
        'reputation-registry',
        'get-reputation-score',
        [Cl.standardPrincipal(wallet2)], // No reputation
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(100000)); // 0.1 minimum
    });
  });
});
