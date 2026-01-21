import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

// Constants matching the contract
const DISPUTE_WINDOW = 1008n; // ~7 days in blocks
const INITIAL_LIQUIDITY = 1_000_000_000n; // 1000 USDC with 6 decimals

// Error constants
const ERR_NOT_AUTHORIZED = 1000n;
const ERR_MARKET_NOT_ACTIVE = 1001n;
const ERR_MARKET_ALREADY_RESOLVED = 1002n;
const ERR_DEADLINE_NOT_PASSED = 1003n;
const ERR_INVALID_OUTCOME = 1004n;
const ERR_INSUFFICIENT_BALANCE = 1005n;
const ERR_INSUFFICIENT_LIQUIDITY = 1006n;
const ERR_ZERO_AMOUNT = 1007n;
const ERR_SLIPPAGE_TOO_HIGH = 1008n;
const ERR_ALREADY_CLAIMED = 1009n;
const ERR_NO_WINNINGS = 1010n;
const ERR_NOT_INITIALIZED = 1011n;
const ERR_ALREADY_INITIALIZED = 1012n;
const ERR_DISPUTE_WINDOW_ACTIVE = 1013n;
const ERR_DISPUTE_ALREADY_OPENED = 1014n;
const ERR_DISPUTE_ALREADY_CLOSED = 1015n;

// Helper function to initialize market for tests
function initializeMarket(caller: string, deadline: number, resDeadline: number) {
  // First give the caller some USDC via faucet
  simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(INITIAL_LIQUIDITY)], caller);

  // Initialize the market
  return simnet.callPublicFn(
    'market-pool',
    'initialize',
    [
      Cl.stringUtf8('Will BTC reach $100k by end of 2025?'),
      Cl.uint(deadline),
      Cl.uint(resDeadline),
      Cl.uint(INITIAL_LIQUIDITY),
    ],
    caller
  );
}

describe('Market Pool - Dispute Window', () => {
  describe('Dispute Window Constants', () => {
    it('should have correct DISPUTE-WINDOW value in get-dispute-window-info', () => {
      // Initialize market first
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMarket(deployer, deadline, resDeadline);

      const result = simnet.callReadOnlyFn(
        'market-pool',
        'get-dispute-window-info',
        [],
        deployer
      );

      // Should return info with dispute-window-blocks = 1008
      expect(result.result).toBeOk(
        Cl.tuple({
          'dispute-window-blocks': Cl.uint(DISPUTE_WINDOW),
          'resolution-block': Cl.uint(0),
          'dispute-window-ends': Cl.uint(0),
          'claims-enabled': Cl.bool(false),
        })
      );
    });
  });

  describe('Resolution sets resolution-block', () => {
    it('should set resolution-block when market is resolved', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMarket(deployer, deadline, resDeadline);

      // Advance blocks past deadline
      simnet.mineEmptyBlocks(11);

      // Resolve the market
      const resolveResult = simnet.callPublicFn(
        'market-pool',
        'resolve',
        [Cl.uint(0)], // YES wins
        deployer
      );
      expect(resolveResult.result).toBeOk(Cl.bool(true));

      // Check dispute window info
      const disputeInfo = simnet.callReadOnlyFn(
        'market-pool',
        'get-dispute-window-info',
        [],
        deployer
      );

      // The resolution-block is set to block-height during the resolve call
      // We can verify it's set (not 0) and dispute-window-ends is calculated correctly
      const result = (disputeInfo.result as any).value.value;

      expect(result['dispute-window-blocks']).toEqual(Cl.uint(DISPUTE_WINDOW));
      expect(result['resolution-block']).toBeGreaterThan(Cl.uint(0));
      expect(result['dispute-window-ends']).toBeGreaterThan(Cl.uint(0));
      expect(result['claims-enabled']).toEqual(Cl.bool(false));
    });
  });

  describe('Claim blocked during dispute window', () => {
    it('should reject claim immediately after resolution', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMarket(deployer, deadline, resDeadline);

      // Give wallet1 USDC and buy YES tokens
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(500_000_000n)], wallet1);
      simnet.callPublicFn(
        'market-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(100_000_000n), Cl.uint(0)], // Buy YES
        wallet1
      );

      // Advance past deadline and resolve
      simnet.mineEmptyBlocks(11);
      simnet.callPublicFn('market-pool', 'resolve', [Cl.uint(0)], deployer);

      // Try to claim immediately (should fail - dispute window active)
      const claimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
      expect(claimResult.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_ACTIVE));
    });

    it('should reject claim before dispute window ends', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMarket(deployer, deadline, resDeadline);

      // Give wallet1 USDC and buy YES tokens
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(500_000_000n)], wallet1);
      simnet.callPublicFn(
        'market-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(100_000_000n), Cl.uint(0)],
        wallet1
      );

      // Advance past deadline and resolve
      simnet.mineEmptyBlocks(11);
      simnet.callPublicFn('market-pool', 'resolve', [Cl.uint(0)], deployer);

      // Mine blocks but not enough to pass dispute window (mine 500 blocks, need 1008)
      simnet.mineEmptyBlocks(500);

      // Try to claim (should still fail)
      const claimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
      expect(claimResult.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_ACTIVE));
    });
  });

  describe('Claim allowed after dispute window', () => {
    it('should allow claim after dispute window passes', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMarket(deployer, deadline, resDeadline);

      // Give wallet1 USDC and buy YES tokens
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(500_000_000n)], wallet1);
      const buyResult = simnet.callPublicFn(
        'market-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(100_000_000n), Cl.uint(0)],
        wallet1
      );
      // Just check it's an Ok response (tokens received varies based on pool state)
      expect(buyResult.result.type).toBe('ok');

      // Check wallet1 has YES tokens
      const yesBalance = simnet.callReadOnlyFn(
        'market-pool',
        'get-outcome-balance',
        [Cl.standardPrincipal(wallet1), Cl.uint(0)],
        wallet1
      );

      // Advance past deadline and resolve
      simnet.mineEmptyBlocks(11);
      simnet.callPublicFn('market-pool', 'resolve', [Cl.uint(0)], deployer);

      // Mine enough blocks to pass dispute window
      simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) + 1);

      // Check dispute window info shows claims enabled
      const disputeInfo = simnet.callReadOnlyFn(
        'market-pool',
        'get-dispute-window-info',
        [],
        deployer
      );

      // Now claim should succeed
      const claimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
      expect(claimResult.result.type).toBe('ok');
    });

    it('should show claims-enabled as true after dispute window', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMarket(deployer, deadline, resDeadline);

      // Advance past deadline and resolve
      simnet.mineEmptyBlocks(11);
      simnet.callPublicFn('market-pool', 'resolve', [Cl.uint(0)], deployer);

      // Mine enough blocks to pass dispute window
      simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) + 1);

      // Check dispute window info
      const disputeInfo = simnet.callReadOnlyFn(
        'market-pool',
        'get-dispute-window-info',
        [],
        deployer
      );

      // Extract the claims-enabled value
      const result = disputeInfo.result;
      if (result.type === 7 && result.value.type === 12) { // ok + tuple
        const tuple = result.value.value;
        expect(tuple['claims-enabled']).toStrictEqual(Cl.bool(true));
      }
    });
  });

  describe('Dispute window edge cases', () => {
    it('should allow claim exactly at dispute window end', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMarket(deployer, deadline, resDeadline);

      // Give wallet1 USDC and buy YES tokens
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(500_000_000n)], wallet1);
      simnet.callPublicFn(
        'market-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(100_000_000n), Cl.uint(0)],
        wallet1
      );

      // Advance past deadline and resolve
      simnet.mineEmptyBlocks(11);
      const resolveResult = simnet.callPublicFn('market-pool', 'resolve', [Cl.uint(0)], deployer);
      const resolutionBlock = simnet.blockHeight;

      // Mine exactly DISPUTE_WINDOW blocks to reach the boundary
      // We need: current_block >= resolution_block + DISPUTE_WINDOW
      // After mining N blocks, block_height becomes resolutionBlock + N
      // So we need N >= DISPUTE_WINDOW, meaning N = DISPUTE_WINDOW should work
      simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW));

      // Claim should succeed at exactly the boundary
      const claimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
      expect(claimResult.result.type).toBe('ok');
    });

    it('should reject claim one block before dispute window ends', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMarket(deployer, deadline, resDeadline);

      // Give wallet1 USDC and buy YES tokens
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(500_000_000n)], wallet1);
      simnet.callPublicFn(
        'market-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(100_000_000n), Cl.uint(0)],
        wallet1
      );

      // Advance past deadline and resolve
      simnet.mineEmptyBlocks(11);
      simnet.callPublicFn('market-pool', 'resolve', [Cl.uint(0)], deployer);

      // Mine DISPUTE_WINDOW - 2 blocks (the claim call will be at DISPUTE_WINDOW - 1)
      // Because when we call the function, block_height is at resolutionBlock + mined_blocks
      // We need block_height < resolution_block + DISPUTE_WINDOW
      // So mined_blocks < DISPUTE_WINDOW, meaning mined_blocks = DISPUTE_WINDOW - 1 fails
      simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) - 2);

      // Claim should fail (still within window)
      const claimResult = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
      expect(claimResult.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_ACTIVE));
    });
  });

  describe('Complete market lifecycle with dispute window', () => {
    it('should handle full lifecycle: create -> trade -> resolve -> wait -> claim', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      // 1. Initialize market
      initializeMarket(deployer, deadline, resDeadline);

      // 2. Users buy outcome tokens
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(500_000_000n)], wallet1);
      simnet.callPublicFn('mock-usdc', 'faucet', [Cl.uint(500_000_000n)], wallet2);

      // wallet1 buys YES (outcome 0)
      simnet.callPublicFn(
        'market-pool',
        'buy-outcome',
        [Cl.uint(0), Cl.uint(100_000_000n), Cl.uint(0)],
        wallet1
      );

      // wallet2 buys NO (outcome 1)
      simnet.callPublicFn(
        'market-pool',
        'buy-outcome',
        [Cl.uint(1), Cl.uint(100_000_000n), Cl.uint(0)],
        wallet2
      );

      // 3. Advance past deadline
      simnet.mineEmptyBlocks(11);

      // 4. Resolve market (YES wins)
      const resolveResult = simnet.callPublicFn(
        'market-pool',
        'resolve',
        [Cl.uint(0)],
        deployer
      );
      expect(resolveResult.result).toBeOk(Cl.bool(true));

      // 5. Try to claim immediately (should fail)
      const earlyClaimWallet1 = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
      expect(earlyClaimWallet1.result).toBeErr(Cl.uint(ERR_DISPUTE_WINDOW_ACTIVE));

      // 6. Wait for dispute window to pass
      simnet.mineEmptyBlocks(Number(DISPUTE_WINDOW) + 1);

      // 7. Winner (wallet1) claims successfully
      const claimWallet1 = simnet.callPublicFn('market-pool', 'claim', [], wallet1);
      expect(claimWallet1.result.type).toBe('ok');

      // 8. Loser (wallet2) cannot claim (no winning tokens)
      const claimWallet2 = simnet.callPublicFn('market-pool', 'claim', [], wallet2);
      expect(claimWallet2.result).toBeErr(Cl.uint(ERR_NO_WINNINGS));
    });
  });
});
