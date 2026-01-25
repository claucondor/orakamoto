import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

const CONTRACT_NAME = 'multi-market-pool-v3';
const LP_TOKEN_CONTRACT = 'sip013-lp-token';
const USDCX_CONTRACT = 'usdcx';

function fundWallet(wallet: string, amount: bigint) {
  simnet.callPublicFn(USDCX_CONTRACT, 'faucet', [Cl.uint(amount)], wallet);
}

function createMarket(creator: string, initialLiquidity: bigint) {
  const currentBlock = simnet.blockHeight;
  const deadline = currentBlock + 100;
  const resolutionDeadline = deadline + 10;

  fundWallet(creator, initialLiquidity);

  const result = simnet.callPublicFn(
    CONTRACT_NAME,
    'create-market',
    [
      Cl.stringUtf8('Test Market'),
      Cl.uint(deadline),
      Cl.uint(resolutionDeadline),
      Cl.uint(initialLiquidity),
    ],
    creator
  );

  expect(result.result).toBeOk(Cl.uint(1));
  return { marketId: 1, deadline, resolutionDeadline, createdAt: currentBlock };
}

describe('Multi-Market Pool V3 - Liquidity Management', () => {
  beforeEach(() => {
    // Authorize LP token minter
    simnet.callPublicFn(
      LP_TOKEN_CONTRACT,
      'set-authorized-minter',
      [Cl.principal(`${deployer}.${CONTRACT_NAME}`)],
      deployer
    );
  });

  describe('add-liquidity', () => {
    it('should allow adding liquidity to an active market', () => {
      const { marketId } = createMarket(deployer, 10_000_000n);

      // Wallet1 adds liquidity
      fundWallet(wallet1, 5_000_000n);
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(5_000_000n));

      // Check LP token balance
      const lpBalance = simnet.callReadOnlyFn(
        LP_TOKEN_CONTRACT,
        'get-balance',
        [Cl.uint(marketId), Cl.principal(wallet1)],
        wallet1
      );
      expect(lpBalance.result).toBeOk(Cl.uint(5_000_000n));

      // Check market total liquidity increased
      const market = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      expect((market.result as any).value.value['total-liquidity'].value).toBe(15_000_000n);
    });

    it('should reject adding liquidity below minimum', () => {
      const { marketId } = createMarket(deployer, 10_000_000n);

      fundWallet(wallet1, 50_000n);
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(50_000n)], // Below 0.1 USDC minimum
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4006)); // ERR-INSUFFICIENT-LIQUIDITY
    });

    it('should reject adding liquidity to resolved market', () => {
      const { marketId, deadline } = createMarket(deployer, 10_000_000n);

      // Mine past deadline and resolve
      simnet.mineEmptyBlocks(deadline - simnet.blockHeight + 1);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      // Try to add liquidity
      fundWallet(wallet1, 5_000_000n);
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4002)); // ERR-MARKET-ALREADY-RESOLVED
    });
  });

  describe('remove-liquidity', () => {
    it('should allow removing liquidity before market resolves', () => {
      const { marketId } = createMarket(deployer, 10_000_000n);

      // Get initial LP balance
      const lpBalanceBefore = simnet.callReadOnlyFn(
        LP_TOKEN_CONTRACT,
        'get-balance',
        [Cl.uint(marketId), Cl.principal(deployer)],
        deployer
      );
      expect(lpBalanceBefore.result).toBeOk(Cl.uint(10_000_000n));

      // Remove half the liquidity
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        deployer
      );

      expect(result.result).toBeOk(Cl.uint(5_000_000n)); // Should return 5 USDC

      // Check LP tokens were burned
      const lpBalanceAfter = simnet.callReadOnlyFn(
        LP_TOKEN_CONTRACT,
        'get-balance',
        [Cl.uint(marketId), Cl.principal(deployer)],
        deployer
      );
      expect(lpBalanceAfter.result).toBeOk(Cl.uint(5_000_000n));

      // Check total liquidity decreased
      const market = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      expect((market.result as any).value.value['total-liquidity'].value).toBe(5_000_000n);
    });

    it('should return correct amount including fees when removing liquidity', () => {
      const { marketId } = createMarket(deployer, 10_000_000n);

      // Add more liquidity from wallet1
      fundWallet(wallet1, 5_000_000n);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      // Do some trades to generate fees
      fundWallet(wallet2, 1_000_000n);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
        wallet2
      );

      // Remove all liquidity
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );

      expect((result.result as any).type).toBe('ok');
      const returnedAmount = (result.result as any).value.value;

      // Should receive more than originally deposited due to fees
      expect(returnedAmount).toBeGreaterThanOrEqual(5_000_000n);
    });

    it('should allow removing liquidity after market resolves', () => {
      const { marketId, deadline } = createMarket(deployer, 10_000_000n);

      // Mine past deadline and resolve
      simnet.mineEmptyBlocks(deadline - simnet.blockHeight + 1);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)],
        deployer
      );

      // Wait for dispute window
      simnet.mineEmptyBlocks(6);

      // Remove liquidity
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        deployer
      );

      expect((result.result as any).type).toBe('ok');
    });

    it('should correctly handle multiple LPs removing liquidity proportionally', () => {
      const { marketId } = createMarket(deployer, 10_000_000n); // Deployer has 10 LP

      // Wallet1 adds 5 USDC
      fundWallet(wallet1, 5_000_000n);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );
      // Total liquidity now: 15 USDC
      // Deployer: 10 LP (66.67%)
      // Wallet1: 5 LP (33.33%)

      // Do some trades to generate fees
      fundWallet(wallet2, 2_000_000n);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(2_000_000n), Cl.uint(0)],
        wallet2
      );

      // Get contract balance before removals
      const contractBalanceBefore = simnet.callReadOnlyFn(
        USDCX_CONTRACT,
        'get-balance',
        [Cl.principal(`${deployer}.${CONTRACT_NAME}`)],
        deployer
      );

      // Deployer removes 5 LP tokens
      const deployerResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        deployer
      );
      expect((deployerResult.result as any).type).toBe('ok');

      // Wallet1 removes 2.5 LP tokens
      const wallet1Result = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(2_500_000n)],
        wallet1
      );
      expect((wallet1Result.result as any).type).toBe('ok');

      // Check remaining balances
      const deployerLPRemaining = simnet.callReadOnlyFn(
        LP_TOKEN_CONTRACT,
        'get-balance',
        [Cl.uint(marketId), Cl.principal(deployer)],
        deployer
      );
      expect(deployerLPRemaining.result).toBeOk(Cl.uint(5_000_000n));

      const wallet1LPRemaining = simnet.callReadOnlyFn(
        LP_TOKEN_CONTRACT,
        'get-balance',
        [Cl.uint(marketId), Cl.principal(wallet1)],
        wallet1
      );
      expect(wallet1LPRemaining.result).toBeOk(Cl.uint(2_500_000n));
    });

    it('should reject removing more LP tokens than owned', () => {
      const { marketId } = createMarket(deployer, 10_000_000n);

      // Try to remove more than available
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(20_000_000n)],
        deployer
      );

      expect((result.result as any).type).toBe('err');
    });

    it('should reject removing liquidity below minimum', () => {
      const { marketId } = createMarket(deployer, 10_000_000n);

      // Try to remove below minimum (0.1 USDC)
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(50_000n)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(4006)); // ERR-INSUFFICIENT-LIQUIDITY
    });

    it('should maintain correct reserves ratio when removing liquidity', () => {
      const { marketId } = createMarket(deployer, 10_000_000n);

      // Get initial reserves
      const marketBefore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      const yesReserveBefore = (marketBefore.result as any).value.value['yes-reserve'].value;
      const noReserveBefore = (marketBefore.result as any).value.value['no-reserve'].value;

      // Remove half the liquidity
      simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        deployer
      );

      // Get new reserves
      const marketAfter = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      const yesReserveAfter = (marketAfter.result as any).value.value['yes-reserve'].value;
      const noReserveAfter = (marketAfter.result as any).value.value['no-reserve'].value;

      // Reserves should be reduced by same proportion (50%)
      expect(Number(yesReserveAfter)).toBeCloseTo(Number(yesReserveBefore) / 2, -3);
      expect(Number(noReserveAfter)).toBeCloseTo(Number(noReserveBefore) / 2, -3);
    });
  });

  describe('Full Lifecycle Integration', () => {
    it('should handle complete market lifecycle with liquidity operations', () => {
      // 1. Create market
      const { marketId, deadline } = createMarket(deployer, 10_000_000n);

      // 2. Add liquidity from another LP
      fundWallet(wallet1, 10_000_000n);
      const addResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'add-liquidity',
        [Cl.uint(marketId), Cl.uint(10_000_000n)],
        wallet1
      );
      expect(addResult.result).toBeOk(Cl.uint(10_000_000n));

      // 3. Do some trading
      fundWallet(wallet2, 3_000_000n);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'buy-outcome',
        [Cl.uint(marketId), Cl.uint(0), Cl.uint(3_000_000n), Cl.uint(0)],
        wallet2
      );

      // 4. Remove some liquidity before resolution
      const removeBeforeResolve = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        wallet1
      );
      expect((removeBeforeResolve.result as any).type).toBe('ok');

      // 5. Resolve market
      simnet.mineEmptyBlocks(deadline - simnet.blockHeight + 1);
      simnet.callPublicFn(
        CONTRACT_NAME,
        'resolve',
        [Cl.uint(marketId), Cl.uint(0)], // YES wins
        deployer
      );

      // 6. Wait for dispute window
      simnet.mineEmptyBlocks(6);

      // 7. Winner claims
      simnet.callPublicFn(
        CONTRACT_NAME,
        'claim',
        [Cl.uint(marketId)],
        wallet2
      );

      // 8. Remaining LPs remove liquidity after resolution
      const removeAfterResolve = simnet.callPublicFn(
        CONTRACT_NAME,
        'remove-liquidity',
        [Cl.uint(marketId), Cl.uint(5_000_000n)],
        deployer
      );
      expect((removeAfterResolve.result as any).type).toBe('ok');

      // 9. Verify all accounting is correct
      const finalMarket = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );

      // Contract should still have enough USDC for remaining LP to withdraw
      const contractBalance = simnet.callReadOnlyFn(
        USDCX_CONTRACT,
        'get-balance',
        [Cl.principal(`${deployer}.${CONTRACT_NAME}`)],
        deployer
      );

      const totalLiquidity = (finalMarket.result as any).value.value['total-liquidity'].value;
      const reserves = (finalMarket.result as any).value.value['yes-reserve'].value +
                       (finalMarket.result as any).value.value['no-reserve'].value;

      // Contract balance should be >= reserves
      const balance = (contractBalance.result as any).value.value;
      expect(balance).toBeGreaterThanOrEqual(reserves);
    });
  });
});
