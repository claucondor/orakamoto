# Token Configuration Guide

## Problem Solved

Hardcoded USDCx principal doesn't exist in simnet (local environment). Clarity doesn't support dynamic contract calls, so we can't use trait parameters at runtime.

## Solution: Configuration Constant

All contracts now use `TOKEN-CONTRACT` constant that must be changed before deployment:

```clarity
;; Token Contract Configuration
;; IMPORTANT: Change this before deployment to testnet/mainnet
;; Simnet/Devnet: .mock-usdc
;; Testnet: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
;; Mainnet: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
(define-constant TOKEN-CONTRACT .mock-usdc)
```

## Contracts with TOKEN-CONTRACT

- `contracts/market-factory.clar`
- `contracts/market-pool.clar`
- `contracts/multi-outcome-pool.clar`
- `contracts/yield-vault.clar`
- `contracts/mocks/mock-zest-vault.clar`

## How to Deploy to Testnet with USDCx

### Step 1: Update All Contracts

Run this command to update all contracts for testnet:

```bash
# Replace .mock-usdc with USDCx testnet address
find contracts -name "*.clar" -exec sed -i 's/(define-constant TOKEN-CONTRACT .mock-usdc)/(define-constant TOKEN-CONTRACT '\''ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx)/g' {} \;
```

### Step 2: Verify Changes

```bash
# Check that all contracts now reference USDCx
grep "TOKEN-CONTRACT" contracts/*.clar contracts/**/*.clar
```

Should show:
```
(define-constant TOKEN-CONTRACT 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx)
```

### Step 3: Generate Deployment Plan

```bash
clarinet deployments generate --testnet --manual-cost
```

### Step 4: Deploy

```bash
clarinet deployments apply -p deployments/default.testnet-plan.yaml
```

### Step 5: Revert to mock-usdc for Local Development

After deployment, revert back to use mock-usdc locally:

```bash
find contracts -name "*.clar" -exec sed -i 's/(define-constant TOKEN-CONTRACT '\''ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx)/(define-constant TOKEN-CONTRACT .mock-usdc)/g' {} \;
```

## Why This Approach?

### Clarity Limitations

Clarity doesn't support:
- ❌ Dynamic contract calls (can't store principal and call it)
- ❌ Runtime trait resolution
- ❌ Conditional compilation (#ifdef)

### Supported Approach

✅ **Compile-time constants** - Change constant before deployment

### Alternative: Multiple Versions

Could maintain separate contract versions:
- `market-factory.clar` (simnet - uses mock-usdc)
- `market-factory-testnet.clar` (testnet - uses USDCx)

But single contract with configurable constant is simpler.

## Testing

### Local Testing (Simnet)

```bash
clarinet check
clarinet test
```

Uses `.mock-usdc` automatically.

### Testnet Testing

1. Update TOKEN-CONTRACT to USDCx
2. Deploy to testnet
3. Test via frontend or scripts
4. Revert TOKEN-CONTRACT to mock-usdc

## Script for Easy Switching

Create `scripts/switch-token.sh`:

```bash
#!/bin/bash

TOKEN=$1

if [ "$TOKEN" = "usdcx-testnet" ]; then
  echo "Switching to USDCx Testnet..."
  find contracts -name "*.clar" -exec sed -i 's/(define-constant TOKEN-CONTRACT .*)/(define-constant TOKEN-CONTRACT '\''ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx)/g' {} \;
elif [ "$TOKEN" = "usdcx-mainnet" ]; then
  echo "Switching to USDCx Mainnet..."
  find contracts -name "*.clar" -exec sed -i 's/(define-constant TOKEN-CONTRACT .*)/(define-constant TOKEN-CONTRACT '\''SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)/g' {} \;
elif [ "$TOKEN" = "mock-usdc" ]; then
  echo "Switching to mock-usdc (local)..."
  find contracts -name "*.clar" -exec sed -i 's/(define-constant TOKEN-CONTRACT .*)/(define-constant TOKEN-CONTRACT .mock-usdc)/g' {} \;
else
  echo "Usage: ./scripts/switch-token.sh [usdcx-testnet|usdcx-mainnet|mock-usdc]"
  exit 1
fi

echo "✅ Switched to $TOKEN"
echo "Run 'clarinet check' to verify"
```

Usage:
```bash
chmod +x scripts/switch-token.sh

# For testnet deployment
./scripts/switch-token.sh usdcx-testnet

# For local development
./scripts/switch-token.sh mock-usdc

# For mainnet deployment
./scripts/switch-token.sh usdcx-mainnet
```

## Summary

✅ **Contracts compile** in simnet (use mock-usdc)
✅ **Easy to switch** to USDCx for testnet/mainnet
✅ **No runtime overhead** (compile-time constant)
✅ **Same code** works for all environments

Just remember: **Change TOKEN-CONTRACT before deploying to testnet/mainnet!**
