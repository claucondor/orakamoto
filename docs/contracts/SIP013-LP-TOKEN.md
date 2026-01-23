# SIP-013 LP Token

**Location:** `contracts/tokens/sip013-lp-token.clar`

## Overview

Semi-fungible token implementation for LP (Liquidity Provider) shares. Follows [SIP-013 Standard](https://github.com/stacksgov/sips/blob/main/sips/sip-013/sip-013-semi-fungible-token-standard.md).

## Why SIP-013?

| Aspect | SIP-010 (Fungible) | SIP-013 (Semi-Fungible) |
|--------|-------------------|-------------------------|
| Token types | 1 per contract | N per contract |
| For multi-market | Need N contracts | 1 contract, token-id = market-id |
| Transferable | Yes | Yes |
| DeFi composable | Yes | Yes |

## Token Structure

```
token-id = market-id
amount = LP shares for that market
```

Example:
- User has 1000 LP tokens for market #5
- Represented as: `(token-id: 5, amount: 1000)`

## Core Functions

### Implemented (SIP-013 Required)

```clarity
(get-balance (token-id uint) (who principal))
;; Returns LP balance for specific market

(get-overall-balance (who principal))
;; Returns total LP across all markets

(get-total-supply (token-id uint))
;; Total LP tokens for a market

(transfer (token-id uint) (amount uint) (sender principal) (recipient principal))
;; Transfer LP tokens between users

(transfer-memo (token-id uint) (amount uint) (sender principal) (recipient principal) (memo (buff 34)))
;; Transfer with memo
```

### Internal (Pool Only)

```clarity
(mint (token-id uint) (amount uint) (recipient principal))
;; Only callable by multi-market-pool
;; Called when adding liquidity

(burn (token-id uint) (amount uint) (owner principal))
;; Only callable by multi-market-pool
;; Called when removing liquidity
```

## Data Storage

```clarity
(define-map token-balances
  { token-id: uint, owner: principal }
  uint
)

(define-map token-supplies uint uint)
```

## Access Control

Only `multi-market-pool` can mint/burn:

```clarity
(define-constant AUTHORIZED-POOL .multi-market-pool)

(asserts! (is-eq contract-caller AUTHORIZED-POOL) ERR-NOT-AUTHORIZED)
```

## Events

```clarity
{ event: "sip013-transfer", token-id, amount, sender, recipient }
{ event: "sip013-mint", token-id, amount, recipient }
{ event: "sip013-burn", token-id, amount, owner }
```
