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
  const amount = 2000000; // 2 USDC

  console.log('===========================================');
  console.log('Add Liquidity to Market', marketId);
  console.log('===========================================\n');
  console.log('Amount:', amount / 1000000, 'USDC');

  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'multi-market-pool-v3',
    functionName: 'add-liquidity',
    functionArgs: [
      uintCV(marketId),
      uintCV(amount),
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
  console.log('Liquidity added successfully!');
  console.log('===========================================');
}

main().catch(console.error);
