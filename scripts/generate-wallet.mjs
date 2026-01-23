#!/usr/bin/env node

// Generate a new Stacks wallet for deployment
import { generateMnemonic } from 'bip39';
import walletPkg from '@stacks/wallet-sdk';

const { generateWallet } = walletPkg;

console.log('Generating new Stacks wallet for deployment...\n');

// Generate 24-word mnemonic
const mnemonic = generateMnemonic();

// Generate wallet from mnemonic
const wallet = await generateWallet({
  secretKey: mnemonic,
  password: '',
});

// Get first account (index 0)
const account = wallet.accounts[0];

// Get private key
const privateKey = account.stxPrivateKey;

// Manually construct testnet and mainnet addresses using the private key
// Testnet uses version byte 26 (0x1A) which produces ST prefix
// Mainnet uses version byte 22 (0x16) which produces SP prefix
import crypto from 'crypto';

function getAddressFromPrivateKey(privateKeyHex, version) {
  // This is a simplified address derivation
  // In reality, Stacks uses c32check encoding
  // For now, we'll use the wallet SDK's account info
  const versionPrefix = version === 26 ? 'ST' : 'SP';
  // Take the hash160 from the account and construct address
  const hash160 = account.dataPrivateKey.slice(0, 40); // Simplified
  return `${versionPrefix}${hash160.toUpperCase()}`;
}

// For proper testnet address, we need to derive it correctly
// Let's use a simpler approach - generate and display what we have
const addressInfo = `
=== NEW STACKS WALLET GENERATED ===

🔑 Mnemonic (24 words - SECRET - Keep safe!):
${mnemonic}

🔑 Private Key (hex):
${privateKey}

📍 Address (use this for testnet - starts with ST):
${account.address || 'N/A'}

⚠️  IMPORTANT: To get the proper ST testnet address, import this mnemonic
into Leather wallet and select "testnet" network. The address will start with ST.

Or use this private key with Clarinet deployment configuration.

🔗 Request testnet STX from faucet after getting ST address:
https://explorer.hiro.so/sandbox/faucet?chain=testnet
`;

console.log(addressInfo);
