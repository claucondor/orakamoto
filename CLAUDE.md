# Claude Code Project Instructions - Orakamoto

## Project Overview
Prediction markets on Bitcoin (Stacks L2). Binary and multi-outcome markets with pm-AMM pricing.

## Contract Architecture (V3 - Current)

### Active Contracts (USE THESE)
| Contract | Purpose |
|----------|---------|
| `multi-market-pool.clar` | Multi-market pool with pm-AMM pricing, SIP-013 LP tokens |
| `market-factory-v3.clar` | Factory with metadata (categories, tags, featured) |
| `multi-outcome-pool.clar` | LMSR for 2-10 outcomes (needs V3 migration - see TODO in file) |
| `market-fork.clar` | Fork system for disputes (needs V3 migration - see TODO in file) |

### Deprecated Contracts (DO NOT USE OR DEPLOY)
Located in `contracts/deprecated/`:

| Contract | Why Deprecated | Replaced By |
|----------|---------------|-------------|
| `market-pool.clar` | Singleton model, CPMM pricing | `multi-market-pool.clar` |
| `market-factory.clar` | Points to deprecated market-pool | `market-factory-v3.clar` |
| `market-factory-v2.clar` | Same as v1, just lower collateral | `market-factory-v3.clar` |

**IMPORTANT: Never deploy deprecated contracts to testnet/mainnet.** They exist only for:
- Historical reference
- Test coverage validation
- Understanding protocol evolution

### Contracts Needing V3 Migration
These contracts have TODO headers explaining what needs to change:

1. **multi-outcome-pool.clar** (Priority: Medium)
   - Convert from singleton to multi-market model
   - Add SIP-013 LP token support
   - Integrate with market-factory-v3

2. **market-fork.clar** (Priority: Low)
   - Update to work with multi-market-pool
   - Integrate with hro-resolver for dispute flow

## Deployment Rules

### Testnet/Mainnet Deployment
Only deploy these contracts:
- `multi-market-pool.clar`
- `market-factory-v3.clar`
- `sip013-lp-token.clar`
- `pm-amm-core.clar`
- `usdcx.clar` (or use real USDCx address)
- Supporting contracts (governance, oracles, etc.)

### Never Deploy
- Anything in `contracts/deprecated/`
- These are kept in Clarinet.toml only for test compatibility

## Test Organization

### Active Tests
All tests in `tests/` root folder.

### Deprecated Tests
Located in `tests/deprecated/`:
- `market-pool.test.ts`
- `market-factory.test.ts`
- `multi-outcome-factory.test.ts`

These tests validate deprecated contracts still compile and work for historical reference.

## Key Constants
```
PRECISION = u1000000 (6 decimals)
TRADING-FEE-BP = u100 (1%)
DISPUTE-WINDOW = u1008 (~7 days)
```

## Quick Commands
```bash
npm test              # Run all tests
clarinet check        # Verify contracts compile
```
