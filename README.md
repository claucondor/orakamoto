# Orakamoto

**Prediction Markets on Bitcoin**

Decentralized prediction markets built on Stacks (Bitcoin L2). Create markets, trade outcomes, provide liquidity, earn yield — secured by Bitcoin.

---

## Quick Start

```bash
npm install
npm test        # Run tests
clarinet check  # Verify contracts
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Roadmap](./docs/ROADMAP.md) | Development phases and milestones |
| [Contract Reference](./docs/contracts/INDEX.md) | All contracts with detailed docs |
| [CLAUDE.md](./CLAUDE.md) | Development guidelines |

---

## How It Works

```
1. Creator deposits USDCx → Creates market
2. LPs add liquidity → Earn trading fees
3. Traders buy YES/NO → Price = probability
4. Event happens → Creator resolves
5. Winners claim → 1 token = 1 USDCx
```

### Market Types

| Type | AMM | Outcomes | Contract |
|------|-----|----------|----------|
| Binary | [pm-AMM](./docs/contracts/PM-AMM-CORE.md) | YES/NO | multi-market-pool |
| Multi-outcome | [LMSR](./docs/contracts/MULTI-OUTCOME-POOL-V2.md) | 2-10 | multi-outcome-pool-v2 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      ORAKAMOTO                          │
├─────────────────────────────────────────────────────────┤
│  TRADING        multi-market-pool (pm-AMM)              │
│                 multi-outcome-pool-v2 (LMSR)            │
├─────────────────────────────────────────────────────────┤
│  RESOLUTION     Manual | Oracle (Pyth) | HRO (Disputes) │
├─────────────────────────────────────────────────────────┤
│  VALUE          SIP-013 LP Tokens | Yield (Zest)        │
├─────────────────────────────────────────────────────────┤
│  GOVERNANCE     $PRED Token | vePRED | Voting           │
├─────────────────────────────────────────────────────────┤
│  COLLATERAL     USDCx (Circle xReserve)                 │
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

**MVP Ready (devnet):**
- Binary markets with pm-AMM
- Multi-market pool (unlimited markets)
- SIP-013 LP tokens (transferable)
- Market factory with metadata

**In Progress:**
- Multi-outcome markets (LMSR)

**Planned:**
- Oracle auto-resolution
- Dispute system
- Governance & rewards

See [Roadmap](./docs/ROADMAP.md) for details.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Clarity |
| L2 | Stacks |
| L1 | Bitcoin |
| Testing | Clarinet SDK + Vitest |
| Collateral | USDCx |
| Oracles | Pyth Network |

---

## License

**Business Source License 1.1** (BSL 1.1)

- View, fork, contribute
- No commercial use until license change
- Converts to MIT after 4 years

Same model as [Uniswap V3/V4](https://github.com/Uniswap/v3-core/blob/main/LICENSE).

---

## About

Built by **Claudio Condor** ([@elcondor99](https://x.com/elcondor99))

Open to collaborations.

---

<p align="center">
  <i>Built on Bitcoin. Powered by Stacks. Inspired by Satoshi.</i>
</p>
