#!/usr/bin/env node

import { makeContractCall, broadcastTransaction, AnchorMode, stringUtf8CV, uintCV } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';

// Configuration
const network = new StacksTestnet();
const privateKey = process.env.STACKS_PRIVATE_KEY;

if (!privateKey) {
  console.error('Error: STACKS_PRIVATE_KEY environment variable not set');
  process.exit(1);
}

// TODO: Update these addresses when contracts are deployed
const MARKET_FACTORY_ADDRESS = 'ST7NF22X51JPBHWRDCM29FKFJ8NSWY4NEW7ZEMZF';
const MARKET_FACTORY_NAME = 'market-factory';

async function createTestMarket() {
  console.log('Creating test market with USDCx...\n');

  const txOptions = {
    contractAddress: MARKET_FACTORY_ADDRESS,
    contractName: MARKET_FACTORY_NAME,
    functionName: 'create-market',
    functionArgs: [
      stringUtf8CV('Will Bitcoin reach $100k by Feb 1, 2026?'),
      stringUtf8CV('Test market for hackathon demo'),
      uintCV(1738444800), // Feb 1, 2026 00:00 UTC
      uintCV(5000000), // 5 USDCx (6 decimals)
    ],
    senderKey: privateKey,
    network,
    anchorMode: AnchorMode.Any,
  };

  try {
    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, network);

    console.log('✅ Market creation transaction broadcast!');
    console.log('Transaction ID:', broadcastResponse.txid);
    console.log('\nView on explorer:');
    console.log(`https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=testnet`);
    console.log('\nWait 1-2 minutes for confirmation...');
  } catch (error) {
    console.error('Error creating market:', error);
    process.exit(1);
  }
}

createTestMarket();
