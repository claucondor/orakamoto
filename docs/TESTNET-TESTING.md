# Phase 0 Testnet Testing Guide

Manual testing guide for StacksPredict Phase 0 on Stacks Testnet.

---

## Contract Addresses

| Contract | Address |
|----------|---------|
| `sip013-lp-token` | `ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.sip013-lp-token` |
| `multi-market-pool-v3` | `ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3` |
| `pm-amm-core` | `ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.pm-amm-core` |
| `math-fixed-point` | `ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.math-fixed-point` |
| `USDCx` | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx` |

**Deployer:** `ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC`

---

## Prerequisites

Before testing, ensure you have:

1. **STX for gas fees** (~0.1 STX per transaction)
2. **USDCx tokens** for liquidity and trading
3. **Hiro Wallet** connected to testnet

### Check Your USDCx Balance

```clarity
(contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx get-balance tx-sender)
```

---

## Test Amounts Reference

| Amount | USDCx Value | Use Case |
|--------|-------------|----------|
| `u1000000` | 1 USDC | Create market (minimum) |
| `u500000` | 0.5 USDC | Add liquidity |
| `u100000` | 0.1 USDC | Buy/sell tokens (minimum) |
| `u200000` | 0.2 USDC | Small trades |

## Block Height Reference (HACKATHON MODE)

**Current block:** ~3,742,949 (January 2026)

| Blocks | Approx. Time | Use Case |
|--------|--------------|----------|
| +5 | ~45 min | **Hackathon: Quick test** |
| +10 | ~1.5 hours | **Hackathon: Resolution test** |
| +20 | ~3 hours | **Hackathon: Full cycle** |
| +100 | ~17 hours | Short-term market |

**Para el hackathon usa deadlines de +5 a +20 blocks!**

```bash
# Get current block height
curl -s "https://api.testnet.hiro.so/extended/v2/blocks?limit=1" | jq '.results[0].height'
```

## Wallet Balances (Testnet)

| Wallet | Address | USDCx |
|--------|---------|-------|
| Deployer | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC | 5 USDC |
| Wallet 2 | ST23FF3CP9D662CJ5PG2TH8NJNAQ2Y0R002BF7QAK | 10 USDC |
| Wallet 3 | ST14NQ2NWE26YVB4YR9Y82AY03KG00RTNSJNYHMW7 | 10 USDC |

**Token USDCx:** `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx::usdcx-token`

---

## Post-Deployment Setup

### Test 0.1: Authorize LP Token Minter

**Required before any market operations.**

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.sip013-lp-token
  set-authorized-minter
  'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3)
```

**Expected:** `(ok true)`

**Only the deployer can execute this.**

---

## Test Suite 1: Market Creation

### Test 1.1: Create Market with Minimum Liquidity (1 USDC)

**Current block height:** ~3,742,949 (check with `block-height` in console)

**HACKATHON: Usa deadlines cortos (+10 y +20 blocks)**

```clarity
;; Primero obtén el block-height actual, luego suma +10 y +20
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  create-market
  u"Will BTC reach $150k by end of 2026?"
  u3742960   ;; deadline: current + 10 blocks (~1 hora)
  u3742980   ;; resolution-deadline: current + 30 blocks (~2-3 horas)
  u1000000)  ;; 1 USDC initial liquidity
```

**Expected:** `(ok u1)` (returns market-id)

**Verify:**
```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3 get-market u1)
```

### Test 1.2: Create Market with 2 USDC Liquidity

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  create-market
  u"Will ETH flip BTC market cap in 2026?"
  u3742960   ;; ajusta según block-height actual
  u3742980
  u2000000)  ;; 2 USDC
```

**Expected:** `(ok u2)`

### Test 1.3: Fail - Insufficient Liquidity (0.5 USDC)

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  create-market
  u"Test market"
  u3745000
  u3750000
  u500000)  ;; 0.5 USDC - below minimum
```

**Expected:** `(err u4006)` (ERR-INSUFFICIENT-LIQUIDITY)

### Test 1.4: Fail - Empty Question

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  create-market
  u""
  u3745000
  u3750000
  u1000000)
```

**Expected:** `(err u4012)` (ERR-INVALID-QUESTION)

---

## Test Suite 2: Liquidity Operations

### Test 2.1: Add Liquidity (0.5 USDC)

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  add-liquidity
  u1           ;; market-id
  u500000)     ;; 0.5 USDC
```

**Expected:** `(ok <lp-tokens>)` (returns LP tokens minted)

**Verify LP Balance:**
```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-lp-balance u1 tx-sender)
```

### Test 2.2: Add Liquidity from Different Wallet

Use a second wallet to add liquidity and verify LP tokens are minted correctly.

```clarity
;; From wallet 2
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  add-liquidity
  u1
  u500000)
```

### Test 2.3: Remove Liquidity (0.1 USDC worth)

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  remove-liquidity
  u1           ;; market-id
  u100000)     ;; LP tokens to burn (minimum 0.1 USDC)
```

**Expected:** `(ok <usdc-returned>)`

### Test 2.4: Fail - Below Minimum Liquidity

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  add-liquidity
  u1
  u50000)  ;; 0.05 USDC - below minimum
```

**Expected:** `(err u4006)` (ERR-INSUFFICIENT-LIQUIDITY)

---

## Test Suite 3: Trading (Buy/Sell)

### Test 3.1: Buy YES Tokens (0.1 USDC)

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  buy-outcome
  u1           ;; market-id
  u0           ;; outcome: 0 = YES
  u100000      ;; 0.1 USDC
  u1)          ;; min-tokens-out (set low for testing)
```

**Expected:** `(ok <tokens-received>)`

**Verify Balance:**
```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-outcome-balance u1 tx-sender u0)
```

### Test 3.2: Buy NO Tokens (0.1 USDC)

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  buy-outcome
  u1           ;; market-id
  u1           ;; outcome: 1 = NO
  u100000      ;; 0.1 USDC
  u1)          ;; min-tokens-out
```

**Expected:** `(ok <tokens-received>)`

### Test 3.3: Verify Price Movement

After buying YES tokens, check that YES price increased:

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-prices u1)
```

**Expected:** `yes-price` > 500000 (>50%), `no-price` < 500000 (<50%)

### Test 3.4: Sell YES Tokens

```clarity
;; First check your YES balance
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-outcome-balance u1 tx-sender u0)

;; Sell half your tokens (adjust amount based on balance)
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  sell-outcome
  u1           ;; market-id
  u0           ;; outcome: YES
  u50000       ;; tokens to sell (adjust based on balance)
  u1)          ;; min-usdc-out
```

**Expected:** `(ok <usdc-received>)`

### Test 3.5: Fail - Invalid Outcome

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  buy-outcome
  u1
  u2           ;; Invalid outcome (must be 0 or 1)
  u100000
  u1)
```

**Expected:** `(err u4004)` (ERR-INVALID-OUTCOME)

### Test 3.6: Fail - Slippage Too High

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  buy-outcome
  u1
  u0
  u100000
  u999999999)  ;; Impossibly high min-tokens-out
```

**Expected:** `(err u4008)` (ERR-SLIPPAGE-TOO-HIGH)

---

## Test Suite 4: Market Resolution

### Test 4.1: Fail - Resolve Before Deadline

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  resolve
  u1
  u0)  ;; YES wins
```

**Expected:** `(err u4003)` (ERR-DEADLINE-NOT-PASSED)

### Test 4.2: Create Short-Deadline Market for Resolution Testing

**HACKATHON: Crea mercado con deadline +5 blocks (~45 min)**

```clarity
;; First, get current block height
block-height

;; Create market with deadline = current-block + 5
;; Example: if block-height is 3742949:
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  create-market
  u"Quick test market"
  u3742954     ;; deadline: current + 5 blocks (~45 min)
  u3742964     ;; resolution-deadline: current + 15 blocks
  u1000000)
```

**IMPORTANTE:** Ajusta los números según el `block-height` actual.

### Test 4.3: Resolve Market (After Deadline)

**Wait for deadline to pass, then:**

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  resolve
  u<market-id>   ;; Use the short-deadline market
  u0)            ;; YES wins
```

**Expected:** `(ok true)`

### Test 4.4: Fail - Non-Creator Resolves

From a different wallet:

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  resolve
  u1
  u0)
```

**Expected:** `(err u4015)` (ERR-NOT-AUTHORIZED)

---

## Test Suite 5: Claiming Winnings

### Test 5.1: Fail - Claim During Dispute Window

Immediately after resolution:

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  claim
  u<resolved-market-id>)
```

**Expected:** `(err u4011)` (ERR-DISPUTE-WINDOW-ACTIVE)

**Note:** Dispute window is 1008 blocks (~7 days). For full testing, use simnet.

### Test 5.2: Check Claim Status

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-claim-status u<market-id> tx-sender)
```

**Returns:**
- `is-resolved`: true/false
- `dispute-window-ends`: block height
- `claims-enabled`: true when dispute window passed
- `has-claimed`: true/false
- `winning-outcome`: (some u0) or (some u1)

### Test 5.3: Claim Winnings (After Dispute Window)

**Only possible after 1008 blocks from resolution:**

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  claim
  u<market-id>)
```

**Expected:** `(ok <usdc-claimed>)`

### Test 5.4: Fail - Double Claim

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  claim
  u<market-id>)
```

**Expected:** `(err u4009)` (ERR-ALREADY-CLAIMED)

---

## Test Suite 6: Read-Only Queries

### Test 6.1: Get Market Count

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-market-count)
```

### Test 6.2: Get Market Details

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-market u1)
```

### Test 6.3: Get Current Prices

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-prices u1)
```

### Test 6.4: Get Reserves

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-reserves u1)
```

### Test 6.5: Get Accumulated Fees

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-accumulated-fees u1)
```

### Test 6.6: Check if Market is Active

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  is-market-active u1)
```

---

## Test Suite 7: LP Token Operations (SIP-013)

### Test 7.1: Get LP Token Balance

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.sip013-lp-token
  get-balance u1 tx-sender)
```

### Test 7.2: Transfer LP Tokens

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.sip013-lp-token
  transfer
  u1                 ;; token-id (market-id)
  u100000            ;; amount
  tx-sender          ;; sender
  'ST...RECIPIENT)   ;; recipient address
```

### Test 7.3: Get Total Supply for Market

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.sip013-lp-token
  get-total-supply u1)
```

---

## Test Suite 8: Edge Cases

### Test 8.1: Trade After Deadline

Create market, wait for deadline, try to trade:

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  buy-outcome
  u<expired-market>
  u0
  u100000
  u1)
```

**Expected:** `(err u4001)` (ERR-MARKET-NOT-ACTIVE)

### Test 8.2: Add Liquidity to Resolved Market

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  add-liquidity
  u<resolved-market>
  u500000)
```

**Expected:** `(err u4002)` (ERR-MARKET-ALREADY-RESOLVED)

### Test 8.3: Sell More Tokens Than Owned

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  sell-outcome
  u1
  u0
  u999999999999   ;; More than owned
  u1)
```

**Expected:** `(err u4005)` (ERR-INSUFFICIENT-BALANCE)

### Test 8.4: Non-Existent Market

```clarity
(contract-call? 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v3
  get-market u999)
```

**Expected:** `(err u4000)` (ERR-MARKET-NOT-FOUND)

---

## Error Codes Reference

| Code | Name | Description |
|------|------|-------------|
| u4000 | ERR-MARKET-NOT-FOUND | Market ID does not exist |
| u4001 | ERR-MARKET-NOT-ACTIVE | Market is past deadline |
| u4002 | ERR-MARKET-ALREADY-RESOLVED | Market already resolved |
| u4003 | ERR-DEADLINE-NOT-PASSED | Cannot resolve before deadline |
| u4004 | ERR-INVALID-OUTCOME | Outcome must be 0 (YES) or 1 (NO) |
| u4005 | ERR-INSUFFICIENT-BALANCE | Not enough tokens to sell |
| u4006 | ERR-INSUFFICIENT-LIQUIDITY | Below minimum liquidity |
| u4007 | ERR-ZERO-AMOUNT | Amount cannot be zero |
| u4008 | ERR-SLIPPAGE-TOO-HIGH | Received less than minimum |
| u4009 | ERR-ALREADY-CLAIMED | Winnings already claimed |
| u4010 | ERR-NO-WINNINGS | No winning tokens to claim |
| u4011 | ERR-DISPUTE-WINDOW-ACTIVE | Must wait for dispute window |
| u4012 | ERR-INVALID-QUESTION | Question cannot be empty |
| u4013 | ERR-INVALID-DEADLINE | Deadline must be in future |
| u4015 | ERR-NOT-AUTHORIZED | Only creator can resolve |

---

## Full Testing Workflow

### Quick Smoke Test (5 min)

1. [ ] Check USDCx balance
2. [ ] Create market (1 USDC)
3. [ ] Buy YES tokens (0.1 USDC)
4. [ ] Check prices changed
5. [ ] Check outcome balance

### Complete Test (requires waiting for blocks)

1. [ ] **Setup**
   - [ ] Authorize LP token minter

2. [ ] **Market Creation**
   - [ ] Create market with 1 USDC
   - [ ] Create market with 2 USDC
   - [ ] Verify market data
   - [ ] Test error: insufficient liquidity
   - [ ] Test error: empty question

3. [ ] **Liquidity**
   - [ ] Add liquidity (0.5 USDC)
   - [ ] Check LP balance
   - [ ] Remove liquidity
   - [ ] Test error: below minimum

4. [ ] **Trading**
   - [ ] Buy YES tokens
   - [ ] Buy NO tokens
   - [ ] Verify price movement
   - [ ] Sell tokens
   - [ ] Test error: invalid outcome
   - [ ] Test error: slippage

5. [ ] **Resolution** (requires short-deadline market)
   - [ ] Create short-deadline market
   - [ ] Wait for deadline
   - [ ] Resolve market
   - [ ] Test error: non-creator resolves

6. [ ] **Claims** (requires 1008 blocks after resolution)
   - [ ] Test error: claim during dispute window
   - [ ] Wait for dispute window
   - [ ] Claim winnings
   - [ ] Test error: double claim

7. [ ] **LP Tokens**
   - [ ] Transfer LP tokens
   - [ ] Check total supply

---

## Tools for Testing

### Hiro Explorer
- Testnet: https://explorer.hiro.so/?chain=testnet

### Stacks API
```bash
# Get current block height
curl -s "https://api.testnet.hiro.so/extended/v2/blocks?limit=1" | jq '.results[0].height'

# Check contract exists
curl -s "https://api.testnet.hiro.so/v2/contracts/interface/ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC/multi-market-pool"
```

### Clarinet Console (Testnet)
```bash
clarinet console --testnet
```

---

## Notes

- **Dispute Window:** 1008 blocks (~7 days) - full claim testing requires simnet
- **Minimum Liquidity:** 1 USDC for market creation, 0.1 USDC for add/remove
- **Trading Fees:** 3% → 20% exponential (increases over time, 70% to LPs, 10% to creator, 20% to protocol)
- **Block Time:** ~10 minutes on testnet

---

*Last Updated: 2026-01-23*
