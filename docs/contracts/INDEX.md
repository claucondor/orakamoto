# Contract Reference

## Core Trading

| Contract | Purpose | AMM |
|----------|---------|-----|
| [multi-market-pool](./MULTI-MARKET-POOL.md) | Binary markets (YES/NO) | pm-AMM |
| [multi-outcome-pool-v2](./MULTI-OUTCOME-POOL-V2.md) | 2-10 outcome markets | LMSR |
| [market-factory-v3](./MARKET-FACTORY-V3.md) | Market creation + metadata | - |
| [pm-amm-core](./PM-AMM-CORE.md) | Pricing mathematics | - |
| [sip013-lp-token](./SIP013-LP-TOKEN.md) | Transferable LP tokens | - |

## Resolution

| Contract | Purpose |
|----------|---------|
| [hro-resolver](./HRO-RESOLVER.md) | Bond escalation disputes |
| oracle-resolver | Auto-resolution via oracles |
| pyth-oracle-wrapper | Pyth price feed integration |
| quadratic-voting | Reputation-weighted voting |
| ai-oracle-council | AI advisory recommendations |

## Value Layer

| Contract | Purpose |
|----------|---------|
| usdcx | Collateral token (mock) |
| yield-vault | Yield-bearing deposits |
| yield-distributor | Yield distribution to LPs |

## Governance

| Contract | Purpose |
|----------|---------|
| governance-token | $PRED token (SIP-010) |
| vote-escrow | vePRED staking |
| governance | Proposals and voting |
| creator-rewards | Rewards for creators |
| trader-rewards | Rewards for traders |
| lp-rewards | Rewards for LPs |

## Security

| Contract | Purpose |
|----------|---------|
| guardian-multisig | Emergency pause |

## Traits

| Trait | Standard |
|-------|----------|
| sip-010-trait | Fungible tokens |
| sip013-semi-fungible-token-trait | Semi-fungible tokens |
| oracle-trait | Oracle interface |
| prediction-market-trait | Market interface |

## Deprecated

Located in `contracts/deprecated/`:
- market-pool.clar (use multi-market-pool)
- market-factory.clar (use market-factory-v3)
- market-factory-v2.clar (use market-factory-v3)
- multi-outcome-pool.clar (use multi-outcome-pool-v2)
- market-fork.clar (use market-fork-v2 when ready)
