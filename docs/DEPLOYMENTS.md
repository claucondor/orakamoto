# StacksPredict Deployments

This document tracks all deployed contract addresses for StacksPredict across different networks and versions.

---

## Network Summary

| Network | Status | Version | Deployer |
|---------|--------|---------|----------|
| Simnet | Active | V3 | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM |
| Testnet | Pending | V3 | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC |
| Testnet | Active | V2 | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC |
| Mainnet | Not Deployed | - | - |

---

## V3 Deployment (Multi-Market Architecture)

**Status:** Pending Deployment
**Deployment Plan:** `deployments/v3.testnet-plan.yaml`

### Architecture Overview

V3 implements a multi-market architecture based on ALEX Lab's Single Vault Multi-Pool design:

- **SIP-013 LP Tokens**: Transferible liquidity provider tokens
- **Multi-Market Pool**: Single contract handling multiple markets
- **Market Factory V3**: Factory for market creation with metadata

### V3 Contracts (Testnet - Pending)

| Contract | Address (Pending) | Description |
|----------|-------------------|-------------|
| `sip013-semi-fungible-token-trait` | TBD | SIP-013 trait implementation |
| `sip013-lp-token` | TBD | LP token contract (SIP-013) |
| `math-fixed-point` | TBD | Fixed-point math library |
| `pm-amm-core` | TBD | pm-AMM pricing algorithm |
| `multi-market-pool` | TBD | Multi-market pool contract |
| `market-factory-v3` | TBD | Market factory V3 |

### V3 Simnet Addresses (For Testing)

| Contract | Simnet Address |
|----------|----------------|
| `sip013-semi-fungible-token-trait` | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip013-semi-fungible-token-trait |
| `sip013-lp-token` | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip013-lp-token |
| `math-fixed-point` | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.math-fixed-point |
| `pm-amm-core` | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.pm-amm-core |
| `multi-market-pool` | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.multi-market-pool |
| `market-factory-v3` | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-factory-v3 |

---

## V2 Deployment (Legacy)

**Status:** Deployed
**Deployer:** ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC
**Deployment Plan:** `deployments/default.testnet-plan.yaml`

### V2 Testnet Addresses

| Contract | Testnet Address |
|----------|-----------------|
| `sip-010-trait` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.sip-010-trait |
| `ai-oracle-council` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.ai-oracle-council |
| `governance-token` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.governance-token |
| `creator-rewards` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.creator-rewards |
| `vote-escrow` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.vote-escrow |
| `dispute` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.dispute |
| `governance` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.governance |
| `guardian-multisig` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.guardian-multisig |
| `hro-resolver` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.hro-resolver |
| `lp-rewards` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.lp-rewards |
| `market-factory` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-factory |
| `market-fork` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-fork |
| `prediction-market-trait` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.prediction-market-trait |
| `yield-distributor` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.yield-distributor |
| `market-pool` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-pool |
| `oracle-trait` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.oracle-trait |
| `mock-oracle` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.mock-oracle |
| `mock-usdc` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.mock-usdc |
| `multi-outcome-pool` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-outcome-pool |
| `oracle-resolver` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.oracle-resolver |
| `pyth-oracle-wrapper` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.pyth-oracle-wrapper |
| `reputation-registry` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.reputation-registry |
| `quadratic-voting` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.quadratic-voting |
| `trader-rewards` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.trader-rewards |
| `vesting-vault` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.vesting-vault |
| `yield-vault` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.yield-vault |
| `market-factory-v2` | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-factory-v2 |

### Pyth Oracle Requirements (Testnet)

| Contract | Original Address | Remapped Address |
|----------|------------------|------------------|
| `wormhole-traits-v2` | SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC |
| `pyth-traits-v2` | SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC |
| `pyth-governance-v3` | SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC |
| `pyth-oracle-v4` | SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y | ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC |

---

## Deployment Instructions

### V3 Deployment

1. **Generate Deployment Plan:**
   ```bash
   clarinet deployments generate --testnet
   ```

2. **Review the deployment plan:**
   ```bash
   cat deployments/v3.testnet-plan.yaml
   ```

3. **Deploy to Testnet:**
   ```bash
   clarinet deployments apply -p deployments/v3.testnet-plan.yaml
   ```

4. **Update this document** with the deployed contract addresses.

### Verification

After deployment, verify contracts are working:

```bash
# Create a test market
clarinet console --testnet
> (contract-call? .market-factory-v3 create-market "Test market?" u1000 u10000 u10000000)
```

---

## External Dependencies

### USDCx (Circle xReserve)

| Network | Contract Address |
|---------|------------------|
| Testnet | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx |
| Mainnet | SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx |

### Pyth Oracle

| Network | Contract Address |
|---------|------------------|
| Testnet | SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4 |
| Mainnet | SP1HHHKP08D9EM8HM4SZEE4HRSVSC7S3S8Q7V3K6Q.pyth-oracle-v4 |

---

## Migration Notes

### V2 to V3 Migration

The V3 architecture is a **breaking change** from V2:

- **LP Tokens**: V2 uses internal maps, V3 uses SIP-013 transferable tokens
- **Market Creation**: V2 uses market-pool (singleton), V3 uses multi-market-pool
- **Factory**: V2 uses market-factory-v2, V3 uses market-factory-v3

**Migration Steps:**
1. Deploy V3 contracts alongside V2
2. Users withdraw liquidity from V2 markets
3. Create new markets using V3 factory
4. V2 contracts remain for historical data

---

## Architecture Comparison

| Feature | V2 | V3 |
|---------|-----|-----|
| Markets per Contract | 1 (Singleton) | Unlimited |
| LP Token Standard | Internal Maps | SIP-013 (Transferible) |
| YES/NO Tokens | Internal Maps | Internal Maps |
| Pricing | LMSR | pm-AMM (optional) |
| Factory | market-factory-v2 | market-factory-v3 |
| Composability | Limited | Full DeFi Integration |

---

## Security Considerations

- **Deployer**: ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC
- **Main Contract**: multi-market-pool
- **Admin Functions**: Creator resolution, market deactivation
- **Critical Parameters**: Trading fee (1%), Dispute window (1008 blocks)

---

## Troubleshooting

### Common Issues

1. **USDCx Not Found (Devnet)**
   - USDCx is only available on testnet/mainnet
   - Use mock-usdc for local development

2. **Authorization Errors**
   - Ensure LP token has authorized-minter set to multi-market-pool
   - Check contract-caller vs tx-sender in authorization logic

3. **Deployment Cost Too High**
   - Use `--manual-cost` flag: `clarinet deployments generate --testnet --manual-cost`

---

## References

- [PRD-v3 Multi-Market](../PRD-v3-multi-market.md)
- [ALEX Trading Pool Architecture](https://alexlab.co/blog/introducing-trading-pool)
- [SIP-013 Standard](https://github.com/stacksgov/sips/blob/main/sips/sip-013/sip-013-semi-fungible-token-standard.md)
- [pm-AMM Paper](https://www.paradigm.xyz/2024/11/pm-amm)

---

*Last Updated: 2026-01-23*
