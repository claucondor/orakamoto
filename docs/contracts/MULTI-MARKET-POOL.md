# Multi-Market Pool

**Location:** `contracts/multi-market-pool.clar`

## Overview

Single vault, multi-market pool for binary prediction markets. Inspired by [ALEX Trading Pool](https://alexlab.co) architecture.

## Architecture

```
┌─────────────────────────────────────────────┐
│           MULTI-MARKET-POOL                 │
├─────────────────────────────────────────────┤
│  markets: Map<market-id, MarketData>        │
│  outcome-balances: Map<(id,owner,outcome)>  │
│  has-claimed: Map<(id,owner), bool>         │
├─────────────────────────────────────────────┤
│  SINGLE VAULT (USDCx)                       │
│  LP TOKENS: SIP-013 (token-id = market-id)  │
└─────────────────────────────────────────────┘
```

## Market Data Structure

```clarity
{
  creator: principal,
  question: (string-utf8 256),
  deadline: uint,              ;; Trading ends
  resolution-deadline: uint,   ;; Must resolve by
  yes-reserve: uint,           ;; YES token reserve
  no-reserve: uint,            ;; NO token reserve
  total-liquidity: uint,       ;; Total LP tokens
  accumulated-fees: uint,      ;; Fees collected
  is-resolved: bool,
  winning-outcome: (optional uint),  ;; 0=YES, 1=NO
  resolution-block: uint,
  liquidity-parameter: uint    ;; L for pm-AMM
}
```

## Fee Structure

| Recipient | Share | Description |
|-----------|-------|-------------|
| LPs | 70% | Withdrawn with liquidity |
| Creator | 10% | Incentive to create markets |
| Protocol | 20% | Treasury |

**Total Fee:** 1% (100 basis points)

## Core Functions

### Trading

```clarity
(buy-outcome (market-id uint) (outcome uint) (amount uint) (min-tokens-out uint))
;; Buy YES (0) or NO (1) tokens
;; Slippage protection via min-tokens-out

(sell-outcome (market-id uint) (outcome uint) (token-amount uint) (min-usdc-out uint))
;; Sell outcome tokens back to pool
```

### Liquidity

```clarity
(add-liquidity (market-id uint) (amount uint))
;; Add USDCx, receive LP tokens (SIP-013)
;; Split 50/50 between YES/NO reserves

(remove-liquidity (market-id uint) (lp-amount uint))
;; Burn LP tokens, receive USDCx + fee share
```

### Lifecycle

```clarity
(create-market (question) (deadline) (resolution-deadline) (initial-liquidity))
;; Creates new market, returns market-id

(resolve (market-id uint) (outcome uint))
;; Creator sets winning outcome after deadline

(claim (market-id uint))
;; Winners claim 1:1 after dispute window
```

## Pricing

Uses [pm-AMM Core](./PM-AMM-CORE.md) for price calculations:

```
YES Price = Φ((no-reserve - yes-reserve) / L)
NO Price = 1 - YES Price
```

## Key Constants

```clarity
PRECISION = u1000000           ;; 6 decimals
TRADING-FEE-BP = u100          ;; 1%
DISPUTE-WINDOW = u1008         ;; ~7 days
MINIMUM-INITIAL-LIQUIDITY = u1000000  ;; 1 USDC
```

## Events

All state changes emit events via `(print {...})`:
- `market-created`
- `liquidity-added` / `liquidity-removed`
- `outcome-bought` / `outcome-sold`
- `market-resolved`
- `winnings-claimed`
