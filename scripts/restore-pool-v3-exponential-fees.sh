#!/bin/bash
# Restore Multi-Market Pool V3 contracts after testnet deployment
#
# This script restores the original .usdcx references
# after the deployment script has updated them for testnet

set -e

CONTRACTS=(
  "contracts/multi-market-pool-v3.clar"
)

echo "=========================================="
echo "Restoring Multi-Market Pool V3 Contracts"
echo "=========================================="
echo ""

for contract in "${CONTRACTS[@]}"; do
  if [ -f "${contract}.backup" ]; then
    mv "${contract}.backup" "$contract"
    echo "  ✓ Restored $contract"
  else
    echo "  ! No backup found for $contract"
  fi
done

echo ""
echo "=========================================="
echo "Contracts restored to simnet configuration"
echo "=========================================="
