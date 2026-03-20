# Orakamoto

**Bitcoin Prediction Markets Powered by USDCx**

A decentralized prediction market protocol built on Stacks (Bitcoin L2). Create markets on any event, trade with real USDC via Circle's xReserve, provide liquidity, and earn fees — all secured by Bitcoin's finality.

---

## 🚀 Live Demo

**Testnet:** [orakamoto.vercel.app](https://orakamoto.vercel.app) *(Deploy in progress)*

**Try it now:**
1. Bridge USDC from Ethereum Sepolia → Stacks testnet
2. Create a prediction market (e.g., "Will Bitcoin hit $120k by Feb 2026?")
3. Trade YES/NO tokens using our pm-AMM algorithm
4. Add liquidity and earn 3-20% fees

---

## What Makes Orakamoto Unique

### 🎯 Real USDC Integration
- **Circle xReserve Bridge**: Integrated directly in the UI
- **USDCx on Stacks**: Real USDC, not wrapped tokens
- **Seamless UX**: Bridge from Ethereum in 1 click

### 🧮 Advanced AMM
- **pm-AMM Algorithm**: From [Paradigm Research](https://www.paradigm.xyz/2024/11/pm-amm)
- **Uniform LVR**: Optimized pricing across all probabilities
- **Efficient Liquidity**: Low slippage even with small pools

### 💎 Bitcoin Security
- **Built on Stacks**: Smart contracts inherit Bitcoin's finality
- **No Custody**: Fully on-chain, non-custodial
- **Transparent**: All trades, fees, and settlements verifiable

### 💰 Transferable LP Tokens
- **SIP-013 Standard**: LP positions are NFTs you can trade
- **DeFi Composable**: Use LP tokens as collateral
- **Exit Anytime**: Remove liquidity whenever you want

---

## How It Works

```
1. Creator deposits 10+ USDCx → Creates market
   "Will BTC hit $100k by March 2026?"

2. LPs add liquidity → Earn 3-20% trading fees
   Pool starts at 50% YES / 50% NO

3. Traders buy YES/NO tokens → Price reflects probability
   Buy YES → Price rises to 65%
   Buy NO → Price drops to 35%

4. Event happens → Creator resolves outcome
   Or gets disputed via HRO (Human Resolution Oracle)

5. Winners claim → 1 winning token = 1 USDCx
   Losers lose their stake
```

---

## Architecture

### Current Stack (V3.1)

```
┌────────────────────────────────────────────────────┐
│                    ORAKAMOTO                       │
├────────────────────────────────────────────────────┤
│                                                    │
│  FRONTEND (Next.js 14 + TypeScript)                │
│  ├─ wagmi + viem (Ethereum bridge)                 │
│  ├─ @stacks/connect (Wallet integration)           │
│  └─ xReserve bridge UI                             │
│                                                    │
│  SMART CONTRACTS (Clarity 3.0)                     │
│  ├─ multi-market-pool-v3-1.clar                    │
│  │   • Single pool, unlimited markets              │
│  │   • pm-AMM pricing (Paradigm Research)          │
│  │   • Dynamic fees (3%-20% lifecycle-based)       │
│  │   • Slippage protection                         │
│  │                                                  │
│  ├─ sip013-lp-token-v1-1.clar                      │
│  │   • Transferable LP tokens (SIP-013 NFTs)       │
│  │   • DeFi composable                             │
│  │                                                  │
│  ├─ pm-amm-core-v2.clar                            │
│  │   • Gaussian pricing algorithm                  │
│  │   • Fixed-point math (8 decimals)               │
│  │                                                  │
│  └─ market-factory-v3.clar                         │
│      • Market creation & metadata                  │
│      • Categories, tags, featured markets          │
│                                                    │
│  COLLATERAL: USDCx (Circle xReserve)               │
│  └─ ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx│
│                                                    │
└────────────────────────────────────────────────────┘
                       │
                       ▼
            ┌──────────────────┐
            │   Stacks L2      │
            │  (Nakamoto)      │
            └──────────────────┘
                       │
                       ▼
            ┌──────────────────┐
            │     Bitcoin      │
            │   (Finality)     │
            └──────────────────┘
```

### Roadmap Components

| Component | Status | Notes |
|-----------|--------|-------|
| **Phase 0: Core (LIVE)** | | |
| Binary Markets (pm-AMM) | ✅ Deployed | V3.1 on testnet |
| USDCx Integration | ✅ Live | Circle xReserve bridge working |
| SIP-013 LP Tokens | ✅ Live | Transferable positions |
| Market Factory v3 | ✅ Live | Categories, metadata |
| Frontend | ✅ Live | Next.js + wagmi + Stacks Connect |
| **Phase 1: Quality** | | |
| 10 USDC minimum liquidity | 📋 Planned | Prevent illiquid markets |
| Market proposals | 📋 Planned | Community validation |
| Liquidity crowdfunding | 📋 Planned | Reach 100 USDC target |
| **Phase 2: Automation** | | |
| Pyth Oracle Integration | 📋 Planned | Automated BTC price resolution |
| Multi-outcome pools (LMSR) | 📋 Planned | 2-10 outcomes per market |
| **Phase 3: Governance** | | |
| $PRED token | 📋 Planned | Governance + rewards |
| Dispute system (HRO) | 📋 Planned | Bond escalation voting |

See [ROADMAP.md](./docs/ROADMAP.md) for detailed phases.

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Smart Contracts** | Clarity 3.0 | Type-safe, Bitcoin-secured contracts |
| **L2** | Stacks (Nakamoto) | Fast transactions, Bitcoin finality |
| **L1 Security** | Bitcoin | Final settlement layer |
| **Frontend** | Next.js 14 + TypeScript | React-based UI |
| **Ethereum Bridge** | wagmi + viem | xReserve integration |
| **Stacks Wallet** | @stacks/connect | Hiro/Leather wallet support |
| **Collateral** | USDCx | Circle's official USDC on Stacks |
| **Testing** | Vitest + Clarinet SDK | 50+ unit tests |
| **AMM** | pm-AMM (Paradigm) | Gaussian pricing algorithm |

---

## 📊 Current Stats (Testnet)

- **V3.1 Deployed:** January 24, 2026
- **Total Markets:** 4 active markets
- **Total Liquidity:** ~18 USDCx
- **Total Trades:** 15+ transactions
- **LP Positions:** 5 active LPs
- **Fees Earned:** 0.5+ USDCx distributed

*Updated: Mar 2026*

---

## 🏁 Quick Start

### For Users (No Code)

1. **Get USDCx on Stacks testnet:**
   - Option A: Bridge from Ethereum Sepolia via [orakamoto.vercel.app/bridge](https://orakamoto.vercel.app/bridge)
   - Option B: Use testnet faucet at [orakamoto.vercel.app/faucet](https://orakamoto.vercel.app/faucet)

2. **Create or Trade:**
   - Create a market: Set question, deadline, add initial liquidity
   - Trade on existing: Buy YES/NO tokens based on your prediction
   - Provide liquidity: Earn 3-20% fees on all trades

### For Developers

```bash
# Clone the repo
git clone https://github.com/claucondor/orakamoto.git
cd orakamoto

# Install dependencies
npm install

# Run tests (50+ tests)
npm test

# Check contracts compile
clarinet check

# Run frontend (Next.js)
cd frontend
npm install
npm run dev
# Visit http://localhost:3000
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [ROADMAP.md](./docs/ROADMAP.md) | Development phases (0 → 3) |
| [V3-1-DEPLOYMENT-PLAN.md](./docs/V3-1-DEPLOYMENT-PLAN.md) | V3.1 deployment guide |
| [TESTNET-TESTING.md](./docs/TESTNET-TESTING.md) | Testing procedures |
| [PM-AMM-CORE.md](./docs/contracts/PM-AMM-CORE.md) | AMM algorithm explained |

---

## 🤝 Contributing & Collaboration

**We're looking for collaborators!**

Orakamoto is built solo but open to contributors. We need help with:

### 🎨 Frontend/Design
- UI/UX improvements
- Mobile responsiveness
- Chart visualizations
- Wallet integrations

### 🔧 Smart Contracts
- Gas optimizations
- Security audits
- Oracle integrations
- Multi-outcome pools (LMSR)

### 📊 Data/Analytics
- Market analytics dashboard
- Historical data indexing
- API endpoints
- Trading metrics

### 🌐 Community
- Documentation
- Tutorials
- Twitter/Discord management
- Partnership outreach

**How to contribute:**
1. Fork the repo
2. Create a feature branch
3. Submit a PR with clear description
4. Join discussions in GitHub Issues

**Contact:**
- **X/Twitter:** [@elcondor99](https://x.com/elcondor99)
- **GitHub:** [@claucondor](https://github.com/claucondor)
- **Email:** Open an issue first

---


## 📜 License

**Business Source License 1.1** (BSL 1.1)

- ✅ View code, fork for learning, contribute
- ✅ Use for non-commercial purposes
- ❌ Commercial competing products
- 📅 Converts to MIT after 4 years (Jan 2030)

Same model as [Uniswap V3/V4](https://github.com/Uniswap/v3-core/blob/main/LICENSE).

**Why BSL 1.1?**
- Encourages open-source contributions
- Prevents direct commercial forks
- Eventually becomes fully open (MIT)
- Protects solo dev investment

---

## 🙏 Acknowledgments

**Built on top of giants:**

- **Paradigm Research** - pm-AMM algorithm design
- **Circle** - USDCx and xReserve protocol
- **Stacks Foundation** - Clarity language and tooling
- **ALEX Lab** - Fixed-point math library
- **Hiro** - Clarinet SDK and infrastructure
- **Bitcoin** - For being Bitcoin

---

## About the Builder

**Claudio Condor** - [@elcondor99](https://x.com/elcondor99)

Solo developer building prediction markets on Bitcoin because:
1. Polymarket proved $3B demand exists
2. Bitcoin needs DeFi applications
3. Stacks + USDCx make it possible now
4. Prediction markets should be decentralized

**No VC. No team. Just shipping code.**

Open to collaboration, partnerships, and building in public.

---

<p align="center">
  <strong>Built on Bitcoin. Powered by USDCx. Inspired by Satoshi.</strong>
</p>

<p align="center">
  <a href="https://orakamoto.vercel.app">Demo</a> •
  <a href="https://github.com/claucondor/orakamoto">GitHub</a> •
  <a href="https://x.com/elcondor99">Twitter</a>
</p>
