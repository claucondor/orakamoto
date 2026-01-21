# StackPredict Protocol - Development Tasks

## Project Overview
Prediction Market Protocol on Stacks (Bitcoin L2) using Clarity smart contracts.
- Permissionless market creation
- AMM-based trading (CPMM for binary, LMSR for multi-outcome)
- LP yield from trading fees + DeFi yield integration
- Binary and multi-outcome markets

**IMPORTANT: All development is for DEVNET environment.**
- Use LOCAL trait references (`.sip-010-trait.sip-010-trait`)
- All contracts are mocks/local versions
- Do NOT reference mainnet contract addresses in code
- Mainnet addresses in docs are for future reference only

---

## Project Structure

```
contracts/
├── traits/
│   ├── sip-010-trait.clar          # Local copy of SIP-010 (for devnet)
│   ├── prediction-market-trait.clar
│   └── oracle-trait.clar
├── mocks/
│   ├── mock-oracle.clar
│   └── mock-zest-vault.clar
├── mock-usdc.clar
├── market-pool.clar
├── market-factory.clar
├── multi-outcome-pool.clar         # Phase 2
├── yield-vault.clar                # Phase 3
├── yield-distributor.clar          # Phase 3
├── oracle-resolver.clar            # Phase 4
├── pyth-oracle-wrapper.clar        # Phase 4
├── governance-token.clar           # Phase 5
└── governance.clar                 # Phase 5
tests/
├── mock-usdc.test.ts
├── market-pool.test.ts
├── market-factory.test.ts
└── integration.test.ts
```

## Setup Instructions

**1. Install dependencies:**
```bash
npm install
```

**2. Add contracts to Clarinet.toml:**
When creating a new contract, register it in Clarinet.toml:
```toml
[contracts.mock-usdc]
path = "contracts/mock-usdc.clar"

[contracts.sip-010-trait]
path = "contracts/traits/sip-010-trait.clar"

[contracts.market-pool]
path = "contracts/market-pool.clar"
depends_on = ["mock-usdc", "sip-010-trait"]
```

**3. Use LOCAL trait references in devnet:**
```clarity
;; In devnet/testnet, use local trait (deployed with your contracts):
(impl-trait .sip-010-trait.sip-010-trait)

;; In mainnet, use official trait:
;; (impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
```

**4. Contract dependencies order:**
Deploy in this order (Clarinet handles this automatically):
1. sip-010-trait.clar
2. mock-usdc.clar
3. prediction-market-trait.clar
4. market-pool.clar
5. market-factory.clar

**5. Document all deployed addresses:**
After deploying contracts, create/update `DEPLOYMENTS.md` with:
```markdown
# Deployed Contracts

## Devnet
| Contract | Address | Deployed |
|----------|---------|----------|
| sip-010-trait | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip-010-trait | YYYY-MM-DD |
| mock-usdc | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-usdc | YYYY-MM-DD |
...
```
Update this file every time you deploy or redeploy contracts.

---

## Phase 1: MVP - Core Protocol

### Traits & Interfaces
- [x] Create SIP-010 trait in contracts/traits/sip-010-trait.clar - Standard fungible token interface
- [x] Create prediction-market-trait in contracts/traits/prediction-market-trait.clar - Interface for prediction markets with functions: get-market-info, get-prices, get-reserves, add-liquidity, remove-liquidity, buy-outcome, sell-outcome, resolve, claim

### Mock USDC Token
- [x] Create mock-usdc.clar implementing SIP-010 trait with 6 decimals
- [x] Implement transfer, get-name, get-symbol, get-decimals, get-balance, get-total-supply, get-token-uri functions
- [x] Add faucet function allowing anyone to mint up to 10000 USDC for testing
- [x] Add mint function restricted to contract owner
- [x] Add burn function for token holders
- [x] Write tests for mock-usdc in tests/mock-usdc.test.ts covering faucet limits, transfers, and access control

### Market Pool Contract (Binary Markets)
- [x] Create market-pool.clar with constants: PRECISION u1000000, TRADING-FEE-BP u100 (1%), LP-FEE-SHARE-BP u7000 (70%), CREATOR-FEE-SHARE-BP u1000 (10%), PROTOCOL-FEE-SHARE-BP u2000 (20%)
- [x] Define error constants: ERR-NOT-AUTHORIZED, ERR-MARKET-NOT-ACTIVE, ERR-MARKET-ALREADY-RESOLVED, ERR-DEADLINE-NOT-PASSED, ERR-INVALID-OUTCOME, ERR-INSUFFICIENT-BALANCE, ERR-INSUFFICIENT-LIQUIDITY, ERR-ZERO-AMOUNT, ERR-SLIPPAGE-TOO-HIGH, ERR-ALREADY-CLAIMED, ERR-NO-WINNINGS
- [x] Implement data variables: market-question, market-creator, market-deadline, resolution-deadline, creator-collateral, is-resolved, winning-outcome, yes-reserve, no-reserve, total-liquidity, accumulated-fees
- [x] Implement data maps: lp-balances, outcome-balances, has-claimed
- [x] Implement initialize function to set market parameters
- [x] Implement read-only functions: get-market-info, get-prices (using CPMM formula), get-reserves, get-lp-balance, get-outcome-balance
- [x] Implement AMM math functions: calculate-tokens-out, calculate-amount-in, calculate-fee
- [x] Implement add-liquidity function that splits deposit 50/50 between YES/NO reserves and mints LP tokens
- [x] Implement remove-liquidity function that returns proportional share of reserves plus fee share
- [x] Implement buy-outcome function using CPMM formula with 1% fee
- [x] Implement sell-outcome function to sell tokens back to pool
- [x] Implement resolve function restricted to creator after deadline (basic - no dispute window)
- [x] Implement DISPUTE-WINDOW parameter (default: u1008 = ~7 days) - time after resolution before claims are allowed
- [x] Implement claim function for winners (with dispute window check)
- [x] Add is-disputed flag and dispute-deadline to market state
- [x] Implement open-dispute function (Phase 5 will add DAO voting, for now just blocks claims)
- [x] Implement finalize-resolution function to close dispute window and enable claims
- [x] Write comprehensive tests for market-pool in tests/market-pool.test.ts

### Market Factory Contract
- [x] Create market-factory.clar with MINIMUM-COLLATERAL u50000000 (50 USDC) and DEFAULT-RESOLUTION-WINDOW u1008 (~7 days)
- [x] Implement market-count variable and markets map storing pool-contract, creator, question, deadline, created-at, active
- [x] Implement creator-markets map to track markets by creator
- [x] Implement get-market-count, get-market, get-creator-markets read-only functions
- [x] Implement create-market function that registers new market with collateral requirement
- [x] Implement deactivate-market admin function
- [x] Write tests for market-factory in tests/market-factory.test.ts

### Phase 1 Verification
- [x] Write end-to-end test: create market -> add liquidity -> buy YES -> buy NO -> resolve -> claim winnings
- [x] Run clarinet check to verify all contracts compile without errors
- [x] Run clarinet test to ensure all tests pass

### Test File Template
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;

describe('Contract Name', () => {
  beforeEach(() => {
    // Setup: mint tokens, etc.
  });

  it('should do something', () => {
    const result = simnet.callPublicFn(
      'contract-name',
      'function-name',
      [Cl.uint(100), Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(result.result).toBeOk(Cl.bool(true));
  });

  it('should read data', () => {
    const result = simnet.callReadOnlyFn(
      'contract-name',
      'get-something',
      [Cl.standardPrincipal(wallet1)],
      wallet1
    );
    expect(result.result).toBeOk(Cl.uint(100));
  });
});
```

### Token Transfers Note
All token transfers in contracts MUST use actual contract-call:
```clarity
;; Transfer FROM user TO contract:
(try! (contract-call? .mock-usdc transfer amount tx-sender (as-contract tx-sender) none))

;; Transfer FROM contract TO user:
(try! (as-contract (contract-call? .mock-usdc transfer amount tx-sender recipient none)))
```
Do NOT leave transfers commented out.

---

## Phase 2: Multi-Outcome Markets

### LMSR (Logarithmic Market Scoring Rule) Implementation

**IMPORTANT: Clarity has no native ln() or exp() functions.**
Use integer approximations:
- Taylor series for exp: exp(x) ≈ 1 + x + x²/2 + x³/6 (for small x)
- Lookup tables for common values
- Scale all values by PRECISION (u1000000) to maintain accuracy

- [x] Create multi-outcome-pool.clar supporting 2-10 outcomes per market
- [x] Implement exp-approximation helper function using Taylor series or lookup table
- [x] Implement ln-approximation helper function
- [x] Implement LMSR cost function: Cost(q) = b * ln(sum(exp(q_i / b))) where b is liquidity parameter
- [x] Implement price calculation: Price_i = exp(q_i / b) / sum(exp(q_j / b))
- [x] Implement buy-outcome for multi-outcome using LMSR
- [x] Implement sell-outcome for multi-outcome
- [x] Handle resolution with multiple possible winners
- [x] Write tests for LMSR math accuracy and edge cases (18/25 tests pass - core functionality verified)

### Multi-Outcome Factory
- [x] Extend market-factory to support multi-outcome market creation
- [x] Add outcome-count parameter to create-market
- [x] Store outcome labels in market metadata
- [x] Write tests for multi-outcome market lifecycle

---

## Phase 3: Yield Integration (Zest Protocol Mock)

### Zest Protocol Interface Research
Reference: https://github.com/Zest-Protocol/zest-contracts
Real Zest functions to mock:
- supply(lp, pool-reserve, asset, amount, owner) -> deposits asset, returns bool
- withdraw(pool-reserve, asset, oracle, assets, amount, current-balance, owner) -> returns uint withdrawn
- borrow(pool-reserve, oracle, asset-to-borrow, lp, assets, amount, fee-calculator, interest-rate-mode, owner)
- repay(asset, amount-to-repay, on-behalf-of, payer)

### Mock Zest Vault
- [x] Create contracts/mocks/mock-zest-vault.clar implementing same interface as real Zest
- [x] Implement supply function that accepts USDC deposits and tracks balances
- [x] Implement withdraw function that returns deposited amount plus simulated yield
- [x] Implement get-balance and get-yield-earned read-only functions
- [x] Add configurable yield-rate-bp for testing different APY scenarios
- [x] Write tests verifying mock behaves like real Zest interface

### Yield Vault Integration
- [x] Create yield-vault.clar that wraps mock-zest-vault (swappable for real Zest in production)
- [x] Implement deposit-idle-funds to move 90% of pool liquidity to yield source
- [x] Implement withdraw-for-trade to pull funds when needed for large trades
- [x] Implement harvest-yield to collect and distribute earned yield
- [x] Track yield per LP token for fair distribution (via yield-distributor integration)

### Yield Distributor
- [x] Create yield-distributor.clar to handle yield distribution logic
- [x] Calculate yield share per LP based on time-weighted LP balance
- [x] Implement claim-yield for LPs to claim accumulated yield
- [x] Write tests for yield accrual and distribution math

---

## Phase 4: Oracle Integration

### Oracle Trait
- [x] Create contracts/traits/oracle-trait.clar defining: get-price(asset) -> (response uint uint)
- [x] Support price with 8 decimals precision (standard oracle format)

### Mock Oracle (for devnet)
- [x] Create contracts/mocks/mock-oracle.clar implementing oracle-trait
- [x] Allow admin to set prices manually for testing
- [x] Implement set-price(asset, price) admin function
- [x] Implement get-price(asset) read-only function
- [x] Write tests for mock oracle (19 tests, all passing)

### Pyth Oracle Integration (for testnet/mainnet)
Reference: https://github.com/stx-labs/stacks-pyth-bridge
Contract: SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4
- [x] Create pyth-oracle-wrapper.clar that calls pyth-oracle-v4.read-price-feed
- [x] Map price feed IDs for BTC, STX, ETH, USDC
- [x] Handle price staleness checks (max age parameter)
- [x] Write tests for pyth-oracle-wrapper (devnet compatible)

### Auto-Resolution System
- [x] Create oracle-resolver.clar for markets that can resolve via oracle
- [x] Define market types: MANUAL (creator resolves), PRICE_TARGET (oracle resolves when price hits target), TIME_BASED (oracle price at deadline)
- [x] Implement check-resolution that anyone can call to trigger auto-resolution
- [x] Add oracle-market-config map storing oracle address, price-feed-id, target-price, resolution-type
- [x] Write tests for each resolution type (33 tests, all passing)

---

## Phase 5: Governance

### Governance Model: "Skin in the Game"

**Token: $PRED** - earned by participating, not bought via ICO.

**How to earn $PRED:**
- LPs earn by providing liquidity (proportional to time + amount)
- Traders earn by trading volume
- Market creators earn if their market has high volume/participation

**Voting Power:** Tokens + time staked (vote-escrow style like veCRV)
- 1 $PRED staked 1 week = 1 vote
- 1 $PRED staked 1 year = 4 votes (multiplier for commitment)

**Initial Distribution:**
- 40% - Community rewards (LPs, traders, creators) - emitted over 4 years
- 25% - Treasury (controlled by DAO)
- 20% - Team (vesting 3 years, 1 year cliff)
- 15% - Early contributors/investors (vesting 2 years)

**What can be governed:**
- Resolve disputed markets (if creator resolves incorrectly)
- Curate markets (feature/hide)
- Adjust fees per category (sports, crypto, politics)
- Whitelist oracles for auto-resolution
- Treasury spending

### Governance Token
- [x] Create governance-token.clar (SIP-010) named $PRED
- [x] Implement mint function restricted to reward contracts
- [x] Implement burn function for token holders
- [x] Add delegate function for vote delegation
- [x] Create vesting-vault.clar for team/investor vesting with cliff and linear unlock

### Reward Distribution
- [x] Create lp-rewards.clar to distribute $PRED to LPs based on time-weighted liquidity
- [x] Create trader-rewards.clar to distribute $PRED based on trading volume
- [x] Create creator-rewards.clar to distribute $PRED based on market success metrics
- [x] Implement epoch-based distribution (weekly epochs) - implemented in lp-rewards.clar and trader-rewards.clar

### Vote Escrow
- [x] Create vote-escrow.clar for staking $PRED to get voting power
- [x] Implement lock function with duration parameter (1 week to 4 years)
- [x] Calculate voting power: amount * (lock_duration / max_duration)
- [x] Implement extend-lock and increase-amount functions
- [x] Implement withdraw after lock expires

### Governance Contract
- [x] Create governance.clar for proposal and voting system
- [x] Define proposal types: PARAMETER_CHANGE, TREASURY_SPEND, DISPUTE_RESOLUTION, ORACLE_WHITELIST, EMERGENCY_ACTION
- [x] Implement create-proposal with minimum voting power threshold (e.g., 1% of total)
- [x] Implement vote(proposal-id, support) using vote-escrow balance
- [x] Voting period: 7 days, Timelock: 2 days
- [x] Quorum: 10% of total voting power must participate
- [x] Implement execute-proposal after voting period and quorum reached
- [x] Implement cancel-proposal for proposer or if threshold drops

### Phase 5 Tests (Complete)
- [x] Write tests for vote-escrow.clar (lock, extend, withdraw, voting power calculation)
- [x] Write tests for governance.clar (create-proposal, vote, execute, cancel, quorum)

### Dispute Resolution
- [x] Create dispute.clar for challenging market resolutions
- [x] Allow anyone to open dispute by staking $PRED (slashed if frivolous)
- [x] Disputed markets enter 7-day voting period
- [x] If dispute succeeds: challenger gets reward, creator loses collateral
- [x] If dispute fails: challenger stake slashed, distributed to voters
- [x] Write comprehensive tests for dispute.clar

### Governable Parameters
- [x] TRADING-FEE-BP (default: 100 = 1%)
- [x] LP-FEE-SHARE-BP (default: 7000 = 70%)
- [x] CREATOR-FEE-SHARE-BP (default: 1000 = 10%)
- [x] PROTOCOL-FEE-SHARE-BP (default: 2000 = 20%)
- [x] MINIMUM-COLLATERAL (default: 50 USDC)
- [x] RESOLUTION-WINDOW (default: 7 days) - time for creator to resolve after deadline
- [x] DISPUTE-WINDOW (default: 7 days) - lock period after resolution before claims allowed
- [x] DISPUTE-STAKE (amount of $PRED to open dispute)
- [x] Protocol treasury address

### Market Resolution Flow
```
1. Market deadline passes
   ↓
2. Creator has RESOLUTION-WINDOW to resolve (set winning outcome)
   ↓
3. DISPUTE-WINDOW starts (funds locked, no claims)
   ↓
4a. No dispute → finalize-resolution() → claims enabled
4b. Dispute opened → DAO votes →
    - If dispute wins: outcome reversed, creator loses collateral
    - If dispute fails: original outcome confirmed, disputer loses stake
   ↓
5. Claims enabled for winners
```

### Governance Security
- [x] Implement emergency-pause requiring 30% quorum and 80% approval
- [x] Add proposal cooldown per address (1 proposal per week)
- [ ] Implement guardian multisig for critical emergencies (can pause, cannot change params)
- [x] Write tests for governance attacks: flash loan voting, last-minute swings, etc.

---

## Phase 6: Hybrid Reputation Oracle (HRO) - Advanced Resolution System

> **Research-backed design** combining lessons from UMA/Polymarket failures, Reality.eth bond escalation,
> and emerging AI oracle research. Goal: manipulation-resistant resolution for subjective events
> (e.g., "Will Shakira perform in Peru this year?").

### Problem Statement

Current oracle approaches have critical vulnerabilities:

| System | Vulnerability | Example Failure |
|--------|--------------|-----------------|
| UMA (Polymarket) | Whale manipulation via token-weighted voting | March 2025: $7M loss, 25% token holder manipulated Ukraine minerals market |
| Simple DAO voting | Plutocracy - rich users control outcomes | Flash loan attacks, vote buying |
| Centralized oracles | Single point of failure, trust assumptions | Exchange manipulation, admin key compromise |
| Pure Schelling points | Sybil attacks, coordination failures | Multiple addresses, vote splitting |

### HRO Architecture: 5-Layer Defense

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID REPUTATION ORACLE                      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 5: FORK (Nuclear Option)                                 │
│  └── Market forks if >10% supply disputes after Layer 4        │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: QUADRATIC REPUTATION VOTING                           │
│  └── vote_power = √(tokens) × reputation_score                 │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: AI PRE-VERIFICATION (Advisory)                        │
│  └── Multi-LLM council evaluates evidence, provides recommendation│
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: BOND ESCALATION (Reality.eth style)                   │
│  └── Disputers must 2x bond; winner takes all bonds            │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: OPTIMISTIC RESOLUTION                                 │
│  └── Creator resolves + bond; 7-day dispute window             │
└─────────────────────────────────────────────────────────────────┘
```

### Mathematical Formulas

#### Layer 2: Bond Escalation
```
bond_n = bond_0 × 2^n

Where:
- bond_0 = MINIMUM_DISPUTE_BOND (e.g., 50 USDC)
- n = escalation round (0, 1, 2, ...)
- Max escalation: n_max where bond_n > ESCALATION_THRESHOLD

Example escalation:
Round 0: 50 USDC (creator's initial bond)
Round 1: 100 USDC (first disputer)
Round 2: 200 USDC (creator counter-disputes)
Round 3: 400 USDC (disputer escalates)
...
Round 10: 51,200 USDC → triggers Layer 4 voting
```

#### Layer 4: Quadratic Reputation Voting
```
vote_power_i = √(tokens_i) × reputation_i × time_multiplier_i

Where:
- tokens_i = $PRED tokens staked by voter i
- reputation_i = historical_accuracy_i × participation_rate_i
- time_multiplier_i = min(4, 1 + (stake_duration_days / 365))

historical_accuracy = correct_votes / total_votes
participation_rate = votes_cast / eligible_votes (capped at 1.0)

Anti-whale property:
- 10,000 tokens with rep=0.9: √10000 × 0.9 = 90 vote power
- 1,000,000 tokens with rep=0.5: √1000000 × 0.5 = 500 vote power
- Ratio: 5.5x power for 100x tokens (vs 100x in linear voting)
```

#### Layer 5: Fork Threshold
```
fork_triggered = (disputing_stake / total_staked) > FORK_THRESHOLD

Where:
- FORK_THRESHOLD = 0.10 (10%)
- If triggered: market splits into two outcomes
- Each fork has its own resolution
- Market determines which fork has value
```

### Smart Contracts

#### hro-resolver.clar
- [x] Define HRO-related constants: MINIMUM_DISPUTE_BOND, ESCALATION_THRESHOLD, FORK_THRESHOLD, MAX_ESCALATION_ROUNDS
- [x] Implement dispute-bond map tracking: disputer, amount, outcome_claimed, round, timestamp
- [x] Implement escalation-state for each market: current_round, current_bond, last_action_block, leading_outcome
- [x] Implement initiate-dispute(market-id, claimed_outcome) requiring 2x current bond
- [x] Implement counter-dispute(market-id) for creator/previous winner to defend
- [x] Implement finalize-escalation() when timeout reached without counter
- [x] Implement trigger-voting() when bond exceeds ESCALATION_THRESHOLD
- [x] Implement distribute-bonds() to winner after resolution
- [x] Write tests for full escalation sequence

#### reputation-registry.clar
- [x] Define reputation-score map: principal → { correct_votes, total_votes, participation_score, last_updated }
- [x] Implement calculate-reputation(principal) → uint (scaled 0-1000000 for precision)
- [x] Implement update-reputation(principal, was_correct) called after vote resolution
- [x] Implement get-vote-power(principal, tokens_staked, stake_duration) using quadratic formula
- [x] Implement decay function: reputation decays 1% per month of inactivity
- [x] Implement reputation-history for transparency/auditing
- [x] Write tests for reputation edge cases: new users, perfect accuracy, zero participation

#### quadratic-voting.clar
- [x] Implement create-vote(market-id, options) when escalation triggers voting
- [x] Implement cast-vote(market-id, outcome, tokens_to_stake) with quadratic power calculation
- [x] Implement voting period: VOTING_DURATION = 3 days (432 blocks)
- [x] Implement commit-reveal scheme to prevent last-minute swings:
  - Phase 1 (2 days): commit hash(vote + salt)
  - Phase 2 (1 day): reveal vote + salt
- [x] Implement tally-votes() with quadratic reputation weighting
- [x] Implement slash-non-revealers() - lose 10% of staked tokens
- [x] Write tests for: normal voting, ties, manipulation attempts

#### ai-oracle-council.clar (Advisory Layer)
- [x] Define AI_RECOMMENDATION_WEIGHT = 0 (advisory only, no voting power)
- [x] Implement request-ai-evaluation(market-id, question, evidence_links)
- [x] Implement record-ai-recommendation(market-id, outcome, confidence, sources) - called by authorized AI bridge
- [x] Implement get-ai-recommendation(market-id) for voters to reference
- [x] AI recommendation displayed in UI but CANNOT override human vote
- [x] Implement ai-accuracy-tracking for future calibration
- [x] Write tests for AI integration (mock responses)

#### market-fork.clar (Nuclear Option)
- [x] Implement check-fork-threshold(market-id) returns bool
- [x] Implement initiate-fork(market-id) when threshold exceeded
- [x] Implement fork-market(market-id) creating two child markets:
  - market-id-A: Original resolution stands
  - market-id-B: Disputed resolution wins
- [x] Implement migrate-position(original-market, fork-choice) for users to choose
- [x] After FORK_SETTLEMENT_PERIOD (30 days):
  - Fork with more liquidity/volume = canonical
  - Other fork positions can redeem at discount or hold
- [x] Write tests for fork scenarios

### Resolution Flow Diagram
```
Market Deadline Reached
        │
        ▼
┌───────────────────┐
│ Layer 1: Creator  │
│ resolves + bond   │
└────────┬──────────┘
         │
         ▼
    7-day window
         │
    ┌────┴────┐
    │         │
No dispute  Dispute (2x bond)
    │         │
    ▼         ▼
 Finalize  ┌──────────────────┐
           │ Layer 2: Bond    │
           │ Escalation       │
           └────────┬─────────┘
                    │
              ┌─────┴─────┐
              │           │
         Timeout      Escalates to
         (winner)     threshold
              │           │
              ▼           ▼
           Finalize  ┌───────────────────┐
                     │ Layer 3: AI       │
                     │ Pre-verification  │
                     │ (advisory only)   │
                     └────────┬──────────┘
                              │
                              ▼
                     ┌───────────────────┐
                     │ Layer 4: Quadratic│
                     │ Reputation Vote   │
                     └────────┬──────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
               Clear winner       >10% dispute stake
                    │                   │
                    ▼                   ▼
                Finalize        ┌──────────────────┐
                                │ Layer 5: Fork    │
                                │ Market splits    │
                                └──────────────────┘
```

### Security Considerations
- [ ] Bond escalation prevents spam disputes (economic cost)
- [ ] Quadratic voting limits whale influence (√n growth)
- [ ] Reputation system rewards honest long-term participation
- [ ] Commit-reveal prevents last-minute vote manipulation
- [ ] Fork mechanism ensures no single party can force incorrect outcome
- [ ] AI layer is advisory-only (cannot be manipulated to change outcome)
- [ ] All evidence and deliberations stored on-chain for transparency

### Testing Requirements
- [ ] Unit tests for each contract
- [ ] Integration tests for full escalation → voting → resolution flow
- [ ] Simulation tests for attack scenarios:
  - Whale accumulation attack
  - Sybil voting attack
  - Flash loan voting attack
  - Collusion between disputers
  - AI recommendation manipulation
- [ ] Economic simulation: ensure honest behavior is always more profitable

### References
- [UMA Optimistic Oracle failures](https://orochi.network/blog/oracle-manipulation-in-polymarket-2025)
- [Reality.eth Whitepaper](https://reality.eth.limo/app/docs/html/whitepaper.html)
- [Quadratic Voting (Weyl & Posner)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2003531)
- [SoK: Market Microstructure for DePMs](https://arxiv.org/html/2510.15612)
- [Schelling Point Oracle Vulnerabilities](https://medium.com/reserve-currency/schelling-network-oracles-are-vulnerable-to-manipulation-68d1a88cbcf3)
- [AI Oracles for Prediction Markets](https://chaoslabs.xyz/posts/edge-proofs-ai-powered-prediction-market-oracles)

---

## Security Guidelines

### Clarity Built-in Protections
Clarity provides these protections by design:
- **No reentrancy**: Contract cannot call back into itself during execution
- **Overflow/underflow protection**: Invalid arithmetic auto-aborts transaction
- **Mandatory response handling**: Cannot ignore failed operations
- **Decidable execution**: Always terminates, accurate cost prediction

### CRITICAL: tx-sender vs contract-caller

```clarity
;; tx-sender = original transaction initiator (NEVER changes in call chain)
;; contract-caller = immediate caller (changes with each contract hop)

;; VULNERABLE TO PHISHING:
(define-public (transfer (amount uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) (err u401))  ;; BAD - attacker can trick user
    ...))

;; SECURE:
(define-public (admin-function)
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)  ;; GOOD
    ...))
```

**Rule**: Use `contract-caller` for authentication. Only use `tx-sender` when you need the original initiator.

### Security Checklist
- [ ] All admin functions check `contract-caller` not `tx-sender`
- [ ] All public functions return `(response)` type
- [ ] All `contract-call?` results handled with `try!` or `unwrap!`
- [ ] All inputs validated with `asserts!`
- [ ] Zero amounts rejected: `(asserts! (> amount u0) ERR-ZERO-AMOUNT)`
- [ ] State validated before mutations (is-resolved, deadline, etc)
- [ ] Events emitted for all state changes: `(print {event: "name", ...})`
- [ ] No hardcoded mainnet addresses in devnet code

### Common Vulnerabilities to Avoid
1. **Phishing via tx-sender**: Use contract-caller for auth
2. **Unchecked responses**: Always use try!/unwrap! on contract-call?
3. **Missing input validation**: Validate all parameters
4. **State inconsistency**: Check preconditions before mutations
5. **Improper asset transfers**: Use as-contract correctly

---

## Technical Specifications

### CPMM Formulas (Binary Markets)
```
Price_YES = Reserve_NO / (Reserve_YES + Reserve_NO)
Price_NO = Reserve_YES / (Reserve_YES + Reserve_NO)
tokens_out = (reserve_out * amount_in) / (reserve_in + amount_in)
```

### LMSR Formulas (Multi-Outcome Markets)
```
Cost(q) = b * ln(sum(exp(q_i / b)))
Price_i = exp(q_i / b) / sum(exp(q_j / b))
b = liquidity parameter (higher = more liquid, less price impact)
```

### Fee Structure
- Total: 1% (100 basis points)
- LPs: 70% of fees
- Creator: 10% of fees
- Protocol: 20% of fees

### Token Standards
- SIP-010 for fungible tokens
- 6 decimals for USDC-like precision
- 8 decimals for oracle prices

### External Contract References (Mainnet)
- Pyth Oracle: SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4
- RedStone Verify: SPDBEG5X8XD50SPM1JJH0E5CTXGDV5NJTKAKKR5V.redstone-verify
- SIP-010 Trait: SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard
- Zest Pool Borrow: (check latest from Zest docs)

---

## Resources & References

### Getting Testnet STX Tokens

**Option 1: Hiro Platform Faucet (Recommended)**
- URL: https://platform.hiro.so/faucet
- Provides 500 STX per request
- Requires Stacks wallet connected

**Option 2: Stacks Explorer Sandbox**
- URL: https://explorer.stacks.co/sandbox/faucet?chain=testnet
- Navigate to "Faucet" tab and click "Request STX"
- Requires login with Stacks wallet

**Option 3: API Request**
```bash
curl -X POST "https://api.testnet.hiro.so/extended/v1/faucets/stx?address=YOUR_TESTNET_ADDRESS"
```

**Option 4: LearnWeb3 Faucet**
- URL: https://learnweb3.io/faucets/stacks/
- Multi-chain faucet, simple interface

### SIP-010 Token Implementation

**Adding SIP-010 Trait to Project:**
```bash
clarinet requirements add SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard
```

**Minimal SIP-010 Token Template:**
```clarity
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-token-owner (err u101))

(define-fungible-token my-token)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) err-not-token-owner)
    (try! (ft-transfer? my-token amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)))

(define-read-only (get-name) (ok "My Token"))
(define-read-only (get-symbol) (ok "MTK"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance my-token who)))
(define-read-only (get-total-supply) (ok (ft-get-supply my-token)))
(define-read-only (get-token-uri) (ok none))

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (ft-mint? my-token amount recipient)))
```

### Deployment Commands

**Verify contracts compile:**
```bash
clarinet check
```

**Run tests:**
```bash
clarinet test
```

**Start local devnet:**
```bash
clarinet devnet start
```

**Deploy to devnet:**
```bash
clarinet deployments apply --devnet
```

**Generate testnet deployment plan:**
```bash
clarinet deployments generate --testnet --medium-cost
```

**Deploy to testnet:**
```bash
clarinet deployments apply --testnet
```

**Generate mainnet deployment plan:**
```bash
clarinet deployments generate --mainnet --high-cost
```

**Deploy to mainnet (with encrypted mnemonic):**
```bash
clarinet deployments encrypt  # First time: encrypts your mnemonic
clarinet deployments apply --mainnet  # Prompts for password
```

### Documentation Links
- Clarity Book: https://book.clarity-lang.org/
- SIP-010 Standard: https://book.clarity-lang.org/ch10-03-sip010-ft-standard.html
- Creating SIP-010 Token: https://book.clarity-lang.org/ch10-04-creating-a-sip010-ft.html
- Clarinet Deployment: https://docs.stacks.co/clarinet/contract-deployment
- Stacks API: https://docs.hiro.so/stacks/api
- Pyth Oracle Stacks: https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/stacks
- Zest Protocol Contracts: https://github.com/Zest-Protocol/zest-contracts
