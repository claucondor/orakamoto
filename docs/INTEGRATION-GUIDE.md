# USDCx Integration Guide

## Overview

StacksPredict integrates with Circle's USDCx on Stacks via xReserve bridge.

## Architecture

```
Ethereum Sepolia (USDC)
       ↓
xReserve Bridge (Circle)
       ↓
Stacks Testnet (USDCx)
       ↓
StacksPredict Contracts
```

## Contracts Modified

- `contracts/core/market-factory.clar` - Updated USDC constant
- `contracts/core/market-pool.clar` - Updated USDC constant
- `contracts/multi-outcome-pool.clar` - Updated USDC constant
- `contracts/yield-vault.clar` - Updated USDC constant
- `contracts/mocks/mock-zest-vault.clar` - Updated USDC constant

## Steps to Complete Integration

1. Wait for USDCx to arrive on Stacks (~15 minutes from bridge)
2. Get USDCx contract address from Hiro API
3. Update contract constants with real USDCx principal
4. Generate deployment plan: `clarinet deployments generate --testnet`
5. Deploy contracts: `clarinet deployments apply`
6. Update frontend constants
7. Deploy frontend to Vercel
8. Test end-to-end flow

## Testing

See `scripts/test-create-market-usdcx.mjs` for programmatic testing.

## Deployment Addresses

- Deployer: ST7NF22X51JPBHWRDCM29FKFJ8NSWY4NEW7ZEMZF
- USDCx Token: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx (testnet)
- Market Factory: [Will update after deployment]

## Bridge Transaction

- TX: 0xab03201abe9db66706bb84f1124f47924e0e5c030315cb8bbb7c99c81c89dcf8
- Amount: 20 USDC → 20 USDCx
- Destination: STC5KHM41H6WHAST7MWWDD807YSPRQKJ68T330BQ
