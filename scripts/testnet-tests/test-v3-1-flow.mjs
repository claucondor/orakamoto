/**
 * Test V3.1 Full Flow - Verify LP token accounting works
 *
 * This tests the new multi-market-pool-v3-1 with dedicated sip013-lp-token-v1-1
 * to ensure LP token accounting works correctly (no conflicts with v2/v3)
 */
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  stringUtf8CV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, waitForTx, getBlockHeight } from './config.mjs';

const POOL_CONTRACT = 'multi-market-pool-v3-1';
const LP_TOKEN_CONTRACT = 'sip013-lp-token-v1-1';

async function main() {
  console.log('===========================================');
  console.log('Testing V3.1 Full Flow');
  console.log('===========================================\n');

  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  // Step 1: Get current block height for deadline
  const currentBlock = await getBlockHeight();
  const deadline = currentBlock + 144; // ~24 hours
  const resolutionDeadline = deadline + 6; // ~1 hour after deadline

  console.log('Current block:', currentBlock);
  console.log('Deadline block:', deadline);
  console.log('');

  // Step 2: Create market with 1 USDC initial liquidity
  console.log('Step 1: Creating market...');
  const createTx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName: POOL_CONTRACT,
    functionName: 'create-market',
    functionArgs: [
      stringUtf8CV('Will BTC reach $150k by end of 2026?'),
      uintCV(deadline),
      uintCV(resolutionDeadline),
      uintCV(1000000), // 1 USDC
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n,
  });

  const createResult = await broadcastTransaction({ transaction: createTx, network: NETWORK });
  if (createResult.error) {
    console.error('Error creating market:', createResult.error);
    process.exit(1);
  }
  console.log('TxID:', createResult.txid);
  await waitForTx(createResult.txid);

  // Assume market-id = 1 (first market in v3-1)
  const marketId = 1;
  console.log('\n✅ Market created! Market ID:', marketId);
  console.log('');

  // Step 3: Add liquidity (2 USDC)
  console.log('Step 2: Adding liquidity (2 USDC)...');
  const addLiquidityTx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName: POOL_CONTRACT,
    functionName: 'add-liquidity',
    functionArgs: [
      uintCV(marketId),
      uintCV(2000000), // 2 USDC
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n,
  });

  const addLiqResult = await broadcastTransaction({ transaction: addLiquidityTx, network: NETWORK });
  if (addLiqResult.error) {
    console.error('Error adding liquidity:', addLiqResult.error);
    process.exit(1);
  }
  console.log('TxID:', addLiqResult.txid);
  await waitForTx(addLiqResult.txid);
  console.log('✅ Liquidity added!');
  console.log('');

  // Step 4: Buy YES tokens (0.5 USDC)
  console.log('Step 3: Buying YES tokens (0.5 USDC)...');
  const buyTx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName: POOL_CONTRACT,
    functionName: 'buy-outcome',
    functionArgs: [
      uintCV(marketId),
      uintCV(0), // YES = 0
      uintCV(500000), // 0.5 USDC
      uintCV(0), // min tokens = 0 (no slippage check)
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n,
  });

  const buyResult = await broadcastTransaction({ transaction: buyTx, network: NETWORK });
  if (buyResult.error) {
    console.error('Error buying YES:', buyResult.error);
    process.exit(1);
  }
  console.log('TxID:', buyResult.txid);
  await waitForTx(buyResult.txid);
  console.log('✅ YES tokens purchased!');
  console.log('');

  // Step 5: Remove liquidity (1 LP token)
  console.log('Step 4: Removing liquidity (1 LP token)...');
  const removeLiqTx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName: POOL_CONTRACT,
    functionName: 'remove-liquidity',
    functionArgs: [
      uintCV(marketId),
      uintCV(1000000), // 1 LP token
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n,
  });

  const removeLiqResult = await broadcastTransaction({ transaction: removeLiqTx, network: NETWORK });
  if (removeLiqResult.error) {
    console.error('Error removing liquidity:', removeLiqResult.error);
    process.exit(1);
  }
  console.log('TxID:', removeLiqResult.txid);
  await waitForTx(removeLiqResult.txid);
  console.log('✅ Liquidity removed!');
  console.log('');

  console.log('===========================================');
  console.log('✅ V3.1 Full Flow Test Complete!');
  console.log('===========================================');
  console.log('');
  console.log('Next steps:');
  console.log('1. Check LP balance with: node scripts/testnet-tests/check-lp-balance.mjs');
  console.log('2. Check market state with: node scripts/testnet-tests/04-check-market.mjs');
  console.log('3. Verify LP token accounting is correct (no conflicts with v2/v3)');
}

main().catch(console.error);
