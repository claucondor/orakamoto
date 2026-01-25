/**
 * Step 2: Create a prediction market
 *
 * Creates a binary market with 1 USDC initial liquidity.
 * Deadline set to +10 blocks (~1 hour) for quick testing.
 */
import {
  makeContractCall,
  broadcastTransaction,
  stringUtf8CV,
  uintCV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, CONTRACTS, waitForTx, getBlockHeight } from './config.mjs';

async function main() {
  console.log('===========================================');
  console.log('Step 2: Create Prediction Market');
  console.log('===========================================\n');

  // Generate wallet from mnemonic
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  // Get current block height for deadline
  const currentBlock = await getBlockHeight();
  const deadline = currentBlock + 10;           // +10 blocks (~1 hour)
  const resolutionDeadline = currentBlock + 50; // +50 blocks (~5 hours)
  const initialLiquidity = 1000000;             // 1 USDC (6 decimals)

  console.log('Current block:', currentBlock);
  console.log('Deadline:', deadline, `(+10 blocks)`);
  console.log('Resolution deadline:', resolutionDeadline, `(+50 blocks)`);
  console.log('Initial liquidity:', initialLiquidity / 1000000, 'USDC');
  console.log('');

  const question = "Will STX reach $5 this week?";

  // Build transaction
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'multi-market-pool-v2',
    functionName: 'create-market',
    functionArgs: [
      stringUtf8CV(question),
      uintCV(deadline),
      uintCV(resolutionDeadline),
      uintCV(initialLiquidity),
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n, // 0.05 STX
  };

  console.log('Question:', question);
  console.log('Building transaction...');
  const tx = await makeContractCall(txOptions);

  console.log('Broadcasting...');
  const result = await broadcastTransaction({ transaction: tx, network: NETWORK });

  if (result.error) {
    console.error('Broadcast error:', result.error);
    console.error('Reason:', result.reason);
    process.exit(1);
  }

  console.log('\nTransaction broadcast successfully!');
  console.log('TxID:', result.txid);

  // Wait for confirmation
  const txData = await waitForTx(result.txid);

  console.log('\n===========================================');
  console.log('Market created!');
  console.log('Market ID: Check the transaction result');
  console.log('===========================================');
}

main().catch(console.error);
