#!/bin/bash
# Deploy Phase 0 contracts to testnet with real USDCx
# This script temporarily updates contract references, deploys, then reverts

set -e

DEPLOYER="ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC"
USDCX_TESTNET="'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx"

# Phase 0 contracts that reference .usdcx
CONTRACTS=(
  "contracts/multi-market-pool.clar"
)

echo "=========================================="
echo "Phase 0 Testnet Deployment"
echo "=========================================="
echo "Deployer: $DEPLOYER"
echo "USDCx: $USDCX_TESTNET"
echo ""

# Step 1: Backup contracts
echo "[1/4] Creating backups..."
for contract in "${CONTRACTS[@]}"; do
  cp "$contract" "${contract}.backup"
  echo "  ✓ Backed up $contract"
done

# Step 2: Update references to testnet USDCx
echo "[2/4] Updating USDCx references for testnet..."
for contract in "${CONTRACTS[@]}"; do
  # Replace .usdcx with testnet USDCx address
  sed -i "s/(contract-call? \.usdcx/(contract-call? $USDCX_TESTNET/g" "$contract"
  echo "  ✓ Updated $contract"
done

# Verify contracts still compile
echo "[3/4] Verifying contracts compile..."
if ! clarinet check > /dev/null 2>&1; then
  echo "ERROR: Contracts don't compile after modification!"
  echo "Restoring backups..."
  for contract in "${CONTRACTS[@]}"; do
    mv "${contract}.backup" "$contract"
  done
  exit 1
fi
echo "  ✓ Contracts compile"

# Step 4: Deploy
echo "[4/4] Deploying to testnet..."
echo ""
echo "Run this command to deploy:"
echo ""
echo "  clarinet deployments apply -p deployments/phase0.testnet-plan.yaml"
echo ""
echo "After deployment completes, restore originals with:"
echo ""
echo "  ./scripts/restore-phase0-contracts.sh"
echo ""
echo "=========================================="
