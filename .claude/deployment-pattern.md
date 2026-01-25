# Clarity Deployment Pattern: Simnet/Testnet/Mainnet Contract References

## Problem

Clarity contracts need different contract references for different networks:

- **Simnet:** `.usdcx` (local mock contract)
- **Testnet:** `'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx` (testnet USDCx)
- **Mainnet:** `'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx` (mainnet USDCx)

You can't deploy the same `.clar` file to testnet/mainnet if it references `.usdcx` - the contract will fail because `.usdcx` doesn't exist on those networks.

## Solution: Backup-Modify-Deploy-Restore Pattern

This pattern temporarily modifies contracts for deployment, then restores them for local development.

### Step 1: Create Deployment Script (`deploy-<phase>-<network>.sh`)

```bash
#!/bin/bash
set -e

DEPLOYER="ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC"
USDCX_TESTNET="'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx"

# Contracts that need modification
CONTRACTS=(
  "contracts/multi-market-pool-v3.clar"
  "contracts/market-factory-v3.clar"
)

# 1. Backup
for contract in "${CONTRACTS[@]}"; do
  cp "$contract" "${contract}.backup"
done

# 2. Replace references
for contract in "${CONTRACTS[@]}"; do
  sed -i "s/(contract-call? \.usdcx/(contract-call? $USDCX_TESTNET/g" "$contract"
done

# 3. Verify compilation
if ! clarinet check > /dev/null 2>&1; then
  echo "ERROR: Contracts don't compile!"
  # Restore on error
  for contract in "${CONTRACTS[@]}"; do
    mv "${contract}.backup" "$contract"
  done
  exit 1
fi

echo "Ready to deploy:"
echo "  clarinet deployments apply -p deployments/phase0-v3.testnet-plan.yaml"
echo ""
echo "After deployment, restore with:"
echo "  ./scripts/restore-phase0-v3-contracts.sh"
```

### Step 2: Create Restore Script (`restore-<phase>-contracts.sh`)

```bash
#!/bin/bash
set -e

CONTRACTS=(
  "contracts/multi-market-pool-v3.clar"
  "contracts/market-factory-v3.clar"
)

for contract in "${CONTRACTS[@]}"; do
  if [ -f "${contract}.backup" ]; then
    mv "${contract}.backup" "$contract"
    echo "✓ Restored $contract"
  fi
done
```

### Step 3: Create Deployment Plan (`deployments/<phase>-<network>.yaml`)

```yaml
---
id: 0
name: Phase 0 V3 Testnet Deployment
network: testnet
stacks-node: "https://api.testnet.hiro.so"
plan:
  batches:
    - id: 0
      transactions:
        - contract-publish:
            contract-name: multi-market-pool-v3
            expected-sender: ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC
            cost: 450000
            path: contracts/multi-market-pool-v3.clar
            clarity-version: 3
      epoch: "3.0"
```

## Workflow

1. **Prepare for deployment:**
   ```bash
   ./scripts/deploy-phase0-v3-testnet.sh
   ```
   - Creates `.backup` files
   - Modifies contracts with testnet references
   - Verifies compilation

2. **Deploy:**
   ```bash
   clarinet deployments apply -p deployments/phase0-v3.testnet-plan.yaml
   ```

3. **Restore to simnet:**
   ```bash
   ./scripts/restore-phase0-v3-contracts.sh
   ```
   - Restores original files from `.backup`
   - Now contracts work with simnet again

## Why This Works

- **Simnet:** Uses `.usdcx` (relative reference, deployed in same project)
- **Testnet/Mainnet:** Uses `'ADDRESS.usdcx` (absolute reference, external contract)
- **Backups:** Ensure you can revert to simnet-compatible code
- **Verification:** `clarinet check` catches errors before deployment

## Common Contracts to Replace

| Contract Type | Simnet | Testnet | Mainnet |
|--------------|--------|---------|---------|
| USDCx | `.usdcx` | `'ST1PQ...M.usdcx` | `'SP120...NE.usdcx` |
| LP Token | `.sip013-lp-token` | `'ST3TM...FC.sip013-lp-token` | (same deployer) |
| Pool Trait | `.pool-trait` | `'ST3TM...FC.pool-trait` | (same deployer) |

## Example: StacksPredict Phase 0 V3

**Files:**
- `scripts/deploy-phase0-v3-testnet.sh`
- `scripts/restore-phase0-v3-contracts.sh`
- `deployments/phase0-v3.testnet-plan.yaml`

**Contracts Modified:**
- `multi-market-pool-v3.clar` (calls `.usdcx`)
- `market-factory-v3.clar` (calls `.multi-market-pool-v3`)
- `market-fork-v2.clar` (calls `.multi-market-pool-v3`)

**Testnet Deployment:**
```bash
./scripts/deploy-phase0-v3-testnet.sh
clarinet deployments apply -p deployments/phase0-v3.testnet-plan.yaml
./scripts/restore-phase0-v3-contracts.sh
```

## Best Practices

1. **Always backup before modifying**
2. **Verify compilation after replacement** (`clarinet check`)
3. **Restore immediately after deployment**
4. **Don't commit `.backup` files** (add to `.gitignore`)
5. **Document which contracts need modification** (in script comments)
6. **Use clear naming:** `deploy-<phase>-<network>.sh`

## Troubleshooting

**Q: Deployment fails with "contract not found"**
A: The replaced reference is wrong. Check the actual deployed address on the network.

**Q: Can't restore, backup missing**
A: Git restore: `git checkout contracts/your-contract.clar`

**Q: Simnet tests fail after deployment**
A: You forgot to restore. Run `./scripts/restore-<phase>-contracts.sh`

## Alternative: Environment Variables (Not Recommended)

Clarity doesn't support env vars in contract code, so you'd need:
- Build pipeline to generate different `.clar` files
- Risk of deploying wrong version
- More complex than backup-restore pattern

**Stick with backup-restore pattern** - it's simple, explicit, and safe.
