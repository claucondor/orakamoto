import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

// Constants
const INITIAL_LIQUIDITY = 1_000_000_000n; // 1000 USDC with 6 decimals
const DISPUTE_WINDOW = 1008n;

// Error constants for market-pool
const ERR_NOT_AUTHORIZED = 1000n;
const ERR_MARKET_ALREADY_RESOLVED = 1002n;
const ERR_INSUFFICIENT_LIQUIDITY = 1006n;
const ERR_NOT_INITIALIZED = 1011n;
const ERR_ALREADY_INITIALIZED = 1012n;
const ERR_ALREADY_DEPOSITED = 1016n;
const ERR_INSUFFICIENT_IDLE_LIQUIDITY = 1017n;

// Error constants for multi-outcome-pool
const ERR_MULTI_NOT_AUTHORIZED = 2000n;
const ERR_MULTI_MARKET_ALREADY_RESOLVED = 2002n;
const ERR_MULTI_INSUFFICIENT_LIQUIDITY = 2006n;
const ERR_MULTI_NOT_INITIALIZED = 2011n;
const ERR_MULTI_ALREADY_DEPOSITED = 2018n;
const ERR_MULTI_INSUFFICIENT_IDLE_LIQUIDITY = 2019n;

// Helper function to initialize market-pool for tests
function initializeMarketPool(caller: string, deadline: number, resDeadline: number) {
  // First give the caller some USDC via faucet
  simnet.callPublicFn('usdcx', 'faucet', [Cl.uint(INITIAL_LIQUIDITY)], caller);

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

// Helper function to initialize multi-outcome-pool for tests
function initializeMultiOutcomePool(caller: string, deadline: number, resDeadline: number) {
  // First give the caller some USDC via faucet
  simnet.callPublicFn('usdcx', 'faucet', [Cl.uint(INITIAL_LIQUIDITY)], caller);

  // Initialize the multi-outcome market
  return simnet.callPublicFn(
    'multi-outcome-pool',
    'initialize',
    [
      Cl.stringUtf8('Who will win the election?'),
      Cl.uint(deadline),
      Cl.uint(resDeadline),
      Cl.uint(INITIAL_LIQUIDITY),
      Cl.uint(3), // 3 outcomes
      Cl.uint(1000000), // LMSR b parameter
    ],
    caller
  );
}

describe('Deposit Idle Funds - Market Pool', () => {
  describe('deposit-idle-funds', () => {
    it('should deposit 90% of pool liquidity to yield source', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize market
      initializeMarketPool(deployer, deadline, resDeadline);

      // Check initial reserves
      const initialReserves = simnet.callReadOnlyFn(
        'market-pool',
        'get-reserves',
        [],
        deployer
      );

      // Deposit idle funds (only market creator can call)
      const depositResult = simnet.callPublicFn(
        'market-pool',
        'deposit-idle-funds',
        [],
        deployer
      );

      expect(depositResult.result).toBeOk(Cl.uint(900000000n)); // 90% of 1B = 900M

      // Check that deposited amount is tracked
      const deposited = simnet.callReadOnlyFn(
        'market-pool',
        'get-deposited-to-yield',
        [],
        deployer
      );
      expect(deposited.result).toBeOk(Cl.uint(900000000n));

      // Check that reserves are reduced
      const newReserves = simnet.callReadOnlyFn(
        'market-pool',
        'get-reserves',
        [],
        deployer
      );
    });

    it('should only allow market creator to deposit', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMarketPool(deployer, deadline, resDeadline);

      // Try to deposit from wallet1 (not the creator)
      const depositResult = simnet.callPublicFn(
        'market-pool',
        'deposit-idle-funds',
        [],
        wallet1
      );

      expect(depositResult.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject deposit if market is resolved', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMarketPool(deployer, deadline, resDeadline);

      // Resolve the market
      simnet.mineEmptyBlocks(11);
      simnet.callPublicFn('market-pool', 'resolve', [Cl.uint(0)], deployer);

      // Try to deposit after resolution
      const depositResult = simnet.callPublicFn(
        'market-pool',
        'deposit-idle-funds',
        [],
        deployer
      );

      expect(depositResult.result).toBeErr(Cl.uint(ERR_MARKET_ALREADY_RESOLVED));
    });

    it('should reject deposit if already deposited', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMarketPool(deployer, deadline, resDeadline);

      // First deposit
      simnet.callPublicFn('market-pool', 'deposit-idle-funds', [], deployer);

      // Try second deposit
      const secondDeposit = simnet.callPublicFn(
        'market-pool',
        'deposit-idle-funds',
        [],
        deployer
      );

      expect(secondDeposit.result).toBeErr(Cl.uint(ERR_ALREADY_DEPOSITED));
    });

    it('should reject deposit if market not initialized', () => {
      const depositResult = simnet.callPublicFn(
        'market-pool',
        'deposit-idle-funds',
        [],
        deployer
      );

      expect(depositResult.result).toBeErr(Cl.uint(ERR_NOT_INITIALIZED));
    });

    it('should show available liquidity after deposit', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMarketPool(deployer, deadline, resDeadline);

      // Deposit idle funds
      simnet.callPublicFn('market-pool', 'deposit-idle-funds', [], deployer);

      // Check available liquidity
      const available = simnet.callReadOnlyFn(
        'market-pool',
        'get-available-liquidity',
        [],
        deployer
      );

      // Total liquidity should be 100M (10% remaining in reserves)
      expect(available.result).toBeOk(
        Cl.tuple({
          'yes-reserve': Cl.uint(50000000n), // 50M (half of 100M)
          'no-reserve': Cl.uint(50000000n), // 50M (half of 100M)
          'deposited-to-yield': Cl.uint(900000000n), // 900M
          'total-available': Cl.uint(100000000n), // 100M
        })
      );
    });
  });

  describe('withdraw-yield-funds', () => {
    it('should withdraw deposited funds back to pool', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMarketPool(deployer, deadline, resDeadline);

      // Deposit idle funds first
      simnet.callPublicFn('market-pool', 'deposit-idle-funds', [], deployer);

      // Withdraw yield funds
      const withdrawResult = simnet.callPublicFn(
        'market-pool',
        'withdraw-yield-funds',
        [],
        deployer
      );

      expect(withdrawResult.result.type).toBe('ok');

      // Check that deposited amount is reset
      const deposited = simnet.callReadOnlyFn(
        'market-pool',
        'get-deposited-to-yield',
        [],
        deployer
      );
      expect(deposited.result).toBeOk(Cl.uint(0n));
    });

    it('should only allow market creator to withdraw', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMarketPool(deployer, deadline, resDeadline);

      // Deposit idle funds first
      simnet.callPublicFn('market-pool', 'deposit-idle-funds', [], deployer);

      // Try to withdraw from wallet1
      const withdrawResult = simnet.callPublicFn(
        'market-pool',
        'withdraw-yield-funds',
        [],
        wallet1
      );

      expect(withdrawResult.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject withdraw if no funds deposited', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMarketPool(deployer, deadline, resDeadline);

      // Try to withdraw without depositing
      const withdrawResult = simnet.callPublicFn(
        'market-pool',
        'withdraw-yield-funds',
        [],
        deployer
      );

      expect(withdrawResult.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_LIQUIDITY));
    });
  });
});

describe('Deposit Idle Funds - Multi-Outcome Pool', () => {
  describe('deposit-idle-funds', () => {
    it('should deposit 90% of pool liquidity to yield source', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      // Initialize multi-outcome market
      initializeMultiOutcomePool(deployer, deadline, resDeadline);

      // Deposit idle funds (only market creator can call)
      const depositResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'deposit-idle-funds',
        [],
        deployer
      );

      expect(depositResult.result).toBeOk(Cl.uint(900000000n)); // 90% of 1B = 900M

      // Check that deposited amount is tracked
      const deposited = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-deposited-to-yield',
        [],
        deployer
      );
      expect(deposited.result).toBeOk(Cl.uint(900000000n));
    });

    it('should only allow market creator to deposit', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMultiOutcomePool(deployer, deadline, resDeadline);

      // Try to deposit from wallet1 (not the creator)
      const depositResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'deposit-idle-funds',
        [],
        wallet1
      );

      expect(depositResult.result).toBeErr(Cl.uint(ERR_MULTI_NOT_AUTHORIZED));
    });

    it('should reject deposit if market is resolved', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 10;
      const resDeadline = deadline + 100;

      initializeMultiOutcomePool(deployer, deadline, resDeadline);

      // Resolve the market
      simnet.mineEmptyBlocks(11);
      simnet.callPublicFn('multi-outcome-pool', 'resolve', [Cl.uint(0)], deployer);

      // Try to deposit after resolution
      const depositResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'deposit-idle-funds',
        [],
        deployer
      );

      expect(depositResult.result).toBeErr(Cl.uint(ERR_MULTI_MARKET_ALREADY_RESOLVED));
    });

    it('should reject deposit if already deposited', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMultiOutcomePool(deployer, deadline, resDeadline);

      // First deposit
      simnet.callPublicFn('multi-outcome-pool', 'deposit-idle-funds', [], deployer);

      // Try second deposit
      const secondDeposit = simnet.callPublicFn(
        'multi-outcome-pool',
        'deposit-idle-funds',
        [],
        deployer
      );

      expect(secondDeposit.result).toBeErr(Cl.uint(ERR_MULTI_ALREADY_DEPOSITED));
    });

    it('should show available liquidity after deposit', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMultiOutcomePool(deployer, deadline, resDeadline);

      // Deposit idle funds
      simnet.callPublicFn('multi-outcome-pool', 'deposit-idle-funds', [], deployer);

      // Check available liquidity
      const available = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-available-liquidity',
        [],
        deployer
      );

      // Total liquidity = on-hand + deposited = 1000M (original total)
      // Deposited = 900M (90%)
      // Available = 100M (10% on-hand)
      expect(available.result).toBeOk(
        Cl.tuple({
          'total-liquidity': Cl.uint(1000000000n), // 1000M (original total)
          'deposited-to-yield': Cl.uint(900000000n), // 900M
          'available-liquidity': Cl.uint(100000000n), // 100M
        })
      );
    });
  });

  describe('withdraw-yield-funds', () => {
    it('should withdraw deposited funds back to pool', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMultiOutcomePool(deployer, deadline, resDeadline);

      // Deposit idle funds first
      simnet.callPublicFn('multi-outcome-pool', 'deposit-idle-funds', [], deployer);

      // Withdraw yield funds
      const withdrawResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'withdraw-yield-funds',
        [],
        deployer
      );

      expect(withdrawResult.result.type).toBe('ok');

      // Check that deposited amount is reset
      const deposited = simnet.callReadOnlyFn(
        'multi-outcome-pool',
        'get-deposited-to-yield',
        [],
        deployer
      );
      expect(deposited.result).toBeOk(Cl.uint(0n));
    });

    it('should only allow market creator to withdraw', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMultiOutcomePool(deployer, deadline, resDeadline);

      // Deposit idle funds first
      simnet.callPublicFn('multi-outcome-pool', 'deposit-idle-funds', [], deployer);

      // Try to withdraw from wallet1
      const withdrawResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'withdraw-yield-funds',
        [],
        wallet1
      );

      expect(withdrawResult.result).toBeErr(Cl.uint(ERR_MULTI_NOT_AUTHORIZED));
    });

    it('should reject withdraw if no funds deposited', () => {
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + 100;
      const resDeadline = deadline + 100;

      initializeMultiOutcomePool(deployer, deadline, resDeadline);

      // Try to withdraw without depositing
      const withdrawResult = simnet.callPublicFn(
        'multi-outcome-pool',
        'withdraw-yield-funds',
        [],
        deployer
      );

      expect(withdrawResult.result).toBeErr(Cl.uint(ERR_MULTI_INSUFFICIENT_LIQUIDITY));
    });
  });
});

describe('Integration: Full Yield Cycle', () => {
  it('should complete full cycle: deposit -> earn yield -> withdraw', () => {
    const currentBlock = simnet.blockHeight;
    const deadline = currentBlock + 100;
    const resDeadline = deadline + 100;

    // Initialize market
    initializeMarketPool(deployer, deadline, resDeadline);

    // Check initial state
    const initialDeposited = simnet.callReadOnlyFn(
      'market-pool',
      'get-deposited-to-yield',
      [],
      deployer
    );
    expect(initialDeposited.result).toBeOk(Cl.uint(0n));

    // Deposit idle funds
    const depositResult = simnet.callPublicFn(
      'market-pool',
      'deposit-idle-funds',
      [],
      deployer
    );
    expect(depositResult.result).toBeOk(Cl.uint(900000000n));

    // Check deposited amount
    const depositedAfter = simnet.callReadOnlyFn(
      'market-pool',
      'get-deposited-to-yield',
      [],
      deployer
    );
    expect(depositedAfter.result).toBeOk(Cl.uint(900000000n));

    // Check zUSDC balance in vault (contract should have shares)
    const vaultBalance = simnet.callReadOnlyFn(
      'mock-zest-vault',
      'get-balance',
      [Cl.standardPrincipal(simnet.deployer)],
      deployer
    );

    // Withdraw yield funds
    const withdrawResult = simnet.callPublicFn(
      'market-pool',
      'withdraw-yield-funds',
      [],
      deployer
    );
    expect(withdrawResult.result.type).toBe('ok');

    // Check that deposited amount is reset
    const depositedAfterWithdraw = simnet.callReadOnlyFn(
      'market-pool',
      'get-deposited-to-yield',
      [],
      deployer
    );
    expect(depositedAfterWithdraw.result).toBeOk(Cl.uint(0n));
  });
});
