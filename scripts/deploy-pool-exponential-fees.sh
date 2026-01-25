#!/bin/bash
# Deploy Multi-Market Pool V3 with Exponential Fees to testnet
#
# V3 Features:
# - Exponential time-based fees: fee = base × min(5^progress, MAX_FEE)
#   where progress = (current_block - created_at) / (deadline - created_at)
# - Fee cap at 20% to prevent excessive fees
# - Enhanced LP protection against informed trading near resolution
# - Claim creator fees and protocol fees functions

set -e

DEPLOYER="ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC"
USDCX_TESTNET="'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx"

# V3 contracts that reference .usdcx
CONTRACTS=(
  "contracts/multi-market-pool-v3.clar"
)

echo "=========================================="
echo "Multi-Market Pool V3 - Exponential Fees"
echo "=========================================="
echo "Deployer: $DEPLOYER"
echo "USDCx: $USDCX_TESTNET"
echo ""
echo "V3 Features:"
echo "  - Exponential time-based fees (5^progress)"
echo "  - Fee cap at 20%"
echo "  - Enhanced LP protection"
echo "  - Creator & protocol fee claims"
echo ""
echo "Fee Schedule:"
echo "  t=0%:    1% base fee (no penalty)"
echo "  t=50%:   ~2.24% fee (5^0.5)"
echo "  t=100%:  5% fee (5^1.0)"
echo "  cap:     20% maximum"
echo ""

# Step 1: Backup contracts
echo "[1/5] Creating backups..."
for contract in "${CONTRACTS[@]}"; do
  if [ -f "$contract" ]; then
    cp "$contract" "${contract}.backup"
    echo "  ✓ Backed up $contract"
  else
    echo "  ! Warning: $contract not found"
  fi
done

# Step 2: Update references to testnet USDCx
echo "[2/5] Updating USDCx references for testnet..."
for contract in "${CONTRACTS[@]}"; do
  if [ -f "$contract" ]; then
    # Replace .usdcx with testnet USDCx address
    sed -i "s/(contract-call? \.usdcx/(contract-call? $USDCX_TESTNET/g" "$contract"
    echo "  ✓ Updated $contract"
  fi
done

# Verify contracts still compile
echo "[3/5] Verifying contracts compile..."
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

# Step 4: Create deployment plan
echo "[4/5] Creating deployment plan..."
cat > deployments/pool-v3-exponential-fees.testnet-plan.yaml <<EOF
name: "Multi-Market Pool V3 - Exponential Fees Testnet Deployment"
network: testnet
id: 0
plan:
  batches:
    - id: 0
      transactions:
        - contract-publish:
            contract-name: multi-market-pool-v3
            emulated-sender: $DEPLOYER
            path: contracts/multi-market-pool-v3.clar
            clarity-version: 3
            epoch: "3.0"
EOF
echo "  ✓ Deployment plan created"

# Step 5: Deploy instructions
echo "[5/5] Ready to deploy to testnet..."
echo ""
echo "Run this command to deploy:"
echo ""
echo "  clarinet deployments apply -p deployments/pool-v3-exponential-fees.testnet-plan.yaml"
echo ""
echo "After deployment completes, restore originals with:"
echo ""
echo "  ./scripts/restore-pool-v3-exponential-fees.sh"
echo ""
echo "=========================================="
echo ""
echo "POST-DEPLOYMENT STEPS:"
echo ""
echo "1. Set authorized minter for LP token:"
echo "   Call sip013-lp-token.set-authorized-minter(multi-market-pool-v3)"
echo ""
echo "2. Set guardian address (optional, defaults to deployer):"
echo "   Call multi-market-pool-v3.set-guardian(guardian-address)"
echo ""
echo "3. Test exponential fee calculation:"
echo "   - Create a market"
echo "   - Buy at different time points (0%, 25%, 50%, 75%, 100%)"
echo "   - Verify fee increases exponentially"
echo "   - Verify fee is capped at 20%"
echo ""
echo "4. Claim fees:"
echo "   - Creator: Call multi-market-pool-v3.claim-creator-fees(market-id)"
echo "   - Guardian: Call multi-market-pool-v3.claim-protocol-fees(market-id)"
echo ""
echo "=========================================="
