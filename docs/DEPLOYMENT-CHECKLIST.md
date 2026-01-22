# Deployment Checklist

## Pre-Deployment

- [ ] USDCx arrived on Stacks
- [ ] USDCx contract address obtained
- [ ] All contracts updated with real USDCx principal
- [ ] `clarinet check` passes with 0 errors
- [ ] Deployer wallet has sufficient STX (>10 STX)

## Contract Deployment

- [ ] Generate deployment plan: `clarinet deployments generate --testnet --manual-cost`
- [ ] Review deployment plan for correct addresses
- [ ] Deploy: `clarinet deployments apply -p deployments/default.testnet-plan.yaml`
- [ ] Save deployed contract addresses
- [ ] Update DEPLOYMENTS.md

## Frontend Deployment

- [ ] Update USDCx contract address in `components/USDCxBalance.tsx`
- [ ] Update market factory address in `app/create/page.tsx`
- [ ] Test locally: `npm run dev`
- [ ] Build: `npm run build`
- [ ] Deploy to Vercel: `vercel --prod`
- [ ] Test deployed site

## Testing

- [ ] Connect wallet on deployed frontend
- [ ] Verify USDCx balance shows correctly
- [ ] Create test market with 5 USDCx
- [ ] Verify transaction succeeds
- [ ] Check market appears in contract

## Hackathon Submission

- [ ] Record demo video (5-7 minutes)
- [ ] Take screenshots
- [ ] Update README.md
- [ ] Push all code to GitHub
- [ ] Submit to DoraHacks
