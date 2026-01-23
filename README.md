# Orakamoto

**Prediction Markets on Bitcoin**

A protocol for decentralized prediction markets built on Stacks (Bitcoin L2). Create markets on any event, trade outcomes, provide liquidity, and earn yield — all secured by Bitcoin's finality.

---

## Vision

Bring trustless prediction markets to Bitcoin. No centralized operators, no custodial risk, no censorship.

---

## How It Works

```
1. Creator deposits USDCx → Creates market ("Will BTC hit $100k by March?")
2. LPs add liquidity → Earn trading fees (1%)
3. Traders buy YES/NO tokens → Price reflects probability
4. Event happens → Creator resolves (or gets disputed)
5. Winners claim → 1 token = 1 USDCx
```

### Market Types

| Type | AMM | Outcomes | Use Case |
|------|-----|----------|----------|
| Binary | [pm-AMM](./docs/contracts/PM-AMM-CORE.md) | YES/NO | "Will X happen?" |
| Multi-outcome | [LMSR](./docs/contracts/MULTI-OUTCOME-POOL-V2.md) | 2-10 | "Who wins?" |

**pm-AMM**: From [Paradigm Research](https://www.paradigm.xyz/2024/11/pm-amm) — uniform LVR across all prices, optimized for prediction markets.

**LMSR**: Logarithmic Market Scoring Rule — probabilities always sum to 1, ideal for multi-outcome events.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      ORAKAMOTO                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  TRADING LAYER                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐      │
│  │  multi-market-pool  │  │ multi-outcome-pool  │      │
│  │      (pm-AMM)       │  │      (LMSR)         │      │
│  └─────────────────────┘  └─────────────────────┘      │
│                                                         │
│  RESOLUTION LAYER                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │  Manual  │ │  Oracle  │ │   HRO    │                │
│  │(Creator) │ │  (Pyth)  │ │(Disputes)│                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                         │
│  VALUE LAYER                                            │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │  SIP-013 LP      │  │   Yield Vault    │            │
│  │    Tokens        │  │  (Zest Protocol) │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
│  GOVERNANCE LAYER                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │  $PRED   │ │  vePRED  │ │ Rewards  │                │
│  │  Token   │ │ Staking  │ │  System  │                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                         │
│  COLLATERAL: USDCx (Circle xReserve on mainnet)        │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │     Bitcoin      │
              │   (via Stacks)   │
              └──────────────────┘
```

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Binary Markets (pm-AMM) | ✅ Live | Multi-market pool, unlimited markets |
| SIP-013 LP Tokens | ✅ Live | Transferable, DeFi composable |
| Market Factory v3 | ✅ Live | Categories, tags, featured |
| Multi-Outcome (LMSR) | 🔄 In Progress | 2-10 outcomes per market |
| Oracle Resolution | 📋 Planned | Pyth Network integration |
| Dispute System | 📋 Planned | Bond escalation + voting |
| Governance | 📋 Planned | $PRED token, vePRED |

See [Roadmap](./docs/ROADMAP.md) for detailed phases.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Roadmap](./docs/ROADMAP.md) | Development phases and milestones |
| [Contract Reference](./docs/contracts/INDEX.md) | All contracts with math and logic |
| [Contributing](./CONTRIBUTING.md) | Development guidelines |

---

## Quick Start

```bash
# Install dependencies
npm install

# Run tests (1000+ tests)
npm test

# Check contracts compile
clarinet check
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Clarity |
| L2 | Stacks |
| L1 Security | Bitcoin |
| Testing | Clarinet SDK + Vitest |
| Collateral | USDCx (Circle xReserve) |
| Oracles | Pyth Network |

---

## License

**Business Source License 1.1** (BSL 1.1)

- ✅ View code, fork for learning, contribute
- ❌ Commercial use, competing products
- 📅 Converts to MIT after 4 years

Same model as [Uniswap V3/V4](https://github.com/Uniswap/v3-core/blob/main/LICENSE).

---

## About

Built by **Claudio Condor**.

Solo dev building this because prediction markets on Bitcoin should exist. No VC, no big team — just shipping code.

Open to collaborations. If you want to help build this, reach out.

**X**: [@elcondor99](https://x.com/elcondor99)

---

<p align="center">
  <i>Built on Bitcoin. Powered by Stacks. Inspired by Satoshi.</i>
</p>
