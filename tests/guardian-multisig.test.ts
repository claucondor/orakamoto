import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;
const wallet4 = accounts.get('wallet_4')!;
const wallet5 = accounts.get('wallet_5')!;

describe('Guardian Multisig Contract', () => {
  beforeEach(() => {
    // Reset state between tests if needed
  });

  describe('Constants', () => {
    it('should return correct max guardians', () => {
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-max-guardians',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(5));
    });

    it('should return correct min approvals', () => {
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-min-approvals',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(3));
    });

    it('should return correct pause duration', () => {
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-pause-duration',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1008));
    });
  });

  describe('Guardian Management', () => {
    it('should allow owner to add guardian', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'add-guardian',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should reject non-owner from adding guardian', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'add-guardian',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should reject adding deployer as guardian', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'add-guardian',
        [Cl.standardPrincipal(deployer)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1501)); // ERR-ZERO-ADDRESS
    });

    it('should reject adding more than max guardians', () => {
      // Add 5 guardians
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet2)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet3)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet4)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet5)], deployer);

      // Try to add 6th
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'add-guardian',
        [Cl.standardPrincipal(accounts.get('wallet_6')!)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1502)); // ERR-MAX-GUARDIANS-REACHED
    });

    it('should allow owner to remove guardian', () => {
      // Add guardian first
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);

      const result = simnet.callPublicFn(
        'guardian-multisig',
        'remove-guardian',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject non-owner from removing guardian', () => {
      // Add guardian first
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);

      const result = simnet.callPublicFn(
        'guardian-multisig',
        'remove-guardian',
        [Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should reject removing non-existent guardian', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'remove-guardian',
        [Cl.uint(999)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1503)); // ERR-GUARDIAN-NOT-FOUND
    });
  });

  describe('Pause Initiation', () => {
    beforeEach(() => {
      // Add a guardian before each test
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
    });

    it('should allow guardian to initiate pause', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'initiate-pause',
        [
          Cl.none(), // target contract (none = pause all)
          Cl.stringUtf8('Emergency security issue')
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should reject non-guardian from initiating pause', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'initiate-pause',
        [
          Cl.none(),
          Cl.stringUtf8('Emergency security issue')
        ],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should allow guardian to initiate pause on specific contract', () => {
      const targetContract = Cl.standardPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-pool');
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'initiate-pause',
        [
          Cl.some(targetContract),
          Cl.stringUtf8('Market pool vulnerability')
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.uint(1));
    });
  });

  describe('Pause Approval', () => {
    beforeEach(() => {
      // Add 3 guardians
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet2)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet3)], deployer);

      // Initiate a pause
      simnet.callPublicFn(
        'guardian-multisig',
        'initiate-pause',
        [Cl.none(), Cl.stringUtf8('Emergency')],
        wallet1
      );
    });

    it('should allow guardian to approve pause', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'approve-pause',
        [Cl.uint(1)],
        wallet2
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject non-guardian from approving', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'approve-pause',
        [Cl.uint(1)],
        accounts.get('wallet_10')!
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should reject double voting', () => {
      // Initiator already voted, try to vote again
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'approve-pause',
        [Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1507)); // ERR-ALREADY-VOTED
    });

    it('should execute pause when threshold reached', () => {
      // wallet2 approves (2nd approval)
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet2);

      // wallet3 approves (3rd approval - threshold reached)
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'approve-pause',
        [Cl.uint(1)],
        wallet3
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check pause is now active
      const status = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-pause-status',
        [Cl.uint(1)],
        deployer
      );
      const statusValue = status.result;
      expect(statusValue).toBeOk(
        Cl.some(
          Cl.tuple({
            'pause-id': Cl.uint(1),
            'target-contract': Cl.none(),
            'is-active': Cl.bool(true),
            'is-executed': Cl.bool(true),
            'approvals': Cl.uint(3),
            'expires-at': expect.anything(),
            'is-expired': Cl.bool(false),
            'can-unpause': Cl.bool(false),
          })
        )
      );
    });
  });

  describe('Pause Unpause', () => {
    beforeEach(() => {
      // Setup: Add guardians and execute a pause
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet2)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet3)], deployer);

      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.none(), Cl.stringUtf8('Emergency')], wallet1);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet2);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet3);
    });

    it('should reject unpause if pause not expired', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'unpause-contract',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1506)); // ERR-PAUSE-NOT-EXPIRED
    });

    it('should allow unpause after pause expires', () => {
      // Advance blocks past pause duration (1008 blocks)
      for (let i = 0; i < 1010; i++) {
        simnet.mineBlock();
      }

      const result = simnet.callPublicFn(
        'guardian-multisig',
        'unpause-contract',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject unpause if not paused', () => {
      const result = simnet.callPublicFn(
        'guardian-multisig',
        'unpause-contract',
        [Cl.uint(999)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1505)); // ERR-NOT-PAUSED
    });
  });

  describe('Pause Cancellation', () => {
    beforeEach(() => {
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
    });

    it('should allow initiator to cancel pending pause', () => {
      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.none(), Cl.stringUtf8('Emergency')], wallet1);

      const result = simnet.callPublicFn(
        'guardian-multisig',
        'cancel-pause',
        [Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject non-initiator from canceling', () => {
      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.none(), Cl.stringUtf8('Emergency')], wallet1);

      const result = simnet.callPublicFn(
        'guardian-multisig',
        'cancel-pause',
        [Cl.uint(1)],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should reject canceling already executed pause', () => {
      // Setup: Execute a pause
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet2)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet3)], deployer);

      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.none(), Cl.stringUtf8('Emergency')], wallet1);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet2);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet3);

      const result = simnet.callPublicFn(
        'guardian-multisig',
        'cancel-pause',
        [Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1504)); // ERR-ALREADY-PAUSED
    });
  });

  describe('Read-Only Functions', () => {
    beforeEach(() => {
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet2)], deployer);
    });

    it('should check if principal is guardian', () => {
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'is-guardian',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return false for non-guardian', () => {
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'is-guardian',
        [Cl.standardPrincipal(accounts.get('wallet_10')!)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should get all guardians', () => {
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-guardians',
        [],
        deployer
      );
      expect(result.result).toBeOk(
        Cl.list([Cl.uint(1), Cl.uint(2)])
      );
    });

    it('should get guardian by ID', () => {
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-guardian-by-id',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.some(Cl.standardPrincipal(wallet1)));
    });

    it('should get pause action details', () => {
      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.none(), Cl.stringUtf8('Emergency')], wallet1);

      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-pause-action',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'target-contract': Cl.none(),
            'reason': Cl.stringUtf8('Emergency'),
            'initiated-by': Cl.standardPrincipal(wallet1),
            'initiated-at': expect.anything(),
            'approvals': Cl.uint(1),
            'is-active': Cl.bool(false),
            'is-executed': Cl.bool(false),
            'expires-at': Cl.none(),
          })
        )
      );
    });

    it('should get pause ID counter', () => {
      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.none(), Cl.stringUtf8('Emergency')], wallet1);

      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-pause-id-counter',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should get guardian ID counter', () => {
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-guardian-id-counter',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(2));
    });
  });

  describe('Contract Paused Check', () => {
    beforeEach(() => {
      // Setup: Add 3 guardians and execute a pause on a specific contract
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet2)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet3)], deployer);

      const targetContract = Cl.standardPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-pool');
      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.some(targetContract), Cl.stringUtf8('Emergency')], wallet1);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet2);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet3);
    });

    it('should return true for paused contract', () => {
      const targetContract = Cl.standardPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-pool');
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'is-contract-paused',
        [Cl.some(targetContract)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return false for non-paused contract', () => {
      const targetContract = Cl.standardPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.other-contract');
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'is-contract-paused',
        [Cl.some(targetContract)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should get contract pauses', () => {
      const targetContract = Cl.standardPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-pool');
      const result = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-contract-pauses',
        [Cl.some(targetContract)],
        deployer
      );
      expect(result.result).toBeOk(Cl.list([Cl.uint(1)]));
    });
  });

  describe('Integration Tests', () => {
    it('should complete full pause lifecycle', () => {
      // 1. Add guardians
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet2)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet3)], deployer);

      // 2. Initiate pause
      const initiateResult = simnet.callPublicFn(
        'guardian-multisig',
        'initiate-pause',
        [Cl.none(), Cl.stringUtf8('Security vulnerability detected')],
        wallet1
      );
      expect(initiateResult.result).toBeOk(Cl.uint(1));

      // 3. Approve by guardian 2
      const approve1Result = simnet.callPublicFn(
        'guardian-multisig',
        'approve-pause',
        [Cl.uint(1)],
        wallet2
      );
      expect(approve1Result.result).toBeOk(Cl.bool(true));

      // 4. Approve by guardian 3 (threshold reached, pause executes)
      const approve2Result = simnet.callPublicFn(
        'guardian-multisig',
        'approve-pause',
        [Cl.uint(1)],
        wallet3
      );
      expect(approve2Result.result).toBeOk(Cl.bool(true));

      // 5. Verify pause is active
      const statusResult = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-pause-status',
        [Cl.uint(1)],
        deployer
      );
      const status = statusResult.result;
      expect(status).toBeOk(
        Cl.some(
          Cl.tuple({
            'pause-id': Cl.uint(1),
            'target-contract': Cl.none(),
            'is-active': Cl.bool(true),
            'is-executed': Cl.bool(true),
            'approvals': Cl.uint(3),
            'expires-at': expect.anything(),
            'is-expired': Cl.bool(false),
            'can-unpause': Cl.bool(false),
          })
        )
      );

      // 6. Try to unpause too early (should fail)
      const earlyUnpause = simnet.callPublicFn(
        'guardian-multisig',
        'unpause-contract',
        [Cl.uint(1)],
        deployer
      );
      expect(earlyUnpause.result).toBeErr(Cl.uint(1506)); // ERR-PAUSE-NOT-EXPIRED

      // 7. Advance blocks past pause duration
      for (let i = 0; i < 1010; i++) {
        simnet.mineBlock();
      }

      // 8. Unpause after expiration
      const unpauseResult = simnet.callPublicFn(
        'guardian-multisig',
        'unpause-contract',
        [Cl.uint(1)],
        deployer
      );
      expect(unpauseResult.result).toBeOk(Cl.bool(true));

      // 9. Verify pause is no longer active
      const finalStatus = simnet.callReadOnlyFn(
        'guardian-multisig',
        'get-pause-status',
        [Cl.uint(1)],
        deployer
      );
      expect(finalStatus.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'pause-id': Cl.uint(1),
            'target-contract': Cl.none(),
            'is-active': Cl.bool(false),
            'is-executed': Cl.bool(true),
            'approvals': Cl.uint(3),
            'expires-at': expect.anything(),
            'is-expired': Cl.bool(true),
            'can-unpause': Cl.bool(false),
          })
        )
      );
    });

    it('should handle multiple pauses on different contracts', () => {
      // Setup guardians
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet1)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet2)], deployer);
      simnet.callPublicFn('guardian-multisig', 'add-guardian', [Cl.standardPrincipal(wallet3)], deployer);

      const contract1 = Cl.standardPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-pool');
      const contract2 = Cl.standardPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-factory');

      // Pause contract 1
      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.some(contract1), Cl.stringUtf8('Issue 1')], wallet1);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet2);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(1)], wallet3);

      // Pause contract 2
      simnet.callPublicFn('guardian-multisig', 'initiate-pause', [Cl.some(contract2), Cl.stringUtf8('Issue 2')], wallet2);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(2)], wallet1);
      simnet.callPublicFn('guardian-multisig', 'approve-pause', [Cl.uint(2)], wallet3);

      // Verify both are paused
      const paused1 = simnet.callReadOnlyFn(
        'guardian-multisig',
        'is-contract-paused',
        [Cl.some(contract1)],
        deployer
      );
      expect(paused1.result).toBeOk(Cl.bool(true));

      const paused2 = simnet.callReadOnlyFn(
        'guardian-multisig',
        'is-contract-paused',
        [Cl.some(contract2)],
        deployer
      );
      expect(paused2.result).toBeOk(Cl.bool(true));
    });
  });
});
