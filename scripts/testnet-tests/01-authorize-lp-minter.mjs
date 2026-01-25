/**
 * Step 1: Authorize multi-market-pool as LP token minter
 *
 * This is REQUIRED before creating any markets.
 * Only needs to be run once after deployment.
 *
 * Usage:
 *   node 01-authorize-lp-minter.mjs          # Authorize v3
 *   node 01-authorize-lp-minter.mjs v3.1     # Authorize v3.1
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
  // Check if we should use v3.1
  const useV3_1 = process.argv[2] === 'v3.1';

  const lpTokenContract = useV3_1 ? 'sip013-lp-token-v1-1' : 'sip013-lp-token';
  const poolContract = useV3_1 ? CONTRACTS.poolV3_1 : CONTRACTS.pool;

  console.log('===========================================');
  console.log(`Step 1: Authorize LP Token Minter (${useV3_1 ? 'V3.1' : 'V3'})`);
  console.log('===========================================\n');

  // Generate wallet from mnemonic
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  console.log('Deployer:', DEPLOYER);
  console.log('LP Token:', `${DEPLOYER}.${lpTokenContract}`);
  console.log('Pool:', poolContract);
  console.log('');

  // Build transaction
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: lpTokenContract,
    functionName: 'set-authorized-minter',
    functionArgs: [principalCV(poolContract)],
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
