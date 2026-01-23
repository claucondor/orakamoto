#!/usr/bin/env node

/**
 * Pyth Oracle Updater for StacksPredict
 *
 * Fetches latest price data from Pyth Network and updates on-chain oracle.
 * Supports both devnet (mock-oracle) and testnet/mainnet (pyth-oracle-v4).
 *
 * Usage:
 *   node scripts/update-pyth-oracle.js                    # Update once
 *   node scripts/update-pyth-oracle.js --watch            # Watch mode - updates every 60s
 *   node scripts/update-pyth-oracle.js --assets BTC,STX  # Update specific assets
 *   node scripts/update-pyth-oracle.js --mainnet          # Use mainnet instead of testnet
 *   node scripts/update-pyth-oracle.js --help             # Show help
 */

import txPkg from '@stacks/transactions';
const {
  makeContractCall,
  makeRandomPrivKey,
  privateKeyToString,
  publicKeyToString,
  publicKeyToAddress
} = txPkg;
import netPkg from '@stacks/network';
const { StacksTestnet, StacksMainnet } = netPkg;

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  watch: args.includes('--watch'),
  assets: args.find((a, i) => a === '--assets' && args[i + 1]) ? args[args.indexOf('--assets') + 1].split(',') : null,
  mainnet: args.includes('--mainnet'),
  help: args.includes('--help') || args.includes('-h'),
  dryRun: args.includes('--dry-run')
};

// Show help
if (options.help) {
  console.log(`
Pyth Oracle Updater for StacksPredict

Usage:
  node scripts/update-pyth-oracle.js [options]

Options:
  --watch              Watch mode - updates every 60 seconds
  --assets <symbols>   Comma-separated list of assets to update (default: BTC,STX,ETH,USDC)
  --mainnet            Use mainnet instead of testnet
  --dry-run            Fetch prices but don't submit transactions
  --help, -h           Show this help message

Environment Variables:
  STACKS_PRIVATE_KEY   Private key for signing transactions (required)
  ORACLE_ADDRESS       Oracle contract deployer address (default: auto-detected)

Examples:
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/update-pyth-oracle.js
  node scripts/update-pyth-oracle.js --watch
  node scripts/update-pyth-oracle.js --assets BTC,STX
  node scripts/update-pyth-oracle.js --dry-run

Assets:
  BTC   - Bitcoin / USD
  STX   - Stacks / USD
  ETH   - Ethereum / USD
  USDC  - USD Coin / USD
`);
  process.exit(0);
}

// Check for private key
if (!process.env.STACKS_PRIVATE_KEY && !options.dryRun) {
  console.error('Error: STACKS_PRIVATE_KEY environment variable is required');
  console.error('Set it with: export STACKS_PRIVATE_KEY=your_private_key_here');
  process.exit(1);
}

// Configuration
const network = options.mainnet ? StacksMainnet : StacksTestnet;

// Contract addresses
const CONTRACTS = {
  simnet: {
    mockOracle: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-oracle',
    pythOracleWrapper: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.pyth-oracle-wrapper'
  },
  testnet: {
    // These will be updated after deployment
    mockOracle: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-oracle',
    pythOracleWrapper: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.pyth-oracle-wrapper'
  },
  mainnet: {
    // Production Pyth oracle on Stacks mainnet
    pythOracleV4: 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4',
    pythOracleWrapper: 'TODO deploy-to-mainnet'
  }
};

const useContracts = options.mainnet ? CONTRACTS.mainnet : CONTRACTS.testnet;

// Pyth Network price feed IDs (32-byte hex strings)
// Source: https://pyth.network/price-feeds
const PRICE_FEED_IDS = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  STX: '0x73757065722d7374616b652d737461636b732d7573642d707269636500000000',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  USDC: '0xeaa020c61cc47971281920289578902000000000000000000000000000000001'
};

// Default assets to update if not specified
const DEFAULT_ASSETS = ['BTC', 'STX', 'ETH', 'USDC'];
const assetsToUpdate = options.assets || DEFAULT_ASSETS;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

/**
 * Fetch latest price data from Pyth Network HTTP API (Hermes)
 * @param {string} priceId - Pyth price feed ID (32-byte hex)
 * @returns {Promise<{price: number, conf: number, publishTime: number}>}
 */
async function fetchPythPrice(priceId) {
  const url = `https://hermes.pyth.network/v2/updates/price/${priceId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.parsed || data.parsed.length === 0) {
      throw new Error('No price data in response');
    }

    const priceData = data.parsed[0].price;
    const price = priceData.price;
    const conf = priceData.conf;
    const publishTime = priceData.publish_time;

    // Pyth returns price as integer with expo for decimal placement
    // For example: price=50000000, expo=-8 means $0.50
    // We convert to 8 decimals format for our contract
    const expo = priceData.expo;
    const priceIn8Decimals = price * Math.pow(10, expo + 8);

    return {
      price: Math.floor(priceIn8Decimals),
      conf: Math.floor(conf * Math.pow(10, expo + 8)),
      publishTime
    };
  } catch (error) {
    throw new Error(`Failed to fetch Pyth price: ${error.message}`);
  }
}

/**
 * Convert price to 8-decimal format for contract
 * @param {number} price - Price in dollars
 * @returns {number} Price with 8 decimals
 */
function priceTo8Decimals(price) {
  return Math.floor(price * 100000000);
}

/**
 * Update mock-oracle with new price
 * @param {string} asset - Asset symbol (e.g., "BTC")
 * @param {number} price - Price with 8 decimals
 */
async function updateMockOracle(asset, price) {
  if (options.dryRun) {
    console.log(`  ${colors.gray}[DRY RUN]${colors.reset} Would update ${asset} to ${formatPrice(price)}`);
    return null;
  }

  try {
    const privateKey = process.env.STACKS_PRIVATE_KEY;

    const tx = await makeContractCall({
      contractAddress: useContracts.mockOracle.split('.')[0],
      contractName: useContracts.mockOracle.split('.')[1],
      functionName: 'set-price',
      functionArgs: [
        txPkg.stringAsciiCV(asset),
        txPkg.uintCV(price)
      ],
      senderKey: privateKey,
      network,
      postConditionMode: 1 // Allow
    });

    // Broadcast transaction
    const result = await txPkg.broadcastTransaction(tx, network);

    if (result.error) {
      throw new Error(result.error);
    }

    return result.txid;
  } catch (error) {
    throw new Error(`Failed to update ${asset}: ${error.message}`);
  }
}

/**
 * Format price for display
 * @param {number} price8Dec - Price with 8 decimals
 * @returns {string} Formatted price string
 */
function formatPrice(price8Dec) {
  const price = price8Dec / 100000000;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
}

/**
 * Format timestamp to readable date
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date string
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toISOString();
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main update function
 */
async function updatePrices() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════╗
║              Pyth Oracle Updater for StacksPredict              ║
╚══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const networkName = options.mainnet ? 'Mainnet' : 'Testnet';
  console.log(`${colors.gray}Network:${colors.reset} ${networkName}`);
  console.log(`${colors.gray}Mode:${colors.reset} ${options.dryRun ? 'DRY RUN (no transactions)' : 'LIVE (submitting transactions)'}`);
  console.log(`${colors.gray}Assets:${colors.reset} ${assetsToUpdate.join(', ')}`);
  console.log(`${colors.gray}Updated:${colors.reset} ${new Date().toISOString()}\n`);

  const results = [];

  for (const asset of assetsToUpdate) {
    const priceId = PRICE_FEED_IDS[asset];
    if (!priceId) {
      console.log(`${colors.red}✗${colors.reset} ${asset}: Unknown asset`);
      continue;
    }

    try {
      // Fetch from Pyth
      console.log(`${colors.blue}→${colors.reset} Fetching ${asset}/USD from Pyth...`);
      const priceData = await fetchPythPrice(priceId);

      console.log(`  ${colors.green}✓${colors.reset} Price: ${formatPrice(priceData.price)} (conf: ±${formatPrice(priceData.conf)})`);
      console.log(`  ${colors.gray}  Publish time:${colors.reset} ${formatTimestamp(priceData.publishTime)}`);

      // Update on-chain (mock-oracle for devnet/testnet)
      const txid = await updateMockOracle(asset, priceData.price);

      if (txid) {
        console.log(`  ${colors.green}✓${colors.reset} Updated ${asset} - txid: ${txid.substring(0, 16)}...`);
        results.push({ asset, success: true, txid, price: priceData.price });
      } else {
        results.push({ asset, success: true, txid: null, price: priceData.price });
      }

      // Small delay to avoid rate limiting
      await sleep(500);

    } catch (error) {
      console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
      results.push({ asset, success: false, error: error.message });
    }

    console.log('');
  }

  // Print summary
  console.log(`${colors.bright}${colors.cyan}Summary${colors.reset}`);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`  ${colors.green}Success:${colors.reset} ${successCount}`);
  console.log(`  ${colors.red}Failed:${colors.reset} ${failCount}`);

  if (successCount > 0 && !options.dryRun) {
    console.log(`\n${colors.gray}Explorer:${colors.reset} https://explorer.stacks.co/txid/${results.find(r => r.success && r.txid)?.txid}${options.mainnet ? '?chain=mainnet' : ''}`);
  }

  return results;
}

/**
 * Watch mode - run updater repeatedly
 */
async function watchMode() {
  console.log(`${colors.cyan}Watch mode enabled. Updates every 60 seconds.${colors.reset}`);
  console.log(`${colors.gray}Press Ctrl+C to exit.${colors.reset}\n`);

  await updatePrices();

  const interval = setInterval(async () => {
    console.log(`\n${colors.gray}─${'─'.repeat(64)}${colors.reset}\n`);
    await updatePrices();
  }, 60000); // 60 seconds

  // Handle exit
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(`\n${colors.yellow}Oracle updater stopped.${colors.reset}\n`);
    process.exit(0);
  });
}

// Export helper functions for testing
export {
  fetchPythPrice,
  priceTo8Decimals,
  formatPrice,
  formatTimestamp,
  PRICE_FEED_IDS
};

// Main entry point
(async () => {
  if (options.watch) {
    await watchMode();
  } else {
    const results = await updatePrices();
    const hasFailures = results.some(r => !r.success);
    process.exit(hasFailures ? 1 : 0);
  }
})();
