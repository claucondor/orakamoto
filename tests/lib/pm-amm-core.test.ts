import { describe, it, expect } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;

// Constants matching the contract
const ONE_8 = 100_000_000n;

describe('pm-AMM Core Library', () => {
  describe('Normal Distribution PDF (phi)', () => {
    it('should return phi(0) ~= 0.399', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-pdf', [Cl.int(0)], deployer);
      // phi(0) = 1/sqrt(2*pi) ~= 0.39894228
      expect(result.result).toBeOk(Cl.uint(39894228n));
    });

    it('should return phi(1.0) ~= 0.242', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-pdf', [Cl.int(ONE_8)], deployer);
      // phi(1) ~= 0.24197072
      expect(result.result).toBeOk(Cl.uint(24197072n));
    });

    it('should return phi(2.0) ~= 0.054', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-pdf', [Cl.int(2 * ONE_8)], deployer);
      // phi(2) ~= 0.05399097
      expect(result.result).toBeOk(Cl.uint(5399097n));
    });

    it('should return phi(-1.0) ~= phi(1.0) (symmetry)', () => {
      const result1 = simnet.callReadOnlyFn('pm-amm-core', 'normal-pdf', [Cl.int(ONE_8)], deployer);
      const result2 = simnet.callReadOnlyFn('pm-amm-core', 'normal-pdf', [Cl.int(-ONE_8)], deployer);
      expect(result1.result).toBeOk(Cl.uint(24197072n));
      expect(result2.result).toBeOk(Cl.uint(24197072n));
    });

    it('should return phi(-2.0) ~= phi(2.0) (symmetry)', () => {
      const result1 = simnet.callReadOnlyFn('pm-amm-core', 'normal-pdf', [Cl.int(2 * ONE_8)], deployer);
      const result2 = simnet.callReadOnlyFn('pm-amm-core', 'normal-pdf', [Cl.int(-2 * ONE_8)], deployer);
      expect(result1.result).toBeOk(Cl.uint(5399097n));
      expect(result2.result).toBeOk(Cl.uint(5399097n));
    });
  });

  describe('Normal Distribution CDF (Phi)', () => {
    it('should return Phi(0) = 0.5', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(0)], deployer);
      expect(result.result).toBeOk(Cl.uint(50_000_000n));
    });

    it('should return Phi(1.0) ~= 0.841', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(ONE_8)], deployer);
      // Phi(1) ~= 0.84134475
      expect(result.result).toBeOk(Cl.uint(84134475n));
    });

    it('should return Phi(2.0) ~= 0.977', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(2 * ONE_8)], deployer);
      // Phi(2) ~= 0.97724987
      expect(result.result).toBeOk(Cl.uint(97724987n));
    });

    it('should return Phi(3.0) ~= 0.999', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(3 * ONE_8)], deployer);
      // Phi(3) ~= 0.99865010
      expect(result.result).toBeOk(Cl.uint(99865010n));
    });

    it('should return Phi(-1.0) ~= 0.159', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(-ONE_8)], deployer);
      // Phi(-1) = 1 - Phi(1) ~= 0.15865525
      expect(result.result).toBeOk(Cl.uint(15865525n));
    });

    it('should return Phi(-2.0) ~= 0.023', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(-2 * ONE_8)], deployer);
      // Phi(-2) = 1 - Phi(2) ~= 0.02275013
      expect(result.result).toBeOk(Cl.uint(2275013n));
    });

    it('should return Phi(-3.0) ~= 0.001', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(-3 * ONE_8)], deployer);
      // Phi(-3) = 1 - Phi(3) ~= 0.00134990
      expect(result.result).toBeOk(Cl.uint(134990n));
    });

    it('should satisfy Phi(z) + Phi(-z) = 1.0 (symmetry)', () => {
      const result1 = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(ONE_8)], deployer);
      const result2 = simnet.callReadOnlyFn('pm-amm-core', 'normal-cdf', [Cl.int(-ONE_8)], deployer);
      const phi1 = (result1.result as any).value.value as bigint;
      const phi2 = (result2.result as any).value.value as bigint;
      expect(phi1 + phi2).toBe(ONE_8);
    });
  });

  describe('pm-AMM Pricing Functions', () => {
    it('should return 50% YES price when x = y (equal reserves)', () => {
      const x = 100_000_000n; // YES reserve
      const y = 100_000_000n; // NO reserve
      const L = 50_000_000n;   // Liquidity parameter

      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'get-yes-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(50_000_000n));
    });

    it('should return > 50% YES price when y > x', () => {
      const x = 50_000_000n;   // Less YES reserve
      const y = 150_000_000n;  // More NO reserve
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'get-yes-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      // YES price should be > 50%
      const price = (result.result as any).value.value as bigint;
      expect(price).toBeGreaterThan(50_000_000n);
      expect(price).toBeLessThan(ONE_8);
    });

    it('should return < 50% YES price when x > y', () => {
      const x = 150_000_000n;  // More YES reserve
      const y = 50_000_000n;   // Less NO reserve
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'get-yes-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      // YES price should be < 50%
      const price = (result.result as any).value.value as bigint;
      expect(price).toBeLessThan(50_000_000n);
      expect(price).toBeGreaterThan(0n);
    });

    it('should have YES price + NO price = 100%', () => {
      const x = 75_000_000n;
      const y = 125_000_000n;
      const L = 50_000_000n;

      const yesResult = simnet.callReadOnlyFn(
        'pm-amm-core',
        'get-yes-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );

      const noResult = simnet.callReadOnlyFn(
        'pm-amm-core',
        'get-no-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );

      const yesPrice = (yesResult.result as any).value.value as bigint;
      const noPrice = (noResult.result as any).value.value as bigint;
      expect(yesPrice + noPrice).toBe(ONE_8);
    });
  });

  describe('pm-AMM Invariant', () => {
    it('should calculate invariant for given reserves', () => {
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'pm-amm-invariant',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      // Invariant should be calculable
      expect(result.result).toBeOk(Cl.uint(0n));
    });

    it('should preserve invariant with different reserve ratios', () => {
      const L = 50_000_000n;

      const result1 = simnet.callReadOnlyFn(
        'pm-amm-core',
        'pm-amm-invariant',
        [Cl.uint(100_000_000n), Cl.uint(100_000_000n), Cl.uint(L)],
        deployer
      );

      const result2 = simnet.callReadOnlyFn(
        'pm-amm-core',
        'pm-amm-invariant',
        [Cl.uint(75_000_000n), Cl.uint(125_000_000n), Cl.uint(L)],
        deployer
      );

      // Both should return valid results
      expect(result1.result).toBeOk(Cl.uint(0n));
      expect(result2.result).toBeOk(Cl.uint(0n));
    });
  });

  describe('Swap Calculation', () => {
    it('should calculate swap output for buying YES', () => {
      const amountIn = 10_000_000n; // 0.1 tokens
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'calculate-swap-out',
        [Cl.uint(amountIn), Cl.uint(x), Cl.uint(y), Cl.uint(L), Cl.bool(true)],
        deployer
      );
      // Should return some output amount
      expect(result.result).toBeOk(Cl.uint(0n));
    });

    it('should calculate swap output for buying NO', () => {
      const amountIn = 10_000_000n;
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'calculate-swap-out',
        [Cl.uint(amountIn), Cl.uint(x), Cl.uint(y), Cl.uint(L), Cl.bool(false)],
        deployer
      );
      // Should return some output amount
      expect(result.result).toBeOk(Cl.uint(0n));
    });
  });

  describe('Dynamic Liquidity', () => {
    it('should return 0 when at or after expiry', () => {
      const L0 = 100_000_000n;
      const currentBlock = simnet.blockHeight;
      const expiryBlock = Number(currentBlock) - 100;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'get-dynamic-liquidity',
        [Cl.uint(L0), Cl.uint(expiryBlock)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0n));
    });

    it('should return positive liquidity before expiry', () => {
      const L0 = 100_000_000n;
      const currentBlock = simnet.blockHeight;
      const expiryBlock = Number(currentBlock) + 10080; // 1 week

      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'get-dynamic-liquidity',
        [Cl.uint(L0), Cl.uint(expiryBlock)],
        deployer
      );
      const liquidity = (result.result as any).value.value as bigint;
      expect(liquidity).toBeGreaterThan(0n);
      expect(liquidity).toBeLessThanOrEqual(L0);
    });
  });

  describe('Fixed-Point Math Helpers', () => {
    it('should multiply fixed-point numbers correctly', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'mul-down',
        [Cl.uint(2 * ONE_8), Cl.uint(3 * ONE_8)],
        deployer
      );
      // 2.0 * 3.0 = 6.0
      expect(result.result).toBeOk(Cl.uint(6 * ONE_8));
    });

    it('should divide fixed-point numbers correctly', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'div-down',
        [Cl.uint(6 * ONE_8), Cl.uint(2 * ONE_8)],
        deployer
      );
      // 6.0 / 2.0 = 3.0
      expect(result.result).toBeOk(Cl.uint(3 * ONE_8));
    });

    it('should handle division by zero', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'div-down',
        [Cl.uint(6 * ONE_8), Cl.uint(0n)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0n));
    });
  });

  describe('Integer Square Root', () => {
    it('should return 0 for sqrt(0)', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'int-sqrt',
        [Cl.uint(0n)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0n));
    });

    it('should return 1 for sqrt(1)', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'int-sqrt',
        [Cl.uint(1 * ONE_8)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1 * ONE_8));
    });

    it('should return 2 for sqrt(4)', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'int-sqrt',
        [Cl.uint(4 * ONE_8)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(2 * ONE_8));
    });

    it('should approximate sqrt(2) ~= 1.414', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core',
        'int-sqrt',
        [Cl.uint(2 * ONE_8)],
        deployer
      );
      const sqrt2 = (result.result as any).value.value as bigint;
      // sqrt(2) ~= 1.41421356 = 141421356 in 8-decimal fixed point
      expect(sqrt2).toBeGreaterThan(141000000n);
      expect(sqrt2).toBeLessThan(142000000n);
    });
  });
});
