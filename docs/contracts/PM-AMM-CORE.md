# pm-AMM Core

**Location:** `contracts/lib/pm-amm-core.clar`

## Overview

Implementation of the Prediction Market AMM from [Paradigm Research](https://www.paradigm.xyz/2024/11/pm-amm). Optimized for binary prediction markets with uniform Loss-Versus-Rebalancing (LVR) across all price levels.

## The Problem with CPMM

Traditional Constant Product Market Makers (x * y = k) have non-uniform LVR:
- Near 50/50 prices: High LVR (bad for LPs)
- Near extreme prices: Low LVR

## pm-AMM Solution

Uses the normal distribution CDF (Φ) for pricing:

```
Price_YES = Φ((y - x) / L)
Price_NO = 1 - Price_YES
```

Where:
- `x` = YES reserve
- `y` = NO reserve
- `L` = Liquidity parameter
- `Φ` = Standard normal CDF

## Mathematical Implementation

### Normal CDF Approximation (Taylor Series)

Since Clarity has no native `exp()` or `erf()`, we use polynomial approximation:

```clarity
;; Phi(z) ≈ 0.5 * (1 + erf(z / sqrt(2)))
;; erf(x) approximated via Taylor series

(define-read-only (phi (z int))
  ;; Returns Φ(z) scaled by 10^8
  ;; Uses Horner's method for efficiency
  ...
)
```

### Key Functions

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `get-yes-price` | x, y, L | uint | YES token price (8 decimals) |
| `get-no-price` | x, y, L | uint | NO token price (8 decimals) |
| `calculate-swap-out` | amount, x, y, L, buy-yes | uint | Tokens received for input |

## Constants

```clarity
PRECISION = u100000000  ;; 8 decimals for prices
SQRT_2 = u141421356     ;; √2 * 10^8
```

## Price Bounds

- Minimum price: ~0.01 (1%)
- Maximum price: ~0.99 (99%)
- Prices always sum to 1.0

## References

- [Paradigm pm-AMM Paper](https://www.paradigm.xyz/2024/11/pm-amm)
- [Normal Distribution CDF](https://en.wikipedia.org/wiki/Normal_distribution)
