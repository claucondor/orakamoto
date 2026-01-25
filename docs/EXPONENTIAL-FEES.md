# Exponential Time-Based Fees

Multi-Market Pool V3 uses exponential fees to protect LPs from getting wrecked by informed traders right before resolution. Fees start at 3% and scale up to 20% as the market approaches its deadline.

## How It Works

The fee increases based on how much time has passed since the market was created:

```
progress = (current_block - created_at) / (deadline - created_at)
base_fee = 3%
fee = base_fee × multiplier (capped at 20%)
```

We use a **4-segment piecewise linear curve** to approximate exponential growth (cheaper than computing actual exponentials on-chain):

| Time Progress | Fee | Example (on 1 USDC) |
|--------------|-----|---------------------|
| 0-25%        | 3-4% | 0.03-0.04 USDC |
| 25-50%       | 4-6% | 0.04-0.06 USDC |
| 50-75%       | 6-11% | 0.06-0.11 USDC |
| 75-100%      | 11-20% | 0.11-0.20 USDC |

The curve is designed to match exponential scaling within <5% error while using only simple integer math.

## Constants

- `TRADING-FEE-BP`: u300 (3% base fee)
- `MAX-FEE-BP`: u2000 (20% cap)

## Implementation

The pool automatically applies these fees in `buy-outcome` and `sell-outcome`:

1. Get market's `created-at` and `deadline`
2. Calculate current progress
3. Apply the piecewise multiplier
4. Cap at 20% max
5. Distribute fees: 70% to LPs, 10% to creator, 20% to protocol

The `calculate-time-based-fee` function handles all this internally - traders just see the final fee deducted from their trade.

## Why This Matters

Without exponential fees, informed traders show up right before resolution and extract tons of value from LPs. Classic LVR problem.

With exponential fees:
- Early trading: Low fees (3%) encourage price discovery
- Late trading: High fees (up to 20%) make informed trading unprofitable
- LPs get 70% of all fees as compensation

The curve is calibrated so that by the time someone has inside info, the fees are high enough that trading isn't worth it.

## Example

Create a market:
```clarity
(contract-call? .multi-market-pool-v3 create-market
  "Will BTC reach $100k?"
  u2000 u3000 u10000000)
```

Buy YES tokens at different times:
- t=0%: Fee ~0.03 USDC on 1 USDC trade
- t=50%: Fee ~0.06 USDC
- t=100%: Fee ~0.20 USDC (capped)

## Testing

```bash
npm test -- tests/multi-market-pool-v3.test.ts
```

Tests cover fee calculations at different time points, cap verification, and integration with trading.

## Deployment

```bash
./scripts/deploy-pool-exponential-fees.sh
```

After deploying, set the authorized minter for the LP token contract.
