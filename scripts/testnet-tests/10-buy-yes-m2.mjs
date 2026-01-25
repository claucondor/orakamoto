import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, waitForTx } from './config.mjs';

async function main() {
  const marketId = 2;
  const outcome = 0; // YES
  const amount = 300000; // 0.3 USDC
  const minTokens = 0;

  console.log('===========================================');
  console.log('Buy YES - Market 2');
  console.log('===========================================\n');

  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  console.log('Market ID:', marketId);
  console.log('Amount:', amount / 1000000, 'USDC');
  console.log('');

  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'multi-market-pool-v3',
    functionName: 'buy-outcome',
    functionArgs: [
      uintCV(marketId),
      uintCV(outcome),
      uintCV(amount),
      uintCV(minTokens),
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
    process.exit(1);
  }

  console.log('\nTxID:', result.txid);
  await waitForTx(result.txid);
  console.log('\n===========================================');
  console.log('YES tokens purchased!');
  console.log('===========================================');
}

main().catch(console.error);
