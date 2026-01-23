# StacksPredict Frontend - USDCx MVP

Minimal frontend demonstrating USDCx integration for hackathon.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Open http://localhost:3000

## Build

```bash
npm run build
npm start
```

## Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

## Configuration

Before deploying, update these constants:

### 1. Market Factory Address (REQUIRED)

**File:** `app/create/page.tsx:13`

```typescript
// Update with your deployed address after running deployment
const MARKET_FACTORY_ADDRESS = 'YOUR_ADDRESS.market-factory';
```

Example: `'STC5KHM41H6WHAST7MWWDD807YSPRQKJ68T330BQ'` (without .market-factory suffix)

### 2. USDCx Contract (Already Configured)

**File:** `components/USDCxBalance.tsx:8`

Already set to testnet USDCx:
```typescript
const USDCX_CONTRACT = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx';
```

## Features

✅ Wallet Connect (Leather wallet)
✅ USDCx Balance Display
✅ Create Market Form with proper arguments
✅ Transaction submission and tracking
⏳ Markets List (Placeholder for MVP)
⏳ Trading Interface (Future iteration)

## Bug Fixes Applied

- ✅ Fixed `create-market` function arguments to match contract signature
- ✅ Changed timestamp to block height calculation
- ✅ Added `noneCV()` for optional resolution-deadline parameter
- ✅ Updated minimum liquidity to 50 USDCx (MINIMUM-COLLATERAL)
- ✅ Improved contract address placeholders with clear TODOs
