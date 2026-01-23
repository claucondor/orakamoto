# Orakamoto

**Prediction Markets on Bitcoin**

A protocol for decentralized prediction markets built on Stacks (Bitcoin L2). Currently in development with a working prototype on devnet.

---

## Vision

Bring trustless prediction markets to Bitcoin. Users can create markets on any event, trade outcomes, provide liquidity, and earn yield — all secured by Bitcoin's finality.

---

## How It Works

### The Flow
```
1. Creator deposits USDCx → Creates market ("Will BTC hit $100k by March?")
2. LPs add liquidity → Earn trading fees
3. Traders buy YES/NO tokens → Price reflects probability
4. Event happens → Creator resolves (or gets disputed)
5. Winners claim → 1 token = 1 USDCx
```

### The Math
| Market Type | AMM | Status |
|-------------|-----|--------|
| Binary (old) | CPMM | Working (singleton, being replaced) |
| Binary (new) | **pm-AMM** | In progress (multi-market) |
| Multi-outcome | LMSR | Working (2-10 outcomes) |

- **pm-AMM**: From [Paradigm Research](https://www.paradigm.xyz/2024/11/pm-amm) - uniform LVR across all prices
- **Pricing**: Taylor series approximation for exp/ln (Clarity has no native math)

### Resolution
Markets can resolve via:
- **Manual**: Creator resolves after deadline
- **Oracle**: Auto-resolve when price target is hit (Pyth integration planned)
- **Dispute**: Community can challenge with escalating bonds → Governance arbitration

---

## Current Status: Prototype

**Core Contracts (tested on devnet):**

| Component | Status | Notes |
|-----------|--------|-------|
| Market Pool (binary) | ✅ Working | CPMM - old singleton model |
| Multi-Outcome Pool | ✅ Working | LMSR with 2-10 outcomes |
| pm-AMM Core | ✅ Working | Paradigm formula, Taylor series |
| Market Factory v1/v2 | ✅ Working | Creates singleton markets |
| Mock USDCx | ✅ Working | SIP-010 token for testing |

**Multi-Market Architecture (in development by Ralphy):**

| Component | Status | Notes |
|-----------|--------|-------|
| SIP-013 LP Token | ✅ Done | Semi-fungible, transferable |
| Multi-Market Pool | 🔄 In progress | pm-AMM, create-market done |
| add/remove liquidity | ❌ Pending | Next up |
| buy/sell outcome | ❌ Pending | |
| Market Factory v3 | ❌ Pending | |

**Supporting Systems (contracts exist, mocked):**

| Component | Status | Notes |
|-----------|--------|-------|
| Mock Zest Vault | ✅ Working | Simulates yield protocol |
| Yield Integration | ✅ Working | Idle funds earn yield |
| Mock Oracle | ✅ Working | Manual price setting |
| Pyth Wrapper | ⚠️ Contract only | Not connected to real Pyth |
| Governance Token | ⚠️ Contract only | $PRED token |
| Vote Escrow | ⚠️ Contract only | vePRED staking |
| Governance | ⚠️ Contract only | Proposals, voting |
| HRO Resolver | ⚠️ Contract only | Dispute system |
| Quadratic Voting | ⚠️ Contract only | For governance |

**What's missing for production:**

| Component | Status | What's needed |
|-----------|--------|---------------|
| Real USDCx | ❌ | Circle xReserve mainnet integration |
| Real Zest | ❌ | Swap mock for real Zest Protocol |
| Real Pyth | ❌ | Connect to Pyth oracle on mainnet |
| LLM Judges | ❌ | AI arbitration for disputes |
| Frontend | 🔄 Minimal | Full trading UI needed |
| Security Audit | ❌ | Required before mainnet |
| Mainnet Deploy | ❌ | After audit |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         ORAKAMOTO                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   TRADING LAYER                                             │
│   ┌───────────────────────────────┐  ┌─────────────┐       │
│   │      Multi-Market Pool        │  │ Multi-Out   │       │
│   │  (pm-AMM) 🔄 in development   │  │   (LMSR)    │       │
│   └───────────────────────────────┘  └─────────────┘       │
│   ┌─────────────┐  ┌─────────────┐                         │
│   │ Market Pool │  │  pm-AMM     │                         │
│   │ (CPMM) old  │  │   Core      │                         │
│   └─────────────┘  └─────────────┘                         │
│                                                             │
│   RESOLUTION LAYER                                          │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │   Manual    │  │   Oracle*   │  │    HRO*     │        │
│   │  (Creator)  │  │   (Pyth)    │  │ (Disputes)  │        │
│   └─────────────┘  └─────────────┘  └─────────────┘        │
│                    *contracts exist, not integrated         │
│                                                             │
│   YIELD LAYER                                               │
│   ┌─────────────┐  ┌─────────────┐                         │
│   │ Yield Vault │  │   Zest*     │  *mock only             │
│   │  (90% idle) │  │ Integration │                         │
│   └─────────────┘  └─────────────┘                         │
│                                                             │
│   GOVERNANCE LAYER                                          │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │   $PRED*    │  │   vePRED*   │  │ Proposals*  │        │
│   │   Token     │  │  Staking    │  │   Voting    │        │
│   └─────────────┘  └─────────────┘  └─────────────┘        │
│                    *contracts exist, not battle-tested      │
│                                                             │
│   COLLATERAL                                                │
│   ┌─────────────────────────────────────────────────┐      │
│   │               USDCx (mock on devnet)            │      │
│   │     Will use Circle xReserve on mainnet         │      │
│   └─────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │     Bitcoin      │
                    │   (via Stacks)   │
                    └──────────────────┘
```

---

## Roadmap

### Done ✅
- [x] Binary market pool (CPMM)
- [x] Multi-outcome pool (LMSR, 2-10 outcomes)
- [x] pm-AMM core library (Paradigm formula)
- [x] Market factory v1/v2
- [x] Yield integration architecture (mock Zest)
- [x] Oracle wrapper (mock + Pyth contract)
- [x] Governance contracts (token, staking, voting)
- [x] Dispute resolution system (HRO)
- [x] 869 passing tests

### In Progress 🔄 (Ralphy working on PRD-v3)
- [x] SIP-013 LP token trait + implementation
- [x] Multi-market pool structure + create-market
- [ ] Multi-market: add-liquidity, remove-liquidity
- [ ] Multi-market: buy-outcome, sell-outcome
- [ ] Multi-market: resolve, claim
- [ ] Market factory v3
- [ ] Integration tests

### Next Up 📋
- [ ] Basic frontend for trading
- [ ] Testnet deployment
- [ ] Real USDCx integration (Circle xReserve)
- [ ] Real Pyth oracle connection

### Future 🔮
- [ ] LLM judge system for disputes
- [ ] Real Zest Protocol integration
- [ ] Security audit
- [ ] Mainnet launch

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Clarity |
| L2 | Stacks |
| L1 Security | Bitcoin |
| Testing | Clarinet SDK + Vitest |
| Collateral | USDCx (planned) |
| Oracles | Pyth Network (planned) |

---

## For Developers

```bash
# Install
npm install

# Run all tests (869 tests)
npm test

# Check contracts compile
clarinet check
```

---

## Key Contracts

**Trading:**
| Contract | Purpose | AMM |
|----------|---------|-----|
| `market-pool.clar` | Binary markets (old) | CPMM |
| `multi-market-pool.clar` | Binary markets (new) | pm-AMM |
| `multi-outcome-pool.clar` | 2-10 outcomes | LMSR |
| `pm-amm-core.clar` | Paradigm math library | - |

**Infrastructure:**
| Contract | Purpose |
|----------|---------|
| `market-factory.clar` | Creates singleton markets |
| `sip013-lp-token.clar` | Transferable LP tokens |
| `usdcx.clar` | Mock stablecoin (devnet) |

**Resolution:**
| Contract | Purpose |
|----------|---------|
| `hro-resolver.clar` | Hybrid Resolution Oracle |
| `oracle-resolver.clar` | Auto-resolution via oracle |
| `pyth-oracle-wrapper.clar` | Pyth price feeds |

**Governance:**
| Contract | Purpose |
|----------|---------|
| `governance-token.clar` | $PRED token |
| `vote-escrow.clar` | vePRED staking |
| `governance.clar` | Proposals/voting |
| `quadratic-voting.clar` | Quadratic vote weight |

---

## License

**Business Source License 1.1** (BSL 1.1)

- ✅ View code, fork for learning, contribute
- ❌ Commercial use, competing products, production deploy
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
