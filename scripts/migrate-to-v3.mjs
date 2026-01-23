#!/usr/bin/env node

/**
 * StacksPredict V2 to V3 Migration Helper Script
 *
 * This script helps users migrate their liquidity and positions from V2 to V3.
 *
 * IMPORTANT: V2 and V3 are architecturally incompatible. This is NOT an automatic migration.
 * Users must manually withdraw from V2 and optionally create new markets in V3.
 *
 * V2 Architecture:
 * - market-pool (singleton) - one market per contract
 * - LP tokens as internal maps (non-transferible)
 * - market-factory-v2
 *
 * V3 Architecture:
 * - multi-market-pool - unlimited markets per contract
 * - LP tokens as SIP-013 (transferible)
 * - market-factory-v3
 *
 * Migration Steps:
 * 1. Withdraw liquidity from V2 markets
 * 2. Claim any pending winnings from V2
 * 3. (Optional) Create new markets in V3
 * 4. (Optional) Add liquidity to V3 markets
 */

import { makeContractCall, broadcastTransaction, AnchorMode, uintCV, principalCV, tupleCV, noneCV, someCV } from '@stacks/transactions';
import { StacksTestnet, StacksMainnet } from '@stacks/network';

// Configuration
const NETWORK = process.env.STACKS_NETWORK || 'testnet';
const network = NETWORK === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
const privateKey = process.env.STACKS_PRIVATE_KEY;

if (!privateKey) {
  console.error('Error: STACKS_PRIVATE_KEY environment variable not set');
  console.error('Usage: STACKS_PRIVATE_KEY=your_key node scripts/migrate-to-v3.mjs');
  process.exit(1);
}

// V2 Contract Addresses (Testnet)
const V2_CONTRACTS = {
  testnet: {
    MARKET_POOL: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-pool',
    MARKET_FACTORY_V2: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-factory-v2',
    MOCK_USDC: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.mock-usdc',
  },
  mainnet: {
    // TODO: Update with mainnet addresses when deployed
    MARKET_POOL: '',
    MARKET_FACTORY_V2: '',
    MOCK_USDC: '',
  }
};

// V3 Contract Addresses (To be updated after deployment)
const V3_CONTRACTS = {
  testnet: {
    MARKET_FACTORY_V3: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-factory-v3',
    MULTI_MARKET_POOL: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-market-pool',
    USDCX: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
  },
  mainnet: {
    // TODO: Update with mainnet addresses when deployed
    MARKET_FACTORY_V3: '',
    MULTI_MARKET_POOL: '',
    USDCX: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
  }
};

const v2Contracts = V2_CONTRACTS[NETWORK];
const v3Contracts = V3_CONTRACTS[NETWORK];

/**
 * Get LP token balance from V2 market-pool
 */
async function getV2LpBalance() {
  console.log('Checking V2 LP token balance...\n');
  // This would require a read-only call to get-balance
  // For now, users need to check via explorer or console
  console.log('Please check your V2 LP balance via:');
  console.log(`1. Clarinet console: clarinet console --${NETWORK}`);
  console.log(`2. Command: (contract-call? '${v2Contracts.MARKET_POOL} get-balance tx-sender)`);
  console.log(' ');
}

/**
 * Withdraw liquidity from V2 market-pool
 * @param {number} lpAmount - Amount of LP tokens to withdraw (6 decimals)
 */
async function withdrawV2Liquidity(lpAmount) {
  console.log(`Withdrawing ${lpAmount / 1e6} LP tokens from V2 market-pool...\n`);

  const [contractAddress, contractName] = v2Contracts.MARKET_POOL.split('.');

  const txOptions = {
    contractAddress,
    contractName,
    functionName: 'remove-liquidity',
    functionArgs: [
      uintCV(lpAmount), // lp-amount
      uintCV(0), // min-usdc-out (accept any amount to ensure withdrawal succeeds)
    ],
    senderKey: privateKey,
    network,
    anchorMode: AnchorMode.Any,
  };

  try {
    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, network);

    console.log('✅ V2 liquidity withdrawal transaction broadcast!');
    console.log('Transaction ID:', broadcastResponse.txid);
    console.log('\nView on explorer:');
    console.log(`https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=${NETWORK}`);
    console.log('\nWait 1-2 minutes for confirmation...');
    return broadcastResponse.txid;
  } catch (error) {
    console.error('Error withdrawing V2 liquidity:', error);
    throw error;
  }
}

/**
 * Claim winnings from V2 market-pool (if market is resolved)
 */
async function claimV2Winnings() {
  console.log('Claiming winnings from V2 market-pool...\n');

  const [contractAddress, contractName] = v2Contracts.MARKET_POOL.split('.');

  const txOptions = {
    contractAddress,
    contractName,
    functionName: 'claim',
    functionArgs: [],
    senderKey: privateKey,
    network,
    anchorMode: AnchorMode.Any,
  };

  try {
    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, network);

    console.log('✅ V2 winnings claim transaction broadcast!');
    console.log('Transaction ID:', broadcastResponse.txid);
    console.log('\nView on explorer:');
    console.log(`https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=${NETWORK}`);
    console.log('\nWait 1-2 minutes for confirmation...');
    return broadcastResponse.txid;
  } catch (error) {
    console.error('Error claiming V2 winnings:', error);
    throw error;
  }
}

/**
 * Create a new market in V3
 * @param {string} question - Market question
 * @param {string} category - Market category
 * @param {number} deadline - Market deadline (Unix timestamp)
 * @param {number} initialLiquidity - Initial liquidity in USDC (6 decimals)
 */
async function createV3Market(question, category, deadline, initialLiquidity) {
  console.log(`Creating new V3 market: "${question}"\n`);

  const [contractAddress, contractName] = v3Contracts.MARKET_FACTORY_V3.split('.');

  const txOptions = {
    contractAddress,
    contractName,
    functionName: 'create-market',
    functionArgs: [
      uintCV(deadline), // trading-deadline
      uintCV(deadline + 604800), // resolution-deadline (7 days after trading)
      uintCV(initialLiquidity), // initial-liquidity
      tupleCV({
        'question': stringUtf8CV(question),
        'category': stringUtf8CV(category),
        'tags': someCV(listCV([])), // No tags
      }),
    ],
    senderKey: privateKey,
    network,
    anchorMode: AnchorMode.Any,
  };

  try {
    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, network);

    console.log('✅ V3 market creation transaction broadcast!');
    console.log('Transaction ID:', broadcastResponse.txid);
    console.log('\nView on explorer:');
    console.log(`https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=${NETWORK}`);
    console.log('\nWait 1-2 minutes for confirmation...');
    return broadcastResponse.txid;
  } catch (error) {
    console.error('Error creating V3 market:', error);
    throw error;
  }
}

/**
 * Add liquidity to V3 market
 * @param {number} marketId - Market ID
 * @param {number} amount - Liquidity amount in USDC (6 decimals)
 */
async function addV3Liquidity(marketId, amount) {
  console.log(`Adding ${amount / 1e6} USDC liquidity to V3 market ${marketId}...\n`);

  const [contractAddress, contractName] = v3Contracts.MULTI_MARKET_POOL.split('.');

  const txOptions = {
    contractAddress,
    contractName,
    functionName: 'add-liquidity',
    functionArgs: [
      uintCV(marketId), // market-id
      uintCV(amount), // amount
    ],
    senderKey: privateKey,
    network,
    anchorMode: AnchorMode.Any,
  };

  try {
    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, network);

    console.log('✅ V3 liquidity addition transaction broadcast!');
    console.log('Transaction ID:', broadcastResponse.txid);
    console.log('\nView on explorer:');
    console.log(`https://explorer.hiro.so/txid/${broadcastResponse.txid}?chain=${NETWORK}`);
    console.log('\nWait 1-2 minutes for confirmation...');
    return broadcastResponse.txid;
  } catch (error) {
    console.error('Error adding V3 liquidity:', error);
    throw error;
  }
}

/**
 * Main migration flow
 */
async function main() {
  console.log('========================================');
  console.log('StacksPredict V2 to V3 Migration Helper');
  console.log('========================================');
  console.log(`Network: ${NETWORK}`);
  console.log(' ');

  const action = process.argv[2];

  switch (action) {
    case 'check-balance':
      await getV2LpBalance();
      break;

    case 'withdraw':
      const lpAmount = parseInt(process.argv[3]);
      if (!lpAmount || lpAmount <= 0) {
        console.error('Error: Invalid LP amount. Usage: node scripts/migrate-to-v3.mjs withdraw <amount_in_micro_usdc>');
        process.exit(1);
      }
      await withdrawV2Liquidity(lpAmount);
      console.log('\n✅ Step 1 complete: V2 liquidity withdrawn');
      console.log('\nNext steps:');
      console.log('1. Wait for transaction confirmation');
      console.log('2. Run: node scripts/migrate-to-v3.mjs claim-winnings (if you have winnings to claim)');
      console.log('3. Run: node scripts/migrate-to-v3.mjs create-v3-market <question> <category> <deadline> <liquidity>');
      break;

    case 'claim-winnings':
      await claimV2Winnings();
      console.log('\n✅ V2 winnings claimed');
      console.log('\nNext steps:');
      console.log('Run: node scripts/migrate-to-v3.mjs create-v3-market <question> <category> <deadline> <liquidity>');
      break;

    case 'create-v3-market':
      const question = process.argv[3];
      const category = process.argv[4] || 'general';
      const deadline = parseInt(process.argv[5]);
      const liquidity = parseInt(process.argv[6]);

      if (!question || !deadline || !liquidity) {
        console.error('Error: Missing required arguments');
        console.error('Usage: node scripts/migrate-to-v3.mjs create-v3-market <question> <category> <deadline> <liquidity_micro_usdc>');
        console.error('Example: node scripts/migrate-to-v3.mjs create-v3-market "Will BTC reach 100k?" crypto 1738360800 5000000');
        process.exit(1);
      }

      await createV3Market(question, category, deadline, liquidity);
      console.log('\n✅ Step 2 complete: V3 market created');
      console.log('\nNext steps:');
      console.log('Run: node scripts/migrate-to-v3.mjs add-v3-liquidity <market_id> <amount_micro_usdc>');
      break;

    case 'add-v3-liquidity':
      const marketId = parseInt(process.argv[3]);
      const addAmount = parseInt(process.argv[4]);

      if (!marketId || !addAmount) {
        console.error('Error: Missing required arguments');
        console.error('Usage: node scripts/migrate-to-v3.mjs add-v3-liquidity <market_id> <amount_micro_usdc>');
        process.exit(1);
      }

      await addV3Liquidity(marketId, addAmount);
      console.log('\n✅ Step 3 complete: V3 liquidity added');
      console.log('\n🎉 Migration complete! You now have LP positions in V3.');
      break;

    default:
      console.log('Available commands:');
      console.log(' ');
      console.log('Step 1 - Check V2 Balance:');
      console.log('  node scripts/migrate-to-v3.mjs check-balance');
      console.log(' ');
      console.log('Step 1 - Withdraw V2 Liquidity:');
      console.log('  node scripts/migrate-to-v3.mjs withdraw <lp_amount_in_micro_usdc>');
      console.log('  Example: node scripts/migrate-to-v3.mjs withdraw 10000000 (withdraws 10 USDC LP tokens)');
      console.log(' ');
      console.log('Step 1 (Optional) - Claim V2 Winnings:');
      console.log('  node scripts/migrate-to-v3.mjs claim-winnings');
      console.log(' ');
      console.log('Step 2 - Create V3 Market:');
      console.log('  node scripts/migrate-to-v3.mjs create-v3-market <question> <category> <deadline> <liquidity_micro_usdc>');
      console.log('  Example: node scripts/migrate-to-v3.mjs create-v3-market "Will BTC reach 100k?" crypto 1738360800 5000000');
      console.log(' ');
      console.log('Step 3 - Add Liquidity to V3 Market:');
      console.log('  node scripts/migrate-to-v3.mjs add-v3-liquidity <market_id> <amount_micro_usdc>');
      console.log('  Example: node scripts/migrate-to-v3.mjs add-v3-liquidity 0 5000000');
      console.log(' ');
      console.log('Full Migration Example:');
      console.log('  # Withdraw 10 USDC LP from V2');
      console.log('  node scripts/migrate-to-v3.mjs withdraw 10000000');
      console.log('  # Create new V3 market with 5 USDC liquidity');
      console.log('  node scripts/migrate-to-v3.mjs create-v3-market "Will BTC reach 100k?" crypto 1738360800 5000000');
      console.log('  # Add additional 5 USDC liquidity to market 0');
      console.log('  node scripts/migrate-to-v3.mjs add-v3-liquidity 0 5000000');
      console.log(' ');
      break;
  }
}

// Import stringUtf8CV and listCV for V3 market creation
import { stringUtf8CV, listCV } from '@stacks/transactions';

main().catch(console.error);
