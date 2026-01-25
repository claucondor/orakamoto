/**
 * Step 6: Resolve market
 *
 * Resolves the market after deadline passes.
 * Only the market creator can resolve.
 */
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, waitForTx, getBlockHeight } from './config.mjs';

async function main() {
  const marketId = 2;
  const winningOutcome = 0; // 0 = YES wins, 1 = NO wins

  console.log('===========================================');
  console.log('Step 6: Resolve Market');
  console.log('===========================================\n');

  // Check current block
  const currentBlock = await getBlockHeight();
  console.log('Current block:', currentBlock);
  console.log('Resolving market...');
  console.log('');

  // Generate wallet from mnemonic
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  console.log('Market ID:', marketId);
  console.log('Winning outcome:', winningOutcome === 0 ? 'YES' : 'NO');
  console.log('');

  // Build transaction
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'multi-market-pool-v3',
    functionName: 'resolve',
    functionArgs: [
      uintCV(marketId),
      uintCV(winningOutcome),
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n,
  };

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

  await waitForTx(result.txid);

  console.log('\n===========================================');
  console.log('Market resolved! YES wins.');
  console.log('Wait 5 blocks for dispute window, then claim.');
  console.log('===========================================');
}

main().catch(console.error);
