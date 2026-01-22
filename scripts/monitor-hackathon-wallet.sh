#!/bin/bash

ETH_ADDRESS="0xA9e9e31DA085Ea6B92F6e9D339Bd29C10BD75b6A"
STX_ADDRESS="STC5KHM41H6WHAST7MWWDD807YSPRQKJ68T330BQ"
USDC_CONTRACT="0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
RPC="https://ethereum-sepolia.publicnode.com"

echo "Monitoring Hackathon Wallets"
echo "Press Ctrl+C to stop"
echo ""

while true; do
  # Get ETH balance
  ETH_RESULT=$(curl -s "$RPC" -X POST -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ETH_ADDRESS\",\"latest\"],\"id\":1}")
  ETH_WEI=$(echo $ETH_RESULT | python3 -c "import sys, json; print(int(json.load(sys.stdin)['result'], 16))" 2>/dev/null || echo "0")
  ETH_BALANCE=$(echo "scale=6; $ETH_WEI / 1000000000000000000" | bc)

  # Get USDC balance (Sepolia)
  USDC_DATA="0x70a08231000000000000000000000000${ETH_ADDRESS:2}"
  USDC_RESULT=$(curl -s "$RPC" -X POST -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$USDC_CONTRACT\",\"data\":\"$USDC_DATA\"},\"latest\"],\"id\":1}")
  USDC_RAW=$(echo $USDC_RESULT | python3 -c "import sys, json; print(int(json.load(sys.stdin).get('result', '0x0'), 16))" 2>/dev/null || echo "0")
  USDC_BALANCE=$(echo "scale=6; $USDC_RAW / 1000000" | bc)

  # Get USDCx balance (Stacks testnet)
  USDCX_RESULT=$(curl -s "https://api.testnet.hiro.so/extended/v1/address/$STX_ADDRESS/balances" 2>/dev/null)
  USDCX_RAW=$(echo $USDCX_RESULT | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tokens = data.get('fungible_tokens', {})
    # Look for any token with 'usdcx' in the name
    usdcx_balance = 0
    usdcx_contract = ''
    for key, value in tokens.items():
        if 'usdcx' in key.lower() or 'usdc' in key.lower():
            usdcx_balance = value.get('balance', 0)
            usdcx_contract = key
            break
    print(f'{usdcx_balance}|{usdcx_contract}')
except:
    print('0|')
" 2>/dev/null || echo "0|")
  USDCX_BALANCE=$(echo $USDCX_RAW | cut -d'|' -f1)
  USDCX_CONTRACT=$(echo $USDCX_RAW | cut -d'|' -f2)
  USDCX_BALANCE_DECIMAL=$(echo "scale=6; $USDCX_BALANCE / 1000000" | bc)

  # Display
  clear
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║          HACKATHON WALLET MONITOR                         ║"
  echo "╠═══════════════════════════════════════════════════════════╣"
  echo "║                                                           ║"
  echo "║  ETHEREUM SEPOLIA: $ETH_ADDRESS ║"
  echo "║  ETH:  $ETH_BALANCE ETH                                     ║"
  echo "║  USDC: $USDC_BALANCE USDC                                   ║"
  echo "║                                                           ║"
  echo "║  STACKS TESTNET: $STX_ADDRESS    ║"
  echo "║  USDCx: $USDCX_BALANCE_DECIMAL USDCx                                ║"
  if [ -n "$USDCX_CONTRACT" ]; then
    echo "║  Contract: ${USDCX_CONTRACT:0:50}... ║"
  fi
  echo "║                                                           ║"
  echo "╠═══════════════════════════════════════════════════════════╣"
  
  # Status checks
  STATUS=""
  if (( $(echo "$ETH_BALANCE > 0" | bc -l) )); then
    echo "║  ✅ ETH: Ready for transactions                           ║"
    STATUS="eth_ok"
  else
    echo "║  ⏳ ETH: Send Sepolia ETH to address above                ║"
  fi

  if (( $(echo "$USDC_BALANCE > 0" | bc -l) )); then
    echo "║  ✅ USDC: Ready to bridge                                 ║"
    STATUS="${STATUS}_usdc_ok"
  else
    echo "║  ⏳ USDC: Get from https://faucet.circle.com/             ║"
  fi

  if (( $(echo "$USDCX_BALANCE > 0" | bc -l) )); then
    echo "║  ✅ USDCx: Received on Stacks! Ready to use               ║"
  else
    echo "║  ⏳ USDCx: Waiting for bridge...                          ║"
  fi
  
  echo "║                                                           ║"
  echo "║  Refreshing in 10 seconds...                              ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  
  sleep 10
done
