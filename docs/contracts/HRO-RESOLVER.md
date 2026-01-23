# HRO Resolver

**Location:** `contracts/hro-resolver.clar`

## Overview

Hybrid Reputation Oracle - implements bond escalation for dispute resolution, inspired by [Reality.eth](https://reality.eth.link/).

## Bond Escalation Mechanism

When someone disputes a resolution:

```
Round 1: Challenger posts bond B
Round 2: Defender posts 2B
Round 3: Challenger posts 4B
Round 4: Defender posts 8B
...continues until threshold or timeout
```

### Escalation Formula

```
Bond_n = B₀ * 2^n
```

Where:
- `B₀` = Initial bond (MINIMUM-DISPUTE-BOND)
- `n` = Round number

## Resolution Layers

```
┌─────────────────────────────────────────┐
│ Layer 1: Creator Resolution             │
│ - Creator resolves after deadline       │
│ - 7-day dispute window                  │
└─────────────────────────────────────────┘
          ↓ (if disputed)
┌─────────────────────────────────────────┐
│ Layer 2: Bond Escalation (HRO)          │
│ - Challenger posts bond                 │
│ - Each round doubles                    │
│ - Timeout = defender wins               │
└─────────────────────────────────────────┘
          ↓ (if threshold reached)
┌─────────────────────────────────────────┐
│ Layer 3: AI Advisory (Optional)         │
│ - AI models provide recommendations     │
│ - Non-binding, informational only       │
└─────────────────────────────────────────┘
          ↓ (if escalates further)
┌─────────────────────────────────────────┐
│ Layer 4: Quadratic Voting               │
│ - Reputation-weighted voting            │
│ - vePRED holders vote                   │
└─────────────────────────────────────────┘
          ↓ (if >10% supply disputes)
┌─────────────────────────────────────────┐
│ Layer 5: Fork (Nuclear Option)          │
│ - Market splits into two versions       │
│ - Users choose which fork to follow     │
└─────────────────────────────────────────┘
```

## Key Constants

```clarity
MINIMUM-DISPUTE-BOND = u50000000    ;; 50 USDC
ESCALATION-THRESHOLD = u5120000000  ;; 51,200 USDC
BOND-MULTIPLIER = u2                ;; 2x each round
RESPONSE-TIMEOUT = u1008            ;; ~7 days
```

## Game Theory

The doubling bond creates strong incentives:
- **Truth-tellers:** Willing to escalate because they'll win
- **Liars:** Eventually priced out (exponential cost)
- **Equilibrium:** Truth wins at minimal cost

## Functions

```clarity
(open-dispute (market-id uint) (proposed-outcome uint))
;; Start dispute with initial bond

(escalate-dispute (market-id uint))
;; Post 2x bond to counter

(finalize-dispute (market-id uint))
;; After timeout, last poster wins
```

## References

- [Reality.eth Whitepaper](https://reality.eth.link/app/docs/html/whitepaper.html)
- [Augur v2 Dispute System](https://docs.augur.net/)
