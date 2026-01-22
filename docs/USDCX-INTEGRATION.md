# USDCx Integration Guide

## Overview

This document tracks the integration of Circle's USDCx (bridged USDC on Stacks) into the StacksPredict protocol.

## USDCx Contract Information

### Official USDCx Contracts (Circle)

**Testnet:**
```
ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
```

**Mainnet:**
```
SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
```

### Key Characteristics

- **Standard:** SIP-010 (Stacks Fungible Token Standard)
- **Decimals:** 6 (same as USDC)
- **Backing:** 1:1 by real USDC held in xReserve smart contracts on Ethereum
- **Bridge:** Circle xReserve - bridges USDC from Ethereum to Stacks (~15 min)

## Modified Contracts

The following contracts reference `.mock-usdc` and need to be updated for USDCx integration:

### 1. contracts/market-factory.clar
**Lines:** 131, 238
**Change:** Replace `.mock-usdc` with USDCx principal
```clarity
;; Before:
(try! (contract-call? .mock-usdc transfer collateral caller (as-contract tx-sender) none))

;; After:
(try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx transfer collateral caller (as-contract tx-sender) none))
```

### 2. contracts/market-pool.clar
**Lines:** 77, 217, 301, 351, 440, 500
**Change:** Replace `.mock-usdc` with USDCx principal
```clarity
;; Before:
(try! (contract-call? .mock-usdc transfer initial-liquidity caller (as-contract tx-sender) none))

;; After:
(try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx transfer initial-liquidity caller (as-contract tx-sender) none))
```

### 3. contracts/multi-outcome-pool.clar
**Lines:** 206, 316, 374, 422, 481, 542
**Change:** Replace `.mock-usdc` with USDCx principal
```clarity
;; Before:
(try! (contract-call? .mock-usdc transfer initial-liquidity caller (as-contract tx-sender) none))

;; After:
(try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx transfer initial-liquidity caller (as-contract tx-sender) none))
```

### 4. contracts/yield-vault.clar
**Lines:** 105, 168, 208
**Change:** Replace `.mock-usdc` with USDCx principal
```clarity
;; Before:
(try! (contract-call? .mock-usdc transfer amount caller (as-contract tx-sender) none))

;; After:
(try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx transfer amount caller (as-contract tx-sender) none))
```

### 5. contracts/mocks/mock-zest-vault.clar
**Lines:** 79, 141
**Change:** Replace `.mock-usdc` with USDCx principal
```clarity
;; Before:
(try! (contract-call? .mock-usdc transfer amount caller (as-contract tx-sender) none))

;; After:
(try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx transfer amount caller (as-contract tx-sender) none))
```

### 6. contracts/mock-usdc.clar
**Note:** This contract should be **disabled/removed** after USDCx integration, as it's no longer needed for production.

## Integration Steps

### Phase 1: Contract Updates

1. **Update all contract references:**
   - Replace `.mock-usdc` with `'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx` in all contracts
   - Update Clarinet.toml if needed (remove mock-usdc dependency where appropriate)

2. **Update contract dependencies:**
   - Add USDCx contract as a requirement in Clarinet.toml
   - Remove mock-usdc from contracts that no longer need it

3. **Run verification:**
   ```bash
   clarinet check
   ```

### Phase 2: Testing

1. **Run existing tests:**
   ```bash
   npm test
   ```

2. **Update test files:**
   - Update test files that reference mock-usdc
   - Ensure all token transfers use the correct USDCx principal

3. **Test end-to-end flow:**
   - Create market with USDCx collateral
   - Add liquidity using USDCx
   - Trade using USDCx
   - Resolve and claim winnings

### Phase 3: Deployment

1. **Generate deployment plan:**
   ```bash
   clarinet deployments generate --testnet --manual-cost
   ```

2. **Deploy contracts:**
   ```bash
   clarinet deployments apply -p deployments/default.testnet-plan.yaml
   ```

3. **Update frontend constants:**
   - Update USDCx contract address in `frontend/components/USDCxBalance.tsx`
   - Update market factory address in `frontend/app/create/page.tsx`

## Migration Checklist

- [ ] All mock-usdc references identified (see usdc-references.txt)
- [ ] All contracts updated with USDCx principal
- [ ] Clarinet.toml updated with USDCx requirement
- [ ] `clarinet check` passes with 0 errors
- [ ] All tests pass
- [ ] Deployment plan generated
- [ ] Contracts deployed to testnet
- [ ] Frontend updated with new addresses
- [ ] End-to-end testing completed
- [ ] Documentation updated

## Important Notes

### Devnet vs Testnet

**For Devnet:**
- Use local mock-usdc for development and testing
- USDCx is not available on devnet

**For Testnet:**
- Use the official USDCx contract: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`
- Ensure you have USDCx tokens for testing (bridge from Ethereum or use faucet if available)

**For Mainnet:**
- Use the official USDCx contract: `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx`
- USDCx is backed 1:1 by real USDC

### Token Transfers

All token transfers must use the correct pattern:
```clarity
;; Transfer FROM user TO contract:
(try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx transfer amount tx-sender (as-contract tx-sender) none))

;; Transfer FROM contract TO user:
(try! (as-contract (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx transfer amount tx-sender recipient none)))
```

### Error Handling

- USDCx uses standard SIP-010 error codes
- `ERR-NOT-TOKEN-OWNER` (u1) for unauthorized transfers
- `ERR-INSUFFICIENT-BALANCE` (u1) for insufficient funds

## Resources

- [Circle xReserve Documentation](https://developers.circle.com/xreserve)
- [Stacks USDCx Documentation](https://docs.stacks.co/learn/bridging/usdcx)
- [Bridge Transaction](https://sepolia.etherscan.io/tx/0xab03201abe9db66706bb84f1124f47924e0e5c030315cb8bbb7c99c81c89dcf8)

## Contact

For questions about USDCx integration, refer to:
- Circle Developer Documentation: https://developers.circle.com
- Stacks Documentation: https://docs.stacks.co
