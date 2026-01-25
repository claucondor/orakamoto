import { generateWallet } from '@stacks/wallet-sdk';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import { MNEMONIC, NETWORK } from './config.mjs';

const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });

console.log('Wallet Addresses from Mnemonic:\n');

for (let i = 0; i < 5; i++) {
  const account = wallet.accounts[i];
  if (account) {
    const address = getAddressFromPrivateKey(account.stxPrivateKey, NETWORK);
    console.log(`Account ${i}: ${address}`);
  }
}
