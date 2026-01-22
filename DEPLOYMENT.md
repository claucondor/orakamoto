# StacksPredict Deployment Guide

## Prerequisites

- Clarinet CLI installed (v3.13.1+)
- Node.js v18+ for wallet generation
- Testnet STX tokens (get from https://explorer.hiro.so/sandbox/faucet?chain=testnet)

## Network Configuration

Update `settings/Testnet.toml` or `settings/Mainnet.toml` with your deployer wallet:

```toml
[accounts.deployer]
mnemonic = "your twelve word mnemonic phrase here"
stx_address = "ST..." # Testnet address starts with ST, mainnet with SP
```

## Deployment Steps

### 1. Generate Deployment Plan

For testnet with manual cost estimation (recommended):

```bash
clarinet deployments generate --testnet --manual-cost
```

For mainnet:

```bash
clarinet deployments generate --mainnet --manual-cost
```

**Note:** Avoid `--low-cost`, `--medium-cost`, or `--high-cost` as they may calculate inflated fees during network congestion.

### 2. Review Deployment Plan

Check the generated plan:

```bash
cat deployments/default.testnet-plan.yaml
```

Verify:
- Expected sender addresses match your wallet
- Costs are reasonable (not 25M+ STX per contract)
- Clarity versions match contract requirements (v2 for most, v3 for Pyth contracts)

### 3. Deploy All Contracts

Deploy all 31 contracts in batches:

```bash
clarinet deployments apply --testnet
```

Press `Y` when prompted to confirm.

**Expected batches:**
- Batch 0 (epoch 2.1): 25 core contracts with Clarity 2
- Batch 1 (epoch 2.1): 2 vault contracts (vesting-vault, yield-vault)  
- Batch 2 (epoch 3.2): 4 Pyth oracle contracts with Clarity 3

### 4. Handle Partial Deployment

If deployment stops after batch 0 or 1, deploy remaining contracts separately:

```bash
clarinet deployments apply -p deployments/pyth-only.testnet-plan.yaml
```

### 5. Verify Deployment

Check all contracts deployed successfully:

```bash
curl -s "https://api.testnet.hiro.so/extended/v1/address/<YOUR_ADDRESS>/transactions?limit=50" | grep -c '"tx_status":"success"'
```

Or view in explorer:
- Testnet: `https://explorer.hiro.so/address/<YOUR_ADDRESS>?chain=testnet`
- Mainnet: `https://explorer.hiro.so/address/<YOUR_ADDRESS>?chain=mainnet`

## Contract Dependencies

Contracts must be deployed in order due to dependencies:

1. **Traits** (no dependencies):
   - sip-010-trait
   - oracle-trait
   - prediction-market-trait

2. **Core Tokens**:
   - governance-token (depends on sip-010-trait)
   - mock-usdc (depends on sip-010-trait)

3. **Governance & Infrastructure**:
   - vote-escrow (depends on governance-token)
   - governance (depends on vote-escrow, governance-token)
   - guardian-multisig
   - dispute

4. **Markets & Pools**:
   - market-factory
   - market-fork
   - market-pool (depends on sip-010-trait)
   - multi-outcome-pool (depends on sip-010-trait)
   - mock-zest-vault

5. **Oracles**:
   - oracle-resolver (depends on oracle-trait)
   - mock-oracle (depends on oracle-trait)
   - pyth-oracle-wrapper
   - hro-resolver

6. **Rewards**:
   - creator-rewards (depends on governance-token)
   - lp-rewards (depends on governance-token)
   - trader-rewards (depends on governance-token)
   - yield-distributor

7. **Vaults**:
   - vesting-vault
   - yield-vault

8. **External Requirements** (Clarity 3):
   - wormhole-traits-v2
   - pyth-traits-v2
   - pyth-governance-v3
   - pyth-oracle-v4

## Troubleshooting

### Error: ContractAlreadyExists

Some contracts are already deployed. Options:
1. Use a new wallet address
2. Deploy only missing contracts using a custom plan
3. Add version suffix to contract names in Clarinet.toml

### Error: abort_by_response - "use of unresolved function 'as-contract'"

Contracts are using Clarity 2 features but deployment plan specifies Clarity 1.

**Fix:** Ensure `Clarinet.toml` has:
```toml
clarity_version = 2
epoch = '2.1'
```

Then regenerate deployment plan.

### Error: "Clarity 2 can not be used with 2.05"

Update epoch in `Clarinet.toml`:
```toml
epoch = '2.1'  # Changed from 2.05
```

### High Transaction Costs (25M+ STX)

Network fee estimation is inflated. Use `--manual-cost` instead:
```bash
clarinet deployments generate --testnet --manual-cost
```

## Deployed Testnet Contract

**Deployer Address:** `ST7NF22X51JPBHWRDCM29FKFJ8NSWY4NEW7ZEMZF`

All 31 contracts deployed successfully on testnet.

View deployment:
https://explorer.hiro.so/address/ST7NF22X51JPBHWRDCM29FKFJ8NSWY4NEW7ZEMZF?chain=testnet

## Cost Estimates

Approximate deployment costs with manual cost estimation:
- Testnet: ~3.5 STX total (500 STX faucet is sufficient)
- Mainnet: Similar microSTX amounts (verify current fee rates)

## Notes

- Clarity 2 contracts (epochs 2.05-2.1): Most core contracts
- Clarity 3 contracts (epoch 3.2): Pyth oracle integration only
- Deployment takes ~15-30 minutes due to anchor block confirmations
- Each batch waits for previous batch to confirm before broadcasting
