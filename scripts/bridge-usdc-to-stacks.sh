#!/bin/bash

# Bridge USDC from Ethereum Sepolia to Stacks Testnet as USDCx
# Uses Circle's xReserve bridge

set -e

# Configuration
ETHEREUM_ADDRESS="0xA9e9e31DA085Ea6B92F6e9D339Bd29C10BD75b6A"
ETHEREUM_PRIVATE_KEY="0xb5df658e2fc14c0ad23220979863cf70e15bc83b41a1c08ee5e262258e2aec0a"
STACKS_ADDRESS="STC5KHM41H6WHAST7MWWDD807YSPRQKJ68T330BQ"

# Contract addresses on Sepolia
USDC_CONTRACT="0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
XRESERVE_CONTRACT="0x008888878f94C0d87defdf0B07f46B93C1934442"  # xReserve on Sepolia

RPC="https://ethereum-sepolia.publicnode.com"

# Amount to bridge (in USDC, will be converted to 6 decimals)
AMOUNT_USDC=${1:-20}  # Default 20 USDC
AMOUNT_WEI=$((AMOUNT_USDC * 1000000))  # USDC has 6 decimals

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║          BRIDGE USDC → USDCx (Stacks)                     ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║  From: Ethereum Sepolia                                   ║"
echo "║  To:   Stacks Testnet                                     ║"
echo "║  Amount: $AMOUNT_USDC USDC                                      ║"
echo "║  Destination: $STACKS_ADDRESS    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check current USDC balance
echo "Step 1: Checking USDC balance..."
BALANCE_RAW=$(cast call $USDC_CONTRACT "balanceOf(address)(uint256)" $ETHEREUM_ADDRESS --rpc-url $RPC)
BALANCE=$(echo $BALANCE_RAW | awk '{print $1}')
BALANCE_DECIMAL=$((BALANCE / 1000000))
echo "  ✓ Current balance: $BALANCE_DECIMAL USDC"

if [ $BALANCE -lt $AMOUNT_WEI ]; then
  echo "  ✗ Insufficient balance!"
  exit 1
fi

# Step 2: Check current allowance
echo ""
echo "Step 2: Checking xReserve allowance..."
ALLOWANCE_RAW=$(cast call $USDC_CONTRACT "allowance(address,address)(uint256)" $ETHEREUM_ADDRESS $XRESERVE_CONTRACT --rpc-url $RPC)
ALLOWANCE=$(echo $ALLOWANCE_RAW | awk '{print $1}')
ALLOWANCE_DECIMAL=$((ALLOWANCE / 1000000))
echo "  Current allowance: $ALLOWANCE_DECIMAL USDC"

# Step 3: Approve if needed
if [ $ALLOWANCE -lt $AMOUNT_WEI ]; then
  echo ""
  echo "Step 3: Approving xReserve to spend USDC..."
  APPROVE_TX=$(cast send $USDC_CONTRACT \
    "approve(address,uint256)" \
    $XRESERVE_CONTRACT \
    $AMOUNT_WEI \
    --private-key $ETHEREUM_PRIVATE_KEY \
    --rpc-url $RPC \
    --json)

  APPROVE_HASH=$(echo $APPROVE_TX | jq -r '.transactionHash')
  echo "  ✓ Approval tx: $APPROVE_HASH"
  echo "  Waiting for confirmation..."
  cast receipt $APPROVE_HASH --rpc-url $RPC > /dev/null
  echo "  ✓ Approved!"
else
  echo "  ✓ Already approved"
fi

# Step 4: Bridge to Stacks
echo ""
echo "Step 4: Bridging USDC to Stacks..."
echo "  This will take approximately 15 minutes..."

# Convert Stacks address to bytes32 (pad to 32 bytes)
# The xReserve contract expects the destination address as bytes32
STACKS_HEX=$(echo -n "$STACKS_ADDRESS" | xxd -p)
# Calculate padding needed (64 hex chars = 32 bytes)
PADDING_LENGTH=$((64 - ${#STACKS_HEX}))
PADDING=$(printf '0%.0s' $(seq 1 $PADDING_LENGTH))
STACKS_BYTES32="0x${STACKS_HEX}${PADDING}"

# Call depositToRemote
# Function signature: depositToRemote(uint256 value, uint32 remoteDomain, bytes32 remoteRecipient, address localToken, uint256 maxFee, bytes hookData)
# Stacks domain ID for xReserve: 10003
MAX_FEE=$((AMOUNT_WEI / 100))  # 1% max fee
BRIDGE_TX=$(cast send $XRESERVE_CONTRACT \
  "depositToRemote(uint256,uint32,bytes32,address,uint256,bytes)" \
  $AMOUNT_WEI \
  10003 \
  $STACKS_BYTES32 \
  $USDC_CONTRACT \
  $MAX_FEE \
  "0x" \
  --private-key $ETHEREUM_PRIVATE_KEY \
  --rpc-url $RPC \
  --json)

BRIDGE_HASH=$(echo $BRIDGE_TX | jq -r '.transactionHash')
echo "  ✓ Bridge tx: $BRIDGE_HASH"
echo "  Waiting for confirmation..."
cast receipt $BRIDGE_HASH --rpc-url $RPC > /dev/null
echo "  ✓ Bridge initiated!"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ Bridge transaction submitted successfully!            ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║  Transaction: $BRIDGE_HASH                                ║"
echo "║  Amount: $AMOUNT_USDC USDC → USDCx                              ║"
echo "║  Destination: $STACKS_ADDRESS    ║"
echo "║                                                           ║"
echo "║  ⏳ Waiting for bridge to complete (~15 minutes)          ║"
echo "║  Monitor your wallet with:                                ║"
echo "║  ./scripts/monitor-hackathon-wallet.sh                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
