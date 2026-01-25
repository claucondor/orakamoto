/**
 * Step 3: Buy YES tokens
 *
 * Buys YES outcome tokens for 0.1 USDC.
 */
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, waitForTx } from './config.mjs';

async function main() {
  const marketId = 1;         // First market
  const outcome = 0;          // 0 = YES, 1 = NO
  const amount = 100000;      // 0.1 USDC
  const minTokensOut = 1;     // Minimum tokens (low for testing)

  console.log('===========================================');
  console.log('Step 3: Buy YES Tokens');
  console.log('===========================================\n');

  // Generate wallet from mnemonic
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  console.log('Market ID:', marketId);
  console.log('Outcome:', outcome === 0 ? 'YES' : 'NO');
  console.log('Amount:', amount / 1000000, 'USDC');
  console.log('');

  // Build transaction
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'multi-market-pool-v3',
    functionName: 'buy-outcome',
    functionArgs: [
      uintCV(marketId),
      uintCV(outcome),
      uintCV(amount),
      uintCV(minTokensOut),
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
  console.log('YES tokens purchased!');
  console.log('===========================================');
}

main().catch(console.error);
