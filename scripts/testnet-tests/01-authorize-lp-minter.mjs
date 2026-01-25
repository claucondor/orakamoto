/**
 * Step 1: Authorize multi-market-pool as LP token minter
 *
 * This is REQUIRED before creating any markets.
 * Only needs to be run once after deployment.
 */
import {
  makeContractCall,
  broadcastTransaction,
  principalCV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, CONTRACTS, waitForTx } from './config.mjs';

async function main() {
  console.log('===========================================');
  console.log('Step 1: Authorize LP Token Minter');
  console.log('===========================================\n');

  // Generate wallet from mnemonic
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  console.log('Deployer:', DEPLOYER);
  console.log('LP Token:', CONTRACTS.lpToken);
  console.log('Pool:', CONTRACTS.pool);
  console.log('');

  // Build transaction
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'sip013-lp-token',
    functionName: 'set-authorized-minter',
    functionArgs: [principalCV(CONTRACTS.pool)],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 10000n, // 0.01 STX
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

  // Wait for confirmation
  await waitForTx(result.txid);

  console.log('\n===========================================');
  console.log('LP Token minter authorized!');
  console.log('You can now create markets.');
  console.log('===========================================');
}

main().catch(console.error);
