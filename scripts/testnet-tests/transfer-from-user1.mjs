/**
 * Transfer USDCx from User1 to recipient
 */
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  principalCV,
  PostConditionMode,
  noneCV,
} from '@stacks/transactions';
import { NETWORK, waitForTx } from './config.mjs';

async function main() {
  const sender = 'ST23FF3CP9D662CJ5PG2TH8NJNAQ2Y0R002BF7QAK'; // User1
  const privateKey = '751635ce09430b405825b3a1d97e5cf7a85129b028163adac3dfdcb870e03f7501'; // User1 private key
  const recipient = process.argv[2];
  const amount = process.argv[3] ? parseInt(process.argv[3]) : 8;

  if (!recipient) {
    console.error('Usage: node transfer-from-user1.mjs <recipient-address> [amount]');
    process.exit(1);
  }

  console.log('===========================================');
  console.log('Transferring USDCx from User1');
  console.log('===========================================\n');
  console.log('From:', sender);
  console.log('To:', recipient);
  console.log('Amount:', amount, 'USDCx\n');

  const txOptions = {
    contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    contractName: 'usdcx',
    functionName: 'transfer',
    functionArgs: [
      uintCV(amount * 1000000), // Convert to micro-units
      principalCV(sender),
      principalCV(recipient),
      noneCV(),
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 10000n,
  };

  const tx = await makeContractCall(txOptions);
  const result = await broadcastTransaction({ transaction: tx, network: NETWORK });

  if (result.error) {
    console.error('Error:', result.error);
    process.exit(1);
  }

  console.log('TxID:', result.txid);
  await waitForTx(result.txid);

  console.log('\n✅ Transfer complete!');
  console.log(`${recipient} now has ${amount} more USDCx`);
}

main().catch(console.error);
