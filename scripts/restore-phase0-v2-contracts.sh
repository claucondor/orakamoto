#!/bin/bash
# Restore Phase 0 V2 contracts from backups after testnet deployment

set -e

CONTRACTS=(
  "contracts/multi-market-pool-v2.clar"
)

echo "Restoring Phase 0 V2 contracts from backups..."

for contract in "${CONTRACTS[@]}"; do
  if [ -f "${contract}.backup" ]; then
    mv "${contract}.backup" "$contract"
    echo "  ✓ Restored $contract"
  else
    echo "  ! No backup found for $contract"
  fi
done

echo ""
echo "Done! Contracts restored to local development state."
