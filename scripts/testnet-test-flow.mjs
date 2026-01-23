#!/usr/bin/env node

/**
 * Testnet Test Flow for StacksPredict
 *
 * Steps:
 * 1. Check USDCx balance
 * 2. Check market count
 * 3. Create a test market (optional)
 * 4. Verify market was created
 */

import txPkg from '@stacks/transactions';
const {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  stringUtf8CV,
  uintCV,
  noneCV,
  fetchCallReadOnlyFunction,
  standardPrincipalCV
} = txPkg;
import netPkg from '@stacks/network';
const { STACKS_TESTNET } = netPkg;

// Configuration
const network = STACKS_TESTNET;

// Your deployed contract
const MARKET_FACTORY_ADDRESS = 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC';
const MARKET_FACTORY_NAME = 'market-factory-v2';

// USDCx on testnet
const USDCX_ADDRESS = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
const USDCX_NAME = 'usdcx';

// Your wallet address
const WALLET_ADDRESS = 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC';

async function checkUSDCxBalance() {
  console.log('📊 Step 1: Checking USDCx balance...\n');

  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: USDCX_ADDRESS,
      contractName: USDCX_NAME,
      functionName: 'get-balance',
      functionArgs: [standardPrincipalCV(WALLET_ADDRESS)],
      network,
      senderAddress: WALLET_ADDRESS,
    });

    console.log('USDCx Balance:', result);

    // Parse the response
    if (result.type === 7) { // ok response
      const balance = result.value.value;
      const balanceUsdc = Number(balance) / 1000000;
      console.log(`✅ Balance: ${balanceUsdc} USDCx (${balance} raw)\n`);
      return Number(balance);
    } else {
      console.log('❌ Error getting balance:', result);
      return 0;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return 0;
  }
}

async function checkMarketCount() {
  console.log('📊 Step 2: Checking market count...\n');

  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: MARKET_FACTORY_ADDRESS,
      contractName: MARKET_FACTORY_NAME,
      functionName: 'get-market-count',
      functionArgs: [],
      network,
      senderAddress: WALLET_ADDRESS,
    });

    console.log('Market Count Result:', result);

    if (result.type === 7) { // ok response
      const count = Number(result.value.value);
      console.log(`✅ Total markets: ${count}\n`);
      return count;
    }
    return 0;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return 0;
  }
}

async function getMarket(marketId) {
  console.log(`📊 Getting market #${marketId}...\n`);

  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: MARKET_FACTORY_ADDRESS,
      contractName: MARKET_FACTORY_NAME,
      functionName: 'get-market',
      functionArgs: [uintCV(marketId)],
      network,
      senderAddress: WALLET_ADDRESS,
    });

    console.log('Market Data:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function createTestMarket() {
  console.log('🚀 Step 3: Creating test market...\n');

  const privateKey = process.env.STACKS_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ STACKS_PRIVATE_KEY not set. Skipping market creation.');
    console.log('Set it with: export STACKS_PRIVATE_KEY=your_private_key');
    return null;
  }

  // Get current block height from API
  const blockResponse = await fetch('https://api.testnet.hiro.so/v2/info');
  const blockInfo = await blockResponse.json();
  const currentBlock = blockInfo.stacks_tip_height;

  // Set deadline to 1000 blocks in the future (~7 days)
  const deadline = currentBlock + 1000;

  console.log(`Current block: ${currentBlock}`);
  console.log(`Deadline block: ${deadline}`);
  console.log(`Collateral: 1 USDCx (1000000 raw)\n`);

  const txOptions = {
    contractAddress: MARKET_FACTORY_ADDRESS,
    contractName: MARKET_FACTORY_NAME,
    functionName: 'create-market',
    functionArgs: [
      stringUtf8CV('Will BTC reach $150k by March 2026?'),  // question
      uintCV(deadline),                                      // deadline (block height)
      noneCV(),                                              // resolution-deadline (use default)
      uintCV(1000000),                                       // collateral: 1 USDCx (6 decimals)
    ],
    senderKey: privateKey,
    network,
    anchorMode: AnchorMode.Any,
    fee: 50000, // 0.05 STX
  };

  try {
    const transaction = await makeContractCall(txOptions);
    console.log('Broadcasting transaction...');

    const broadcastResponse = await broadcastTransaction(transaction, network);

    if (broadcastResponse.error) {
      console.error('❌ Broadcast error:', broadcastResponse.error);
      console.error('Reason:', broadcastResponse.reason);
      return null;
    }

    console.log('✅ Transaction broadcast!');
    console.log('Transaction ID:', broadcastResponse.txid);
    console.log('\nView on explorer:');
    console.log(`https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=testnet`);
    return broadcastResponse.txid;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  console.log('='.repeat(60));
  console.log('🏦 StacksPredict Testnet Test Flow');
  console.log('='.repeat(60));
  console.log(`Contract: ${MARKET_FACTORY_ADDRESS}.${MARKET_FACTORY_NAME}`);
  console.log(`Wallet: ${WALLET_ADDRESS}`);
  console.log('='.repeat(60) + '\n');

  switch (command) {
    case 'balance':
      await checkUSDCxBalance();
      break;

    case 'count':
      await checkMarketCount();
      break;

    case 'market':
      const marketId = parseInt(args[1]) || 1;
      await getMarket(marketId);
      break;

    case 'create':
      const balance = await checkUSDCxBalance();
      if (balance < 1000000) {
        console.log('❌ Insufficient USDCx balance. Need at least 1 USDCx.');
        console.log('\nTo get USDCx, you need to bridge from Sepolia testnet.');
        console.log('See: scripts/bridge-testnet.mjs');
        return;
      }
      await createTestMarket();
      break;

    case 'check':
    default:
      await checkUSDCxBalance();
      await checkMarketCount();
      break;
  }

  console.log('\n' + '='.repeat(60));
  console.log('Commands:');
  console.log('  node scripts/testnet-test-flow.mjs balance  - Check USDCx balance');
  console.log('  node scripts/testnet-test-flow.mjs count    - Check market count');
  console.log('  node scripts/testnet-test-flow.mjs market 1 - Get market #1 details');
  console.log('  node scripts/testnet-test-flow.mjs create   - Create test market');
  console.log('  node scripts/testnet-test-flow.mjs check    - Check balance + count');
  console.log('='.repeat(60));
}

main().catch(console.error);
