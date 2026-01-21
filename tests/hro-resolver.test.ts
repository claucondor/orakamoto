import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Error constants
const ERR_NOT_AUTHORIZED = 1200n;
const ERR_ZERO_AMOUNT = 1201n;
const ERR_INSUFFICIENT_BOND = 1202n;
const ERR_MARKET_NOT_FOUND = 1203n;
const ERR_ALREADY_ESCALATED = 1205n;
const ERR_ESCALATION_NOT_TIMEOUT = 1207n;
const ERR_BOND_THRESHOLD_REACHED = 1208n;
const ERR_INVALID_OUTCOME = 1209n;
const ERR_ALREADY_RESOLVED = 1210n;
const ERR_LEADING_OUTCOME_MISMATCH = 1212n;

// Constants
const MINIMUM_DISPUTE_BOND = 50_000_000n; // 50 USDC
const ESCALATION_THRESHOLD = 5_120_000_000n; // 51,200 USDC
const ESCALATION_TIMEOUT = 1008n; // ~7 days in blocks
const MAX_ESCALATION_ROUNDS = 10n;

describe('HRO Resolver Contract', () => {
  describe('Initiate Escalation', () => {
    it('should allow creator to initiate escalation with minimum bond', () => {
      const initialBond = 100_000_000n; // 100 USDC
      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1), // market-id
          Cl.uint(0), // outcome (YES)
          Cl.uint(initialBond),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(1)); // bond-id
    });

    it('should reject initiation with bond below minimum', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(40_000_000n), // Below 50 USDC minimum
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BOND));
    });

    it('should reject invalid outcome', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(2), // Invalid outcome (only 0 or 1 allowed)
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });

    it('should reject initiating escalation twice for same market', () => {
      const initialBond = 100_000_000n;

      // First initiation
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(initialBond),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      // Second attempt on same market
      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(initialBond),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_ESCALATED));
    });
  });

  describe('Initiate Dispute (Bond Escalation)', () => {
    beforeEach(() => {
      // Setup: Initiate escalation first
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0), // YES
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );
    });

    it('should allow anyone to dispute with 2x current bond', () => {
      const expectedBond = MINIMUM_DISPUTE_BOND * 2n;

      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1), // market-id
          Cl.uint(1), // claimed-outcome (NO, opposite of current)
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet2
      );

      expect(result.result).toBeOk(Cl.uint(2)); // bond-id
    });

    it('should reject disputing with same outcome as leading', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1),
          Cl.uint(0), // Same outcome as leading (YES)
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_LEADING_OUTCOME_MISMATCH));
    });

    it('should reject invalid outcome', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1),
          Cl.uint(2), // Invalid outcome
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_OUTCOME));
    });

    it('should update escalation state correctly after dispute', () => {
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet2
      );

      const state = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-escalation-state',
        [Cl.uint(1)],
        deployer
      );

      expect(state.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'current-round': Cl.uint(1),
            'current-bond': Cl.uint(100_000_000n), // 2x original
            'last-action-block': Cl.uint(simnet.blockHeight),
            'leading-outcome': Cl.uint(1),
            'is-resolved': Cl.bool(false),
            'winning-outcome': Cl.none(),
            'total-bonds-staked': Cl.uint(150_000_000n) // 50M + 100M
          })
        )
      );
    });

    it('should allow counter-dispute (back to original outcome)', () => {
      // First dispute (wallet2 challenges wallet1's YES)
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet2
      );

      // Counter-dispute by wallet3 (back to YES)
      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1),
          Cl.uint(0), // Back to YES
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet3
      );

      expect(result.result).toBeOk(Cl.uint(3)); // bond-id

      // Check state: round should be 2, bond should be 4x original
      const state = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-escalation-state',
        [Cl.uint(1)],
        deployer
      );

      expect(state.result).toBeOk(
        expect.objectContaining({
          data: expect.objectContaining({
            'current-round': Cl.uint(2),
            'current-bond': Cl.uint(200_000_000n), // 4x original (50M * 2^2)
            'leading-outcome': Cl.uint(0)
          })
        })
      );
    });

    it('should reject when max escalation rounds reached', () => {
      // Simulate 10 escalation rounds
      for (let i = 0; i < 9; i++) {
        const outcome = i % 2 === 0 ? 1 : 0;
        simnet.callPublicFn(
          'hro-resolver',
          'initiate-dispute',
          [
            Cl.uint(1),
            Cl.uint(outcome),
            Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
          ],
          wallet2
        );
      }

      // Try 11th escalation (should fail)
      const result = simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet3
      );

      expect(result.result).toBeErr(Cl.uint(ERR_BOND_THRESHOLD_REACHED));
    });
  });

  describe('Calculate Next Bond', () => {
    it('should return minimum bond when no escalation state exists', () => {
      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'calculate-next-bond',
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          'next-round': Cl.uint(0),
          'next-bond': Cl.uint(MINIMUM_DISPUTE_BOND)
        })
      );
    });

    it('should calculate 2x bond for next round', () => {
      // Initiate escalation
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'calculate-next-bond',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          'next-round': Cl.uint(1),
          'next-bond': Cl.uint(100_000_000n) // 2x minimum
        })
      );
    });
  });

  describe('Can Finalize Escalation', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );
    });

    it('should return false before timeout', () => {
      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'can-finalize-escalation',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          'can-finalize': Cl.bool(false),
          'timeout-block': Cl.uint(simnet.blockHeight + ESCALATION_TIMEOUT)
        })
      );
    });

    it('should return true after timeout', () => {
      // Mine blocks past timeout
      simnet.mineEmptyBlocks(1010);

      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'can-finalize-escalation',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(
        expect.objectContaining({
          data: expect.objectContaining({
            'can-finalize': Cl.bool(true)
          })
        })
      );
    });
  });

  describe('Is Bond Threshold Reached', () => {
    it('should return false when below threshold', () => {
      // Initiate with minimum bond
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'is-bond-threshold-reached',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return true when bond exceeds threshold', () => {
      // Initiate with bond above threshold
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(ESCALATION_THRESHOLD + 1n),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'is-bond-threshold-reached',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });
  });

  describe('Is Ready For Escalation', () => {
    it('should return true when threshold reached and not resolved', () => {
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(ESCALATION_THRESHOLD + 1n),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'is-ready-for-escalation',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });
  });

  describe('Finalize Escalation', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );
    });

    it('should reject finalizing before timeout', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'finalize-escalation',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ESCALATION_NOT_TIMEOUT));
    });

    it('should finalize after timeout with leading outcome', () => {
      // Mine blocks past timeout
      simnet.mineEmptyBlocks(1010);

      const result = simnet.callPublicFn(
        'hro-resolver',
        'finalize-escalation',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(0)); // Returns winning outcome (YES)

      // Check state is resolved
      const state = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-escalation-state',
        [Cl.uint(1)],
        deployer
      );

      expect(state.result).toBeOk(
        expect.objectContaining({
          data: expect.objectContaining({
            'is-resolved': Cl.bool(true),
            'winning-outcome': Cl.some(Cl.uint(0))
          })
        })
      );
    });

    it('should reject finalizing already resolved escalation', () => {
      // Mine blocks past timeout and finalize
      simnet.mineEmptyBlocks(1010);
      simnet.callPublicFn(
        'hro-resolver',
        'finalize-escalation',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))],
        deployer
      );

      // Try to finalize again
      const result = simnet.callPublicFn(
        'hro-resolver',
        'finalize-escalation',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_RESOLVED));
    });
  });

  describe('Trigger Voting', () => {
    it('should trigger voting when bond threshold is reached', () => {
      // Initiate with bond above threshold
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(ESCALATION_THRESHOLD + 1n),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      const result = simnet.callPublicFn(
        'hro-resolver',
        'trigger-voting',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject when bond threshold not reached', () => {
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      const result = simnet.callPublicFn(
        'hro-resolver',
        'trigger-voting',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_BOND_THRESHOLD_REACHED));
    });
  });

  describe('Distribute Bonds', () => {
    beforeEach(() => {
      // Setup: Initiate escalation, dispute, and finalize
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      // Mine past timeout and finalize
      simnet.mineEmptyBlocks(1010);
      simnet.callPublicFn(
        'hro-resolver',
        'finalize-escalation',
        [Cl.uint(1), Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))],
        deployer
      );
    });

    it('should allow owner to distribute bonds to winner', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'distribute-bonds',
        [
          Cl.uint(1),
          Cl.uint(0), // Winning outcome
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(50_000_000n)); // Total bonds
    });

    it('should reject non-owner from distributing', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'distribute-bonds',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject distributing before resolution', () => {
      // Setup new market without finalizing
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(2),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      const result = simnet.callPublicFn(
        'hro-resolver',
        'distribute-bonds',
        [
          Cl.uint(2),
          Cl.uint(0),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(ERR_ESCALATION_NOT_TIMEOUT));
    });
  });

  describe('Reset Escalation', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );
    });

    it('should allow owner to reset escalation', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'reset-escalation',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify state is deleted
      const state = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-escalation-state',
        [Cl.uint(1)],
        deployer
      );

      expect(state.result).toBeOk(Cl.none());
    });

    it('should reject non-owner from resetting', () => {
      const result = simnet.callPublicFn(
        'hro-resolver',
        'reset-escalation',
        [Cl.uint(1)],
        wallet2
      );

      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('Read-Only Functions', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );
    });

    it('should return dispute bond by ID', () => {
      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-dispute-bond',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'disputer': Cl.standardPrincipal(wallet1),
            'amount': Cl.uint(MINIMUM_DISPUTE_BOND),
            'outcome-claimed': Cl.uint(0),
            'round': Cl.uint(0),
            'timestamp': Cl.uint(simnet.blockHeight)
          })
        )
      );
    });

    it('should return market bonds list', () => {
      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-market-bonds',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.list([Cl.uint(1)]));
    });

    it('should return disputer bonds list', () => {
      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-disputer-bonds',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.list([Cl.uint(1)]));
    });

    it('should return leading outcome', () => {
      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-leading-outcome',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.some(Cl.uint(0)));
    });

    it('should return bond ID counter', () => {
      const result = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-bond-id-counter',
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(1));
    });
  });

  describe('Integration: Full Escalation Flow', () => {
    it('should handle complete escalation cycle with multiple rounds', () => {
      // Round 0: Creator initiates with 50 USDC
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0), // YES
          Cl.uint(MINIMUM_DISPUTE_BOND),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      // Round 1: Disputer challenges with 100 USDC (2x)
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1),
          Cl.uint(1), // NO
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet2
      );

      // Round 2: Counter-dispute with 200 USDC (4x)
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-dispute',
        [
          Cl.uint(1),
          Cl.uint(0), // Back to YES
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet3
      );

      // Verify state after 3 rounds
      const state = simnet.callReadOnlyFn(
        'hro-resolver',
        'get-escalation-state',
        [Cl.uint(1)],
        deployer
      );

      expect(state.result).toBeOk(
        expect.objectContaining({
          data: expect.objectContaining({
            'current-round': Cl.uint(2),
            'current-bond': Cl.uint(200_000_000n), // 4x original
            'leading-outcome': Cl.uint(0),
            'total-bonds-staked': Cl.uint(350_000_000n) // 50 + 100 + 200
          })
        })
      );
    });

    it('should trigger voting when bond threshold exceeded', () => {
      // Initiate with bond above threshold
      simnet.callPublicFn(
        'hro-resolver',
        'initiate-escalation',
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(ESCALATION_THRESHOLD + 1n),
          Cl.standardPrincipal(simnet.getContractAddress('mock-usdc'))
        ],
        wallet1
      );

      // Check threshold reached
      const thresholdCheck = simnet.callReadOnlyFn(
        'hro-resolver',
        'is-bond-threshold-reached',
        [Cl.uint(1)],
        deployer
      );
      expect(thresholdCheck.result).toBeOk(Cl.bool(true));

      // Trigger voting
      const result = simnet.callPublicFn(
        'hro-resolver',
        'trigger-voting',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });
  });
});
