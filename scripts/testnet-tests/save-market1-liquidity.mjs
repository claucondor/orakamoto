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
  const lpAmount = 1000000; // Try removing 1 LP token (should match market liquidity)

  console.log('===========================================');
  console.log('Salvando liquidez del mercado 1');
  console.log('===========================================\n');
  console.log('Removiendo 1 LP token...\n');

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
  
  console.log('\n✅ Liquidez removida!');
  console.log('Te quedan 1.5 LP tokens restantes (probablemente del v2)');
}

main().catch(console.error);
