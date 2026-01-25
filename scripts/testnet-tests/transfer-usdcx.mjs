/**
 * Transfer USDCx from deployer to recipient
 */
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  principalCV,
  PostConditionMode,
  noneCV,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, waitForTx } from './config.mjs';

async function main() {
  const recipient = process.argv[2];
  const amount = process.argv[3] ? parseInt(process.argv[3]) : 20;

  if (!recipient) {
    console.error('Usage: node transfer-usdcx.mjs <recipient-address> [amount]');
    console.error('Example: node transfer-usdcx.mjs ST586FMJ5ZFHWCF3YSYVABAS9KRE9Y8QXB0HAVMT 20');
    process.exit(1);
  }

  console.log('===========================================');
  console.log('Transferring USDCx');
  console.log('===========================================\n');
  console.log('From:', DEPLOYER);
  console.log('To:', recipient);
  console.log('Amount:', amount, 'USDCx\n');

  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  const txOptions = {
    contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    contractName: 'usdcx',
    functionName: 'transfer',
    functionArgs: [
      uintCV(amount * 1000000), // Convert to micro-units
      principalCV(DEPLOYER),
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
