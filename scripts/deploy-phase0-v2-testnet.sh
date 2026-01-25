#!/bin/bash
# Deploy Phase 0 V2 contracts to testnet with real USDCx
# This script temporarily updates contract references, deploys, then reverts
#
# V2 Changes:
# - Uses stacks-block-height instead of block-height (Clarity 3 Nakamoto compatibility)
# - Includes guardian recovery mechanism for unhealthy markets
# - Emergency withdrawal for LPs from corrupted markets

set -e

DEPLOYER="ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC"
USDCX_TESTNET="'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx"

# Phase 0 V2 contracts that reference .usdcx
CONTRACTS=(
  "contracts/multi-market-pool-v2.clar"
)

echo "=========================================="
echo "Phase 0 V2 Testnet Deployment"
echo "=========================================="
echo "Deployer: $DEPLOYER"
echo "USDCx: $USDCX_TESTNET"
echo ""
echo "V2 Features:"
echo "  - stacks-block-height (Clarity 3)"
echo "  - Guardian recovery mechanism"
echo "  - Emergency LP withdrawals"
echo ""

# Step 1: Backup contracts
echo "[1/4] Creating backups..."
for contract in "${CONTRACTS[@]}"; do
  if [ -f "$contract" ]; then
    cp "$contract" "${contract}.backup"
    echo "  ✓ Backed up $contract"
  else
    echo "  ! Warning: $contract not found"
  fi
done

# Step 2: Update references to testnet USDCx
echo "[2/4] Updating USDCx references for testnet..."
for contract in "${CONTRACTS[@]}"; do
  if [ -f "$contract" ]; then
    # Replace .usdcx with testnet USDCx address
    sed -i "s/(contract-call? \.usdcx/(contract-call? $USDCX_TESTNET/g" "$contract"
    echo "  ✓ Updated $contract"
  fi
done

# Verify contracts still compile
echo "[3/4] Verifying contracts compile..."
if ! clarinet check > /dev/null 2>&1; then
  echo "ERROR: Contracts don't compile after modification!"
  echo "Restoring backups..."
  for contract in "${CONTRACTS[@]}"; do
    if [ -f "${contract}.backup" ]; then
      mv "${contract}.backup" "$contract"
    fi
  done
  exit 1
fi
echo "  ✓ Contracts compile"

# Step 4: Deploy instructions
echo "[4/4] Ready to deploy to testnet..."
echo ""
echo "Run this command to deploy:"
echo ""
echo "  clarinet deployments apply -p deployments/phase0-v2.testnet-plan.yaml"
echo ""
echo "After deployment completes, restore originals with:"
echo ""
echo "  ./scripts/restore-phase0-v2-contracts.sh"
echo ""
echo "=========================================="
echo ""
echo "POST-DEPLOYMENT STEPS:"
echo ""
echo "1. Set authorized minter for LP token (if not already set):"
echo "   Call sip013-lp-token.set-authorized-minter(multi-market-pool-v2)"
echo ""
echo "2. Set guardian address (optional, defaults to deployer):"
echo "   Call multi-market-pool-v2.set-guardian(guardian-address)"
echo ""
echo "3. To mark a corrupted market as unhealthy:"
echo "   Call multi-market-pool-v2.mark-unhealthy(market-id)"
echo ""
echo "4. LP emergency withdrawal (after 30-day recovery window):"
echo "   Call multi-market-pool-v2.emergency-withdraw(market-id)"
echo ""
echo "=========================================="
