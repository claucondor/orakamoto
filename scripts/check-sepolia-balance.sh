#!/bin/bash

ADDRESS="0x2F2B1a3648C58CF224aA69A4B0BdC942F000045F"
USDC_CONTRACT="0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
RPC="https://ethereum-sepolia.publicnode.com"

echo "Monitoring Sepolia balances for: $ADDRESS"
echo "Press Ctrl+C to stop"
echo ""

while true; do
  # Get ETH balance
  ETH_RESULT=$(curl -s "$RPC" -X POST -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDRESS\",\"latest\"],\"id\":1}")
  ETH_WEI=$(echo $ETH_RESULT | python3 -c "import sys, json; print(int(json.load(sys.stdin)['result'], 16))")
  ETH_BALANCE=$(echo "scale=6; $ETH_WEI / 1000000000000000000" | bc)

  # Get USDC balance
  USDC_DATA="0x70a08231000000000000000000000000${ADDRESS:2}"
  USDC_RESULT=$(curl -s "$RPC" -X POST -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$USDC_CONTRACT\",\"data\":\"$USDC_DATA\"},\"latest\"],\"id\":1}")
  USDC_RAW=$(echo $USDC_RESULT | python3 -c "import sys, json; print(int(json.load(sys.stdin).get('result', '0x0'), 16))")
  USDC_BALANCE=$(echo "scale=6; $USDC_RAW / 1000000" | bc)

  # Display
  clear
  echo "═══════════════════════════════════════════════════"
  echo "  SEPOLIA TESTNET BALANCE MONITOR"
  echo "═══════════════════════════════════════════════════"
  echo ""
  echo "  Address: $ADDRESS"
  echo ""
  echo "  ETH:  $ETH_BALANCE ETH"
  echo "  USDC: $USDC_BALANCE USDC"
  echo ""
  echo "═══════════════════════════════════════════════════"
  
  if (( $(echo "$ETH_BALANCE > 0" | bc -l) )); then
    echo "  ✅ ETH Balance OK - Ready for transactions!"
  else
    echo "  ⏳ Waiting for ETH... Get from:"
    echo "     https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
  fi

  if (( $(echo "$USDC_BALANCE > 0" | bc -l) )); then
    echo "  ✅ USDC Balance OK - Ready to bridge!"
  else
    echo "  ⏳ Waiting for USDC... Get from:"
    echo "     https://faucet.circle.com/"
  fi
  
  echo ""
  echo "  Refreshing in 10 seconds..."
  echo "═══════════════════════════════════════════════════"
  
  sleep 10
done
