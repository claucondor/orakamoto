#!/bin/bash
# Deploy Phase 0 V3 contracts to testnet with real USDCx
# This script temporarily updates contract references, deploys, then reverts
#
# V3 Features:
# - pm-AMM Gaussian invariant for LP protection
# - Exponential time-based fees (3% → 20%)
# - Dynamic liquidity: L(t) = L0 × sqrt((T-t)/T)
# - Fixed ArithmeticUnderflow in pm-amm-core safe-int-add

set -e

DEPLOYER="ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC"
USDCX_TESTNET="'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx"

# Phase 0 V3 contracts that reference .usdcx
CONTRACTS=(
  "contracts/multi-market-pool-v3.clar"
  "contracts/market-factory-v3.clar"
  "contracts/market-fork-v2.clar"
)

echo "=========================================="
echo "Phase 0 V3 Testnet Deployment"
echo "=========================================="
echo "Deployer: $DEPLOYER"
echo "USDCx: $USDCX_TESTNET"
echo ""
echo "V3 Features:"
echo "  - pm-AMM Gaussian invariant"
echo "  - Exponential fees: 3% → 20%"
echo "  - Dynamic liquidity decay"
echo "  - Fixed safe-int-add in pm-amm-core"
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
echo "  clarinet deployments apply -p deployments/phase0-v3.testnet-plan.yaml"
echo ""
echo "After deployment completes, restore originals with:"
echo ""
echo "  ./scripts/restore-phase0-v3-contracts.sh"
echo ""
echo "=========================================="
echo ""
echo "POST-DEPLOYMENT STEPS:"
echo ""
echo "1. Set authorized minter for LP token (if not already set):"
echo "   Call sip013-lp-token.set-authorized-minter(multi-market-pool-v3)"
echo ""
echo "2. Create test market:"
echo "   Call multi-market-pool-v3.create-market("
echo "     \"Will BTC reach \$150k by end of 2026?\","
echo "     deadline, resolution-deadline, 1000000)"
echo ""
echo "3. Verify exponential fees work:"
echo "   - Buy at t=0%: fee ~3%"
echo "   - Buy at t=50%: fee ~6%"
echo "   - Buy at t=100%: fee ~20%"
echo ""
echo "=========================================="
