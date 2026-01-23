#!/bin/bash
# Restore Phase 0 contracts after testnet deployment

set -e

CONTRACTS=(
  "contracts/multi-market-pool.clar"
)

echo "Restoring Phase 0 contracts from backups..."

for contract in "${CONTRACTS[@]}"; do
  if [ -f "${contract}.backup" ]; then
    mv "${contract}.backup" "$contract"
    echo "  ✓ Restored $contract"
  else
    echo "  ⚠ No backup found for $contract"
  fi
done

echo ""
echo "✓ Contracts restored. Tests should work again:"
echo "  npm run test:phase0"
