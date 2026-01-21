import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const ERR_NOT_AUTHORIZED = 1100n;
const ERR_ZERO_AMOUNT = 1101n;
const ERR_INSUFFICIENT_BALANCE = 1102n;
const ERR_MARKET_NOT_RESOLVED = 1103n;
const ERR_DISPUTE_ALREADY_OPENED = 1104n;
const ERR_DISPUTE_NOT_OPENED = 1105n;
const ERR_DISPUTE_WINDOW_NOT_ENDED = 1106n;
const ERR_DISPUTE_WINDOW_ENDED = 1107n;
const ERR_ALREADY_DISPUTED = 1108n;
const ERR_INVALID_MARKET = 1109n;
const ERR_NO_DISPUTE_FOUND = 1110n;
const ERR_DISPUTE_ALREADY_RESOLVED = 1111n;

// Constants
const MINIMUM_DISPUTE_STAKE = 100_000_000n; // 1 PRED (8 decimals)
const DISPUTE_WINDOW = 1008n; // ~7 days in blocks

describe('Dispute Contract', () => {
  describe('Open Dispute', () => {
    it('should allow anyone to open a dispute with minimum stake', () => {
      // Mint PRED tokens to wallet1 first (via governance contract)
      const mintAmount = 500_000_000_000n; // 5000 PRED
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Approve dispute contract to spend PRED
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(MINIMUM_DISPUTE_STAKE), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(simnet.getContractAddress('dispute')), Cl.none()],
        wallet1
      );

      const result = simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1), // market-id
          Cl.uint(0), // claimed-outcome (YES)
          Cl.uint(MINIMUM_DISPUTE_STAKE), // stake amount
          Cl.standardPrincipal(simnet.getContractAddress('governance')) // token contract
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(1)); // dispute-id
    });

    it('should reject dispute with stake below minimum', () => {
      const result = simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(50_000_000n), // Below 1 PRED minimum
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject invalid claimed outcome', () => {
      const result = simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1),
          Cl.uint(2), // Invalid outcome (only 0 or 1 allowed)
          Cl.uint(MINIMUM_DISPUTE_STAKE),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_MARKET));
    });

    it('should reject opening dispute on already disputed market', () => {
      // Setup: Mint tokens and open first dispute
      const mintAmount = 1_000_000_000_000n;
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(MINIMUM_DISPUTE_STAKE), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(simnet.getContractAddress('dispute')), Cl.none()],
        wallet1
      );

      // Open first dispute
      simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_STAKE),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet1
      );

      // Try to open another dispute on the same market
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(MINIMUM_DISPUTE_STAKE), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(simnet.getContractAddress('dispute')), Cl.none()],
        wallet2
      );

      const result = simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1), // Same market-id
          Cl.uint(1), // Different outcome
          Cl.uint(MINIMUM_DISPUTE_STAKE),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DISPUTE_ALREADY_OPENED));
    });
  });

  describe('Get Dispute Info', () => {
    beforeEach(() => {
      // Setup: Create a dispute before each test
      const mintAmount = 1_000_000_000_000n;
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(MINIMUM_DISPUTE_STAKE), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(simnet.getContractAddress('dispute')), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_STAKE),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet1
      );
    });

    it('should return dispute details by ID', () => {
      const result = simnet.callReadOnlyFn(
        'dispute',
        'get-dispute',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'market-id': Cl.uint(1),
            'disputer': Cl.standardPrincipal(wallet1),
            'claimed-outcome': Cl.uint(0),
            'stake-amount': Cl.uint(MINIMUM_DISPUTE_STAKE),
            'opened-at': Cl.uint(simnet.blockHeight),
            'dispute-deadline': Cl.uint(simnet.blockHeight + DISPUTE_WINDOW),
            'resolved': Cl.bool(false),
            'dispute-winner': Cl.none(),
            'votes-for-disputer': Cl.uint(0),
            'votes-for-creator': Cl.uint(0)
          })
        )
      );
    });

    it('should return dispute ID for a market', () => {
      const result = simnet.callReadOnlyFn(
        'dispute',
        'get-market-dispute',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.some(Cl.uint(1)));
    });

    it('should return empty for non-disputed market', () => {
      const result = simnet.callReadOnlyFn(
        'dispute',
        'get-market-dispute',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeOk(Cl.none());
    });

    it('should check if market has active dispute', () => {
      const result = simnet.callReadOnlyFn(
        'dispute',
        'has-active-dispute',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return dispute status with voting info', () => {
      const result = simnet.callReadOnlyFn(
        'dispute',
        'get-dispute-status',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'dispute-id': Cl.uint(1),
            'market-id': Cl.uint(1),
            'disputer': Cl.standardPrincipal(wallet1),
            'claimed-outcome': Cl.uint(0),
            'stake-amount': Cl.uint(MINIMUM_DISPUTE_STAKE),
            'opened-at': Cl.uint(simnet.blockHeight),
            'dispute-deadline': Cl.uint(simnet.blockHeight + DISPUTE_WINDOW),
            'resolved': Cl.bool(false),
            'dispute-winner': Cl.none(),
            'votes-for-disputer': Cl.uint(0),
            'votes-for-creator': Cl.uint(0),
            'can-vote': Cl.bool(true),
            'can-finalize': Cl.bool(false)
          })
        )
      );
    });

    it('should return disputer disputes list', () => {
      const result = simnet.callReadOnlyFn(
        'dispute',
        'get-disputer-disputes',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.list([Cl.uint(1)]));
    });
  });

  describe('Vote on Dispute', () => {
    beforeEach(() => {
      // Setup: Create dispute and give voting power to wallet2
      const mintAmount = 1_000_000_000_000n;
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Lock tokens for voting power
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(simnet.getContractAddress('vote-escrow')), Cl.none()],
        wallet2
      );

      simnet.callPublicFn(
        'vote-escrow',
        'lock-tokens',
        [
          Cl.uint(100_000_000_000n), // 1000 PRED
          Cl.uint(1008), // 1 week
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      // Open dispute
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(MINIMUM_DISPUTE_STAKE), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(simnet.getContractAddress('dispute')), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_STAKE),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet1
      );
    });

    it('should allow voting with valid vote type', () => {
      const result = simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1), // dispute-id
          Cl.uint(1), // vote-type: 1 = for disputer
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject invalid vote type', () => {
      const result = simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(2), // Invalid vote type
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_MARKET));
    });

    it('should reject voting after dispute window ends', () => {
      // Advance blocks past dispute window
      simnet.mineEmptyBlocks(1010);

      const result = simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_ENDED));
    });

    it('should reject double voting', () => {
      // First vote
      simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      // Try to vote again
      const result = simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_DISPUTED));
    });

    it('should reject voting with no voting power', () => {
      const result = simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet3 // wallet3 has no locked tokens
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should check if user has voted', () => {
      // Vote first
      simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      const result = simnet.callReadOnlyFn(
        'dispute',
        'has-voted-on-dispute',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return vote details', () => {
      simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      const result = simnet.callReadOnlyFn(
        'dispute',
        'get-dispute-vote',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'vote-type': Cl.uint(1),
            'voting-power': Cl.uint(100_000_000_000n) // 1000 PRED locked
          })
        )
      );
    });
  });

  describe('Finalize Dispute', () => {
    beforeEach(() => {
      // Setup: Create dispute, give voting power, and vote
      const mintAmount = 1_000_000_000_000n;
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Lock tokens for wallet2
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(simnet.getContractAddress('vote-escrow')), Cl.none()],
        wallet2
      );

      simnet.callPublicFn(
        'vote-escrow',
        'lock-tokens',
        [
          Cl.uint(100_000_000_000n),
          Cl.uint(1008),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      // Open dispute
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(MINIMUM_DISPUTE_STAKE), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(simnet.getContractAddress('dispute')), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_STAKE),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet1
      );
    });

    it('should reject finalizing before dispute window ends', () => {
      const result = simnet.callPublicFn(
        'dispute',
        'finalize-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_NOT_ENDED));
    });

    it('should finalize dispute with disputer winning when votes favor disputer', () => {
      // Vote for disputer
      simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(1), // For disputer
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      // Advance past dispute window
      simnet.mineEmptyBlocks(1010);

      const result = simnet.callPublicFn(
        'dispute',
        'finalize-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Check dispute is resolved with disputer as winner
      const status = simnet.callReadOnlyFn(
        'dispute',
        'get-dispute-status',
        [Cl.uint(1)],
        deployer
      );

      expect(status.result).toBeOk(
        expect.objectContaining({
          data: expect.objectContaining({
            resolved: Cl.bool(true),
            'dispute-winner': Cl.some(Cl.uint(0)) // 0 = disputer
          })
        })
      );
    });

    it('should finalize dispute with creator winning when no votes', () => {
      // No votes cast - creator wins by default
      // Advance past dispute window
      simnet.mineEmptyBlocks(1010);

      const result = simnet.callPublicFn(
        'dispute',
        'finalize-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Check dispute is resolved with creator as winner
      const status = simnet.callReadOnlyFn(
        'dispute',
        'get-dispute-status',
        [Cl.uint(1)],
        deployer
      );

      expect(status.result).toBeOk(
        expect.objectContaining({
          data: expect.objectContaining({
            resolved: Cl.bool(true),
            'dispute-winner': Cl.some(Cl.uint(1)) // 1 = creator
          })
        })
      );
    });

    it('should reject finalizing already resolved dispute', () => {
      // Finalize once
      simnet.mineEmptyBlocks(1010);
      simnet.callPublicFn(
        'dispute',
        'finalize-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        deployer
      );

      // Try to finalize again
      const result = simnet.callPublicFn(
        'dispute',
        'finalize-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DISPUTE_ALREADY_RESOLVED));
    });
  });

  describe('Cancel Dispute', () => {
    beforeEach(() => {
      // Setup: Create dispute
      const mintAmount = 1_000_000_000_000n;
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(MINIMUM_DISPUTE_STAKE), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(simnet.getContractAddress('dispute')), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_STAKE),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet1
      );
    });

    it('should allow disputer to cancel dispute before window ends', () => {
      const result = simnet.callPublicFn(
        'dispute',
        'cancel-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject non-disputer from canceling', () => {
      const result = simnet.callPublicFn(
        'dispute',
        'cancel-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject canceling after dispute window ends', () => {
      // Advance past dispute window
      simnet.mineEmptyBlocks(1010);

      const result = simnet.callPublicFn(
        'dispute',
        'cancel-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_ENDED));
    });

    it('should reject canceling already resolved dispute', () => {
      // Finalize dispute first
      simnet.mineEmptyBlocks(1010);
      simnet.callPublicFn(
        'dispute',
        'finalize-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        deployer
      );

      // Try to cancel
      const result = simnet.callPublicFn(
        'dispute',
        'cancel-dispute',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('governance'))],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_DISPUTE_ALREADY_RESOLVED));
    });
  });

  describe('Read-Only Functions', () => {
    it('should return dispute ID counter', () => {
      const result = simnet.callReadOnlyFn(
        'dispute',
        'get-dispute-id-counter',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return vote totals for dispute', () => {
      // Setup: Create dispute
      const mintAmount = 1_000_000_000_000n;
      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      simnet.callPublicFn(
        'governance',
        'mint',
        [Cl.uint(mintAmount), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Lock tokens for wallet2
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(wallet2), Cl.standardPrincipal(simnet.getContractAddress('vote-escrow')), Cl.none()],
        wallet2
      );

      simnet.callPublicFn(
        'vote-escrow',
        'lock-tokens',
        [
          Cl.uint(100_000_000_000n),
          Cl.uint(1008),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      // Open dispute
      simnet.callPublicFn(
        'governance',
        'transfer',
        [Cl.uint(MINIMUM_DISPUTE_STAKE), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(simnet.getContractAddress('dispute')), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        'dispute',
        'open-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_STAKE),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet1
      );

      // Vote for disputer
      simnet.callPublicFn(
        'dispute',
        'vote-on-dispute',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.standardPrincipal(simnet.getContractAddress('governance'))
        ],
        wallet2
      );

      const result = simnet.callReadOnlyFn(
        'dispute',
        'get-dispute-vote-totals',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          'for-disputer': Cl.uint(100_000_000_000n),
          'for-creator': Cl.uint(0),
          'total': Cl.uint(100_000_000_000n)
        })
      );
    });
  });
});
