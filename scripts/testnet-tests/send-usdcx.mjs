import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  principalCV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { MNEMONIC, NETWORK, DEPLOYER, waitForTx } from './config.mjs';

const RECIPIENT = 'ST586FMJ5ZFHWCF3YSYVABAS9KRE9Y8QXB0HAVMT';
const AMOUNT = 5000000; // 5 USDC

async function main() {
  console.log('Sending 5 USDC to', RECIPIENT);
  
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;
  
  const txOptions = {
    contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    contractName: 'usdcx',
    functionName: 'transfer',
    functionArgs: [
      uintCV(AMOUNT),
      principalCV(DEPLOYER),
      principalCV(RECIPIENT),
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 5000n,
  };

  const tx = await makeContractCall(txOptions);
  const result = await broadcastTransaction({ transaction: tx, network: NETWORK });

  if (result.error) {
    console.error('Error:', result.error, result.reason);
    process.exit(1);
  }

  console.log('TxID:', result.txid);
  await waitForTx(result.txid);
  console.log('Done!');
}

main().catch(console.error);
