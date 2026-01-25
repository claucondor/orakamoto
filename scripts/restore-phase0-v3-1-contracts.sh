#!/bin/bash
# Restore Phase 0 V3.1 contracts to original state after testnet deployment

set -e

CONTRACTS=(
  "contracts/multi-market-pool-v3-1.clar"
)

echo "=========================================="
echo "Restoring Phase 0 V3.1 Contracts"
echo "=========================================="

for contract in "${CONTRACTS[@]}"; do
  if [ -f "${contract}.backup" ]; then
    mv "${contract}.backup" "$contract"
    echo "  ✓ Restored $contract"
  else
    echo "  ! No backup found for $contract"
  fi
done

echo ""
echo "✓ All contracts restored to local references"
echo "=========================================="
