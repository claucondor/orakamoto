# Orakamoto Roadmap

## Phases Overview

| Phase | Name | Status | Core Contracts |
|-------|------|--------|----------------|
| 0 | [Core Trading](#phase-0-core-trading) | **Live** | multi-market-pool, sip013-lp-token |
| 1 | [Market Discovery](#phase-1-market-discovery) | **Live** | market-factory-v3 |
| 2 | [Multi-Outcome](#phase-2-multi-outcome-markets) | In Progress | multi-outcome-pool-v2 |
| 3 | [Yield Generation](#phase-3-yield-generation) | Contracts Ready | yield-vault, yield-distributor |
| 4 | [Oracle Resolution](#phase-4-oracle-auto-resolution) | Contracts Ready | oracle-resolver, pyth-oracle-wrapper |
| 5 | [Dispute System](#phase-5-dispute-resolution) | Contracts Ready | hro-resolver, quadratic-voting |
| 6 | [Governance](#phase-6-governance) | Contracts Ready | governance, vote-escrow |
| 7 | [Fork System](#phase-7-fork-system) | Planned | market-fork-v2 |

---

## Phase 0: Core Trading

**Status:** Live on devnet

### Capabilities
- Create binary prediction markets (YES/NO)
- Buy/sell outcome tokens with slippage protection
- Add/remove liquidity
- Resolve markets and claim winnings
- Transferable LP tokens (SIP-013)

### Contracts
| Contract | Description |
|----------|-------------|
| [multi-market-pool](./contracts/MULTI-MARKET-POOL.md) | Main trading pool using pm-AMM |
| [sip013-lp-token](./contracts/SIP013-LP-TOKEN.md) | Semi-fungible LP tokens |
| [pm-amm-core](./contracts/PM-AMM-CORE.md) | AMM pricing mathematics |
| [usdcx](./contracts/USDCX.md) | Collateral token (mock for devnet) |

---

## Phase 1: Market Discovery

**Status:** Live on devnet

### Capabilities
- Categorize markets (Crypto, Sports, Politics, etc.)
- Tag markets for searchability
- Feature/unfeature markets (curation)
- Query markets by category

### Contracts
| Contract | Description |
|----------|-------------|
| [market-factory-v3](./contracts/MARKET-FACTORY-V3.md) | Market creation with metadata |

---

## Phase 2: Multi-Outcome Markets

**Status:** In Progress

### Capabilities
- Markets with 2-10 outcomes
- LMSR pricing (probabilities sum to 1)
- Example: "Who wins the election?" with 5 candidates

### Contracts
| Contract | Description |
|----------|-------------|
| [multi-outcome-pool-v2](./contracts/MULTI-OUTCOME-POOL-V2.md) | LMSR-based multi-outcome trading |

---

## Phase 3: Yield Generation

**Status:** Contracts ready, needs V3 integration

### Capabilities
- Idle liquidity (90%) earns yield
- Yield distributed to LPs proportionally
- Production: Zest Protocol integration

### Contracts
| Contract | Description |
|----------|-------------|
| [yield-vault](./contracts/YIELD-VAULT.md) | Manages yield-bearing deposits |
| [yield-distributor](./contracts/YIELD-DISTRIBUTOR.md) | Distributes yield to LPs |

---

## Phase 4: Oracle Auto-Resolution

**Status:** Contracts ready, needs V3 integration

### Capabilities
- Markets auto-resolve when conditions met
- Price target markets ("BTC > $100k")
- Production: Pyth Network integration

### Contracts
| Contract | Description |
|----------|-------------|
| [oracle-resolver](./contracts/ORACLE-RESOLVER.md) | Auto-resolution logic |
| [pyth-oracle-wrapper](./contracts/PYTH-ORACLE-WRAPPER.md) | Pyth price feed integration |

---

## Phase 5: Dispute Resolution

**Status:** Contracts ready, needs V3 integration

### Capabilities
- Challenge incorrect resolutions
- Bond escalation (Reality.eth style)
- Quadratic voting with reputation
- AI advisory layer (optional)

### Resolution Layers
```
Layer 1: Creator Resolution
    ↓ (dispute bond)
Layer 2: Bond Escalation (2x each round)
    ↓ (threshold reached)
Layer 3: AI Advisory (optional)
    ↓ (escalates)
Layer 4: Quadratic Reputation Voting
    ↓ (>10% supply disputes)
Layer 5: Fork (Phase 7)
```

### Contracts
| Contract | Description |
|----------|-------------|
| [hro-resolver](./contracts/HRO-RESOLVER.md) | Bond escalation mechanism |
| [quadratic-voting](./contracts/QUADRATIC-VOTING.md) | Reputation-weighted voting |
| [reputation-registry](./contracts/REPUTATION-REGISTRY.md) | Voter accuracy tracking |
| [ai-oracle-council](./contracts/AI-ORACLE-COUNCIL.md) | AI recommendations |

---

## Phase 6: Governance

**Status:** Contracts ready

### Capabilities
- $PRED governance token
- Vote-escrow (lock PRED for vePRED)
- Proposal creation and voting
- Rewards for creators, traders, LPs

### Contracts
| Contract | Description |
|----------|-------------|
| [governance-token](./contracts/GOVERNANCE-TOKEN.md) | $PRED SIP-010 token |
| [vote-escrow](./contracts/VOTE-ESCROW.md) | vePRED staking |
| [governance](./contracts/GOVERNANCE.md) | Proposals and voting |
| [creator-rewards](./contracts/CREATOR-REWARDS.md) | Rewards for market creators |
| [trader-rewards](./contracts/TRADER-REWARDS.md) | Rewards for trading volume |
| [lp-rewards](./contracts/LP-REWARDS.md) | Rewards for liquidity providers |

---

## Phase 7: Fork System

**Status:** Planned

### Capabilities
- Fork markets when disputes escalate
- Users migrate positions to chosen fork
- Fork with more liquidity becomes canonical

### Contracts
| Contract | Description |
|----------|-------------|
| [market-fork-v2](./contracts/MARKET-FORK-V2.md) | Market forking mechanism |

---

## Architecture Diagram

```
                    ORAKAMOTO PROTOCOL
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   TRADING LAYER                                         │
│   ┌─────────────────────┐  ┌─────────────────────┐     │
│   │  multi-market-pool  │  │ multi-outcome-pool  │     │
│   │      (pm-AMM)       │  │      (LMSR)         │     │
│   └─────────────────────┘  └─────────────────────┘     │
│              ↓                        ↓                 │
│   ┌─────────────────────────────────────────────┐      │
│   │         market-factory-v3 (metadata)        │      │
│   └─────────────────────────────────────────────┘      │
│                                                         │
│   RESOLUTION LAYER                                      │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│   │  Manual  │ │  Oracle  │ │   HRO    │ │   Fork   │  │
│   │ (creator)│ │  (Pyth)  │ │(disputes)│ │ (nuclear)│  │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
│   VALUE LAYER                                           │
│   ┌──────────────────┐  ┌──────────────────┐           │
│   │   yield-vault    │  │  SIP-013 LP      │           │
│   │  (Zest Protocol) │  │    Tokens        │           │
│   └──────────────────┘  └──────────────────┘           │
│                                                         │
│   GOVERNANCE LAYER                                      │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│   │  $PRED   │ │  vePRED  │ │ Rewards  │               │
│   │  Token   │ │ Staking  │ │  System  │               │
│   └──────────┘ └──────────┘ └──────────┘               │
│                                                         │
│   COLLATERAL: USDCx (Circle xReserve on mainnet)       │
│                                                         │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │     Bitcoin      │
              │   (via Stacks)   │
              └──────────────────┘
```

---

## External Dependencies

| Dependency | Network | Address |
|------------|---------|---------|
| USDCx | Mainnet | Circle xReserve (TBD) |
| Pyth Oracle | Mainnet | `SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4` |
| Zest Protocol | Mainnet | TBD |

---

## Phase 0.5: Market Quality Improvements (PRIORITY)

**Status:** Planned for immediate deployment

### Problem Identified
Phase 0 markets can launch with only 1 USDC minimum liquidity, causing:
- Markets too illiquid to trade
- High slippage on small trades
- Poor user experience
- Spam markets

### Immediate Fixes (Quick Wins)

#### 1. Increase Minimum Liquidity
- Change `MINIMUM-INITIAL-LIQUIDITY` from 1 → **10 USDC**
- Deploy as `multi-market-pool-v3-2`
- Frontend already has warnings for <$5 liquidity

#### 2. Market Proposals & Crowdfunding (Hybrid Model)

**Inspired by:** Compound Governance + Kickstarter

**Phase A: Proposal**
```clarity
- Stake 10 USDC to propose market
- Community votes (quorum: 100 votes)
- If rejected: stake → treasury
- If approved: → crowdfunding
```

**Phase B: Liquidity Crowdfunding**
```clarity
- Target: 100 USDC minimum
- Duration: 7 days
- LPs pre-commit funds
- If fails: automatic refund
- If succeeds: market launches
```

**Incentive Structure:**
- Proposer: 10% of all market fees
- Early LPs (48hr): 2x rewards
- Protocol: Never funds markets

**Benefits:**
- ✅ Filters spam markets
- ✅ Guarantees tradeable liquidity
- ✅ Community-driven curation
- ✅ Aligns incentives

**New Contracts Needed:**
- `market-proposal.clar` - Proposal voting
- `liquidity-crowdfund.clar` - LP bootstrapping
- Integration with `market-factory-v3`

**Similar Protocols:**
- Polymarket: Professional market makers (centralized)
- Augur: Permissionless but 90% illiquid markets
- Kalshi: Pre-approved events only
- **Ours**: Hybrid decentralized curation + crowdfunding

#### 3. Liquidity Mining Incentives
- Governance token rewards for LPs
- Higher APY for new markets
- Time-locked staking bonuses

### Timeline
- **Week 1**: Deploy v3-2 with 10 USDC minimum
- **Week 2-4**: Design proposal system
- **Week 5-8**: Implement crowdfunding
- **Week 9**: Launch on testnet
- **Week 10-12**: Test and iterate

---

## Security Milestones

- [x] Internal testing (devnet) - Phase 0
- [x] Testnet deployment - Phase 0 (v3-1)
- [ ] Security audit
- [ ] Bug bounty program
- [ ] Mainnet launch
