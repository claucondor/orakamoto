# Orakamoto - Decentralized Prediction Markets on Stacks

A modern prediction market platform built on Stacks, secured by Bitcoin. Trade on real-world outcomes with AI-powered resolution.

## Features

- **Prediction Markets**: Browse and trade on YES/NO outcome markets
- **Wallet Integration**: Connect with Hiro/Leather wallet
- **USDCx Trading**: Trade using USDCx stablecoin
- **Liquidity Provision**: Add/remove liquidity and earn fees
- **Market Creation**: Create your own prediction markets
- **Portfolio Tracking**: View all your positions in one place
- **Testnet Faucet**: Get free USDCx for testing

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Blockchain**: Stacks (via @stacks/connect, @stacks/transactions)
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Hiro/Leather wallet browser extension

### Installation

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Configuration

### Contract Addresses

The contract addresses are configured in `/lib/constants.ts`:

```typescript
export const CONTRACTS = {
  DEPLOYER: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC',
  MULTI_MARKET_POOL: 'multi-market-pool',
  USDCX: 'usdcx',
  LP_TOKEN: 'sip013-lp-token',
};
```

Update the `DEPLOYER` address if deploying to a different account.

### Network Configuration

By default, the app connects to Stacks Testnet. The network is configured in `/lib/contracts.ts`:

```typescript
const network = new StacksTestnet();
```

## Project Structure

```
frontend/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Landing page
│   ├── markets/           # Markets listing & detail
│   ├── create/            # Market creation form
│   ├── faucet/            # Testnet USDCx faucet
│   └── portfolio/         # User positions
├── components/            # React components
│   ├── Header.tsx         # Navigation header
│   ├── MarketCard.tsx     # Market preview card
│   ├── TradingPanel.tsx   # Buy YES/NO interface
│   ├── LiquidityPanel.tsx # Add/remove liquidity
│   └── UserPositions.tsx  # Display user holdings
├── lib/                   # Utilities & services
│   ├── constants.ts       # Contract addresses & helpers
│   ├── contracts.ts       # Stacks contract interactions
│   ├── store.ts           # Zustand state management
│   └── utils.ts           # Helper functions
└── public/                # Static assets
```

## Core Workflows

### 1. Connect Wallet
Click "Connect Wallet" in the header to connect your Hiro/Leather wallet.

### 2. Get Test USDCx
Visit `/faucet` to claim up to 10,000 USDCx for testnet trading.

### 3. Trade on Markets
- Browse markets at `/markets`
- Click a market to view details
- Select YES or NO outcome
- Enter amount and confirm trade

### 4. Create a Market
- Go to `/create`
- Enter your prediction question
- Set trading deadline
- Add initial liquidity (min 1 USDCx)
- Submit transaction

### 5. Provide Liquidity
- Open any market
- Use the Liquidity panel
- Add or remove LP tokens
- Earn 70% of trading fees

### 6. Claim Winnings
- After a market resolves, visit the market page
- If you hold winning tokens, click "Claim Winnings"
- Wait for dispute window to pass

## Contract Integration

### Read-Only Functions

```typescript
// Get market data
const market = await getMarket(marketId);

// Get current prices
const prices = await getMarketPrices(marketId);

// Get user position
const position = await getUserPosition(marketId, address);
```

### Contract Calls

```typescript
// Buy outcome tokens
await openContractCall({
  contractAddress: CONTRACTS.DEPLOYER,
  contractName: CONTRACTS.MULTI_MARKET_POOL,
  functionName: 'buy-outcome',
  functionArgs: [
    uintCV(marketId),
    uintCV(outcome), // 0 = YES, 1 = NO
    uintCV(amount),
    uintCV(minTokensOut),
  ],
});
```

## Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel --prod
```

### Environment Variables

No environment variables required for basic deployment. All configuration is in `/lib/constants.ts`.

## Hackathon Info

- **Project**: Orakamoto (Oracle + Nakamoto)
- **Event**: Circle xReserve Hackathon 2025
- **Blockchain**: Stacks Testnet
- **Stablecoin**: USDCx (Mock USDC for testnet)

## Resources

- [Stacks Documentation](https://docs.stacks.co/)
- [Hiro Connect](https://github.com/hirosystems/connect)
- [Stacks Explorer](https://explorer.hiro.so/?chain=testnet)

## License

MIT
