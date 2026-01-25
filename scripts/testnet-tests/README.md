# Testnet Test Scripts

Small scripts to test Phase 0 contracts on Stacks Testnet.

## Prerequisites

- Contracts deployed via `./scripts/deploy-phase0-testnet.sh`
- Mnemonic configured in `settings/Testnet.toml`
- USDCx tokens in deployer wallet

## Scripts

| Script | Description | Status |
|--------|-------------|--------|
| `01-authorize-lp-minter.mjs` | Authorize pool as LP minter | Done once |
| `02-create-market.mjs` | Create prediction market (1 USDC) | Creates market ID 1 |
| `03-buy-yes.mjs` | Buy YES tokens (0.1 USDC) | |
| `04-check-market.mjs` | Check prices and status (read-only) | |
| `05-buy-no.mjs` | Buy NO tokens (0.1 USDC) | |
| `06-resolve-market.mjs` | Resolve market (after deadline) | |
| `07-claim-winnings.mjs` | Claim winnings (after dispute window) | |

## Usage

```bash
# Run scripts in order
node scripts/testnet-tests/01-authorize-lp-minter.mjs
node scripts/testnet-tests/02-create-market.mjs
node scripts/testnet-tests/03-buy-yes.mjs
node scripts/testnet-tests/04-check-market.mjs  # Read-only, run anytime
node scripts/testnet-tests/05-buy-no.mjs
node scripts/testnet-tests/06-resolve-market.mjs  # Wait for deadline
node scripts/testnet-tests/07-claim-winnings.mjs  # Wait for dispute window
```

## Timeline

1. **Create market** - Sets deadline +10 blocks (~1 hour)
2. **Trade** - Buy YES/NO tokens before deadline
3. **Wait for deadline** - ~1 hour after market creation
4. **Resolve** - Creator resolves with winning outcome
5. **Wait for dispute window** - 5 blocks (~45 min)
6. **Claim** - Winners claim USDC

## Contract Addresses

- Pool V2: `ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool-v2`
- LP Token: `ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.sip013-lp-token`
- USDCx: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`

## V2 Notes

The v2 contract uses `stacks-block-height` (Clarity 3) instead of `block-height` to correctly handle Nakamoto fast blocks. After the Nakamoto upgrade, `block-height` returns `tenure_height` (~10 min blocks) which caused markets to be unresolvable.
