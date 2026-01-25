/**
 * Step 7: Claim winnings
 *
 * Claims winnings after market is resolved and dispute window passes.
 * Dispute window is 5 blocks (~45 min).
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
  const marketId = 1;

  console.log('===========================================');
  console.log('Step 7: Claim Winnings');
  console.log('===========================================\n');

  // Generate wallet from mnemonic
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  const currentBlock = await getBlockHeight();
  console.log('Current block:', currentBlock);
  console.log('Market ID:', marketId);
  console.log('');

  // Build transaction
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'multi-market-pool-v3',
    functionName: 'claim',
    functionArgs: [
      uintCV(marketId),
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
  console.log('Winnings claimed!');
  console.log('===========================================');
}

main().catch(console.error);
