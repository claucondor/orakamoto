#!/usr/bin/env node

// Request STX from testnet faucet for deployment wallet

const TESTNET_ADDRESS = 'STC5KHM41H6WHAST7MWWDD807YSPRQKJ68T330BQ';
const FAUCET_ENDPOINT = 'https://api.testnet.hiro.so/extended/v1/faucets/stx';

console.log('Requesting STX from testnet faucet...');
console.log('Address:', TESTNET_ADDRESS);
console.log('');

// Try direct POST request using native fetch
try {
  const response = await fetch(FAUCET_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'StacksPredict-Deployment/1.0',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      address: TESTNET_ADDRESS,
      stacking: false
    })
  });

  const data = await response.text();

  if (response.ok) {
    console.log('✅ Success!');
    console.log('Response:', data);
    console.log('');
    console.log('Check balance:');
    console.log(`https://explorer.hiro.so/address/${TESTNET_ADDRESS}?chain=testnet`);
  } else {
    console.error('❌ API Error:', response.status, response.statusText);
    console.error('Response:', data);

    console.log('');
    console.log('Please request manually from:');
    console.log(`https://explorer.hiro.so/sandbox/faucet?chain=testnet&address=${TESTNET_ADDRESS}`);
  }
} catch (error) {
  console.error('❌ Request failed:', error.message);
  console.log('');
  console.log('Please request manually from:');
  console.log(`https://explorer.hiro.so/sandbox/faucet?chain=testnet&address=${TESTNET_ADDRESS}`);
}
