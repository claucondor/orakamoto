import {
  makeSTXTokenTransfer,
  broadcastTransaction,
  AnchorMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { MNEMONIC, NETWORK, waitForTx } from './config.mjs';

const RECIPIENT = 'ST586FMJ5ZFHWCF3YSYVABAS9KRE9Y8QXB0HAVMT';
const AMOUNT = 10000000n; // 10 STX

async function main() {
  console.log('Sending 10 STX to', RECIPIENT);
  
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  const txOptions = {
    recipient: RECIPIENT,
    amount: AMOUNT,
    senderKey: privateKey,
    network: NETWORK,
    anchorMode: AnchorMode.Any,
    fee: 1000n,
  };

  const tx = await makeSTXTokenTransfer(txOptions);
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
