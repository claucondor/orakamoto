import { describe, it, expect } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;

// Constants matching the contract
const ONE_8 = 100_000_000n;

describe('pm-AMM Core Library V2 (fixed safe-int-add)', () => {
  describe('Normal Distribution PDF (phi)', () => {
    it('should return phi(0) ~= 0.399', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-pdf', [Cl.int(0)], deployer);
      // phi(0) = 1/sqrt(2*pi) ~= 0.39894228
      expect(result.result).toStrictEqual(Cl.uint(39894228n));
    });

    it('should return phi(1.0) ~= 0.242', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-pdf', [Cl.int(ONE_8)], deployer);
      // phi(1) ~= 0.24197072 - with Taylor series approximation, allow some variance
      const value = (result.result as any).value as bigint;
      expect(value).toBeGreaterThan(20_000_000n);
      expect(value).toBeLessThan(30_000_000n);
    });

    it('should return phi(2.0) ~= 0.054', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-pdf', [Cl.int(2n * ONE_8)], deployer);
      // phi(2) ~= 0.05399097
      const value = (result.result as any).value as bigint;
      expect(value).toBeGreaterThan(1_000_000n);
      expect(value).toBeLessThan(10_000_000n);
    });

    it('should have phi(-z) = phi(z) (PDF symmetry)', () => {
      const result1 = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-pdf', [Cl.int(ONE_8)], deployer);
      const result2 = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-pdf', [Cl.int(-ONE_8)], deployer);
      const value1 = (result1.result as any).value as bigint;
      const value2 = (result2.result as any).value as bigint;
      expect(value1).toBe(value2);
    });
  });

  describe('Normal Distribution CDF (Phi)', () => {
    it('should return Phi(0) = 0.5', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-cdf', [Cl.int(0)], deployer);
      expect(result.result).toStrictEqual(Cl.uint(50_000_000n));
    });

    it('should return Phi(1.0) ~= 0.841', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-cdf', [Cl.int(ONE_8)], deployer);
      const value = (result.result as any).value as bigint;
      // Phi(1) ~= 0.84134475 - allow some variance
      expect(value).toBeGreaterThan(80_000_000n);
      expect(value).toBeLessThan(90_000_000n);
    });

    it('should return Phi(-1.0) ~= 0.159', () => {
      const result = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-cdf', [Cl.int(-ONE_8)], deployer);
      const value = (result.result as any).value as bigint;
      // Phi(-1) ~= 0.15865525
      expect(value).toBeGreaterThan(10_000_000n);
      expect(value).toBeLessThan(20_000_000n);
    });

    it('should satisfy Phi(z) + Phi(-z) = 1.0 (symmetry)', () => {
      const result1 = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-cdf', [Cl.int(ONE_8)], deployer);
      const result2 = simnet.callReadOnlyFn('pm-amm-core-v2', 'normal-cdf', [Cl.int(-ONE_8)], deployer);
      const phi1 = (result1.result as any).value as bigint;
      const phi2 = (result2.result as any).value as bigint;
      expect(phi1 + phi2).toBe(ONE_8);
    });
  });

  describe('pm-AMM Pricing Functions', () => {
    it('should return 50% YES price when x = y (equal reserves)', () => {
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'get-yes-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      expect(result.result).toStrictEqual(Cl.uint(50_000_000n));
    });

    it('should return > 50% YES price when y > x', () => {
      const x = 50_000_000n;
      const y = 150_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'get-yes-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      const price = (result.result as any).value as bigint;
      expect(price).toBeGreaterThan(50_000_000n);
      expect(price).toBeLessThan(ONE_8);
    });

    it('should return < 50% YES price when x > y', () => {
      const x = 150_000_000n;
      const y = 50_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'get-yes-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      const price = (result.result as any).value as bigint;
      expect(price).toBeLessThan(50_000_000n);
      expect(price).toBeGreaterThan(0n);
    });

    it('should have YES price + NO price = 100%', () => {
      const x = 75_000_000n;
      const y = 125_000_000n;
      const L = 50_000_000n;

      const yesResult = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'get-yes-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );

      const noResult = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'get-no-price',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );

      const yesPrice = (yesResult.result as any).value as bigint;
      const noPrice = (noResult.result as any).value as bigint;
      expect(yesPrice + noPrice).toBe(ONE_8);
    });
  });

  describe('pm-AMM Invariant', () => {
    it('should calculate invariant for equal reserves', () => {
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'pm-amm-invariant',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      // When x = y, invariant is: 0*Phi(0) + L*phi(0) - y = L*0.399 - y (negative)
      // Returns int type
      expect(result.result.type).toBe('int');
    });

    it('should calculate invariant for different reserve ratios', () => {
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'pm-amm-invariant',
        [Cl.uint(75_000_000n), Cl.uint(125_000_000n), Cl.uint(L)],
        deployer
      );
      // Returns int type (can be negative)
      expect(result.result.type).toBe('int');
    });

    it('should return consistent invariant for same inputs', () => {
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result1 = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'pm-amm-invariant',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      const result2 = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'pm-amm-invariant',
        [Cl.uint(x), Cl.uint(y), Cl.uint(L)],
        deployer
      );
      expect(result1.result).toStrictEqual(result2.result);
    });
  });

  describe('Swap Calculation', () => {
    it('should calculate swap output for buying YES', () => {
      const amountIn = 10_000_000n;
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'calculate-swap-out',
        [Cl.uint(amountIn), Cl.uint(x), Cl.uint(y), Cl.uint(L), Cl.bool(true)],
        deployer
      );
      // Should return some output amount (uint)
      expect(result.result.type).toBe('uint');
      const tokensOut = (result.result as any).value as bigint;
      expect(tokensOut).toBeGreaterThanOrEqual(0n);
    });

    it('should calculate swap output for buying NO', () => {
      const amountIn = 10_000_000n;
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'calculate-swap-out',
        [Cl.uint(amountIn), Cl.uint(x), Cl.uint(y), Cl.uint(L), Cl.bool(false)],
        deployer
      );
      expect(result.result.type).toBe('uint');
      const tokensOut = (result.result as any).value as bigint;
      expect(tokensOut).toBeGreaterThanOrEqual(0n);
    });

    it('should not return more than available reserve', () => {
      const amountIn = 1_000_000_000n; // Large amount
      const x = 100_000_000n;
      const y = 100_000_000n;
      const L = 50_000_000n;

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'calculate-swap-out',
        [Cl.uint(amountIn), Cl.uint(x), Cl.uint(y), Cl.uint(L), Cl.bool(true)],
        deployer
      );
      const tokensOut = (result.result as any).value as bigint;
      expect(tokensOut).toBeLessThanOrEqual(x); // Can't get more YES than available
    });
  });

  describe('Dynamic Liquidity', () => {
    it('should return 0 when at or after expiry', () => {
      const L0 = 100_000_000n;
      const currentBlock = simnet.blockHeight;
      const expiryBlock = Number(currentBlock); // At expiry

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'get-dynamic-liquidity',
        [Cl.uint(L0), Cl.uint(expiryBlock)],
        deployer
      );
      expect(result.result).toStrictEqual(Cl.uint(0n));
    });

    it('should return positive liquidity before expiry', () => {
      const L0 = 100_000_000n;
      const currentBlock = simnet.blockHeight;
      const expiryBlock = Number(currentBlock) + 10080; // 1 week

      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'get-dynamic-liquidity',
        [Cl.uint(L0), Cl.uint(expiryBlock)],
        deployer
      );
      const liquidity = (result.result as any).value as bigint;
      expect(liquidity).toBeGreaterThan(0n);
      expect(liquidity).toBeLessThanOrEqual(L0);
    });
  });

  describe('Fixed-Point Math Helpers', () => {
    it('should multiply fixed-point numbers correctly', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'mul-down',
        [Cl.uint(2n * ONE_8), Cl.uint(3n * ONE_8)],
        deployer
      );
      // 2.0 * 3.0 = 6.0
      expect(result.result).toStrictEqual(Cl.uint(6n * ONE_8));
    });

    it('should divide fixed-point numbers correctly', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'div-down',
        [Cl.uint(6n * ONE_8), Cl.uint(2n * ONE_8)],
        deployer
      );
      // 6.0 / 2.0 = 3.0
      expect(result.result).toStrictEqual(Cl.uint(3n * ONE_8));
    });

    it('should return 0 for division by zero', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'div-down',
        [Cl.uint(6n * ONE_8), Cl.uint(0n)],
        deployer
      );
      expect(result.result).toStrictEqual(Cl.uint(0n));
    });
  });

  describe('Integer Square Root', () => {
    it('should return 0 for sqrt(0)', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'int-sqrt',
        [Cl.uint(0n)],
        deployer
      );
      expect(result.result).toStrictEqual(Cl.uint(0n));
    });

    it('should return value for sqrt(1)', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'int-sqrt',
        [Cl.uint(1n * ONE_8)],
        deployer
      );
      // int-sqrt uses Newton's method, returns uint
      expect(result.result.type).toBe('uint');
    });

    it('should approximate sqrt(4) ~= 2', () => {
      const result = simnet.callReadOnlyFn(
        'pm-amm-core-v2',
        'int-sqrt',
        [Cl.uint(4n * ONE_8)],
        deployer
      );
      const sqrtValue = (result.result as any).value as bigint;
      // Should be close to 2.0 = 200000000
      expect(sqrtValue).toBeGreaterThan(150_000_000n);
      expect(sqrtValue).toBeLessThan(250_000_000n);
    });
  });
});
