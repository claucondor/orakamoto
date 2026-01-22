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

- `USDCX_CONTRACT` in `components/USDCxBalance.tsx`
- `MARKET_FACTORY_ADDRESS` in `app/create/page.tsx`

Get USDCx contract address from:
```bash
curl -s "https://api.testnet.hiro.so/extended/v1/address/[YOUR_ADDRESS]/balances" | jq
```
