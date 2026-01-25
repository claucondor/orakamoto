import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, waitForTx } from './config.mjs';

async function main() {
  const marketId = 1;
  const lpAmount = 500000; // 0.5 LP tokens instead of 3

  console.log('Testing remove 0.5 LP tokens from market 1...\n');

  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'multi-market-pool-v3',
    functionName: 'remove-liquidity',
    functionArgs: [
      uintCV(marketId),
      uintCV(lpAmount),
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n,
  };

  const tx = await makeContractCall(txOptions);
  const result = await broadcastTransaction({ transaction: tx, network: NETWORK });

  if (result.error) {
    console.error('Error:', result.error);
    process.exit(1);
  }

  console.log('TxID:', result.txid);
  await waitForTx(result.txid);
  console.log('Success!');
}

main().catch(console.error);
