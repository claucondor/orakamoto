# Multi-Outcome Pool V2

**Location:** `contracts/multi-outcome-pool-v2.clar`

**Status:** In Development

## Overview

Multi-market pool for prediction markets with 2-10 outcomes. Uses LMSR (Logarithmic Market Scoring Rule) instead of pm-AMM.

## Why LMSR for Multi-Outcome?

| Aspect | pm-AMM | LMSR |
|--------|--------|------|
| Outcomes | Binary only | 2-N outcomes |
| Price sum | Always 1 | Always 1 |
| Liquidity | L parameter | b parameter |

LMSR naturally extends to N outcomes while maintaining probability conservation.

## LMSR Mathematics

### Cost Function

```
C(q) = b * ln(Σ e^(q_i/b))
```

Where:
- `q_i` = quantity of outcome i tokens
- `b` = liquidity parameter (higher = less slippage)

### Price Calculation

```
Price_i = e^(q_i/b) / Σ e^(q_j/b)
```

Prices always sum to 1 (probability conservation).

### Cost to Buy

```
Cost = C(q + Δq) - C(q)
```

Where Δq is the purchase vector.

## Implementation Notes

Since Clarity has no native `exp()` or `ln()`, we use Taylor series approximations:

```clarity
;; exp(x) ≈ 1 + x + x²/2! + x³/3! + x⁴/4! + x⁵/5!
(define-read-only (exp-approx (x uint)) ...)

;; ln(x) via series expansion for x near 1
(define-read-only (ln-approx (x uint)) ...)
```

## Data Structure

```clarity
(define-map markets uint {
  creator: principal,
  question: (string-utf8 256),
  outcome-count: uint,           ;; 2-10
  outcome-labels: (list 10 (string-utf8 32)),
  lmsr-b: uint,                  ;; Liquidity parameter
  total-liquidity: uint,
  is-resolved: bool,
  winning-outcome: (optional uint)
})

(define-map outcome-reserves
  { market-id: uint, outcome: uint }
  uint
)
```

## Key Constants

```clarity
MAX-OUTCOMES = u10
LMSR-B-PRECISION = u1000000
```

## Example Use Case

```
Question: "Who wins 2028 US Election?"
Outcomes: ["Trump", "DeSantis", "Newsom", "Harris", "Other"]
outcome-count: 5
```

## References

- [LMSR Paper](https://mason.gmu.edu/~rhanson/mktscore.pdf) by Robin Hanson
- [Gnosis LMSR Implementation](https://github.com/gnosis/pm-contracts)
