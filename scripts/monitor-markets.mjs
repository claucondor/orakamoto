#!/usr/bin/env node

/**
 * Market Monitor Dashboard for StacksPredict
 *
 * Real-time monitoring of active prediction markets
 *
 * Usage:
 *   node scripts/monitor-markets.js                    # Show all markets once
 *   node scripts/monitor-markets.js --watch            # Watch mode - updates every 10s
 *   node scripts/monitor-markets.js --export out.csv   # Export to CSV
 *   node scripts/monitor-markets.js --creator <addr>   # Filter by creator
 *   node scripts/monitor-markets.js --active           # Show only active markets
 */

import txPkg from '@stacks/transactions';
const {
  fetchCallReadOnlyFunction,
  uintCV,
  standardPrincipalCV,
  cvToJSON
} = txPkg;
import netPkg from '@stacks/network';
const { StacksTestnet, StacksMainnet } = netPkg;

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  watch: args.includes('--watch'),
  export: args.find((a, i) => a === '--export' && args[i + 1]) ? args[args.indexOf('--export') + 1] : null,
  creator: args.find((a, i) => a === '--creator' && args[i + 1]) ? args[args.indexOf('--creator') + 1] : null,
  active: args.includes('--active'),
  mainnet: args.includes('--mainnet'),
  help: args.includes('--help') || args.includes('-h')
};

// Show help
if (options.help) {
  console.log(`
Market Monitor Dashboard for StacksPredict

Usage:
  node scripts/monitor-markets.js [options]

Options:
  --watch              Watch mode - updates every 10 seconds
  --export <file>      Export market data to CSV file
  --creator <address>  Filter markets by creator address
  --active             Show only active (unresolved) markets
  --mainnet            Use mainnet instead of testnet
  --help, -h           Show this help message

Examples:
  node scripts/monitor-markets.js
  node scripts/monitor-markets.js --watch
  node scripts/monitor-markets.js --export markets.csv
  node scripts/monitor-markets.js --creator ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC
  node scripts/monitor-markets.js --active --watch
`);
  process.exit(0);
}

// Configuration
const network = options.mainnet ? StacksMainnet : StacksTestnet;

// Contract addresses - V3 simnet for testing, V2 testnet for deployed
// Update these after V3 deployment to testnet
const CONTRACTS = {
  simnet: {
    multiMarketPool: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.multi-market-pool',
    marketFactoryV2: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-factory-v2',
    usdcx: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx'
  },
  testnet: {
    // V2 contracts (currently deployed)
    marketFactoryV2: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-factory-v2',
    marketPool: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-pool',
    multiOutcomePool: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.multi-outcome-pool',
    usdcx: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx'
  }
};

const useContracts = options.mainnet ? CONTRACTS.mainnet : CONTRACTS.testnet;

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
 * Fetch market count from V2 market-factory
 */
async function getMarketCount() {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: useContracts.marketFactoryV2.split('.')[0],
      contractName: useContracts.marketFactoryV2.split('.')[1],
      functionName: 'get-market-count',
      functionArgs: [],
      network,
      senderAddress: useContracts.marketFactoryV2.split('.')[0]
    });

    if (result.type === 7) { // ok response
      return Number(result.value.value);
    }
    return 0;
  } catch (error) {
    console.error(`${colors.red}Error fetching market count:${colors.reset}`, error.message);
    return 0;
  }
}

/**
 * Fetch market data from V2 market-factory
 */
async function getMarket(marketId) {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: useContracts.marketFactoryV2.split('.')[0],
      contractName: useContracts.marketFactoryV2.split('.')[1],
      functionName: 'get-market',
      functionArgs: [uintCV(marketId)],
      network,
      senderAddress: useContracts.marketFactoryV2.split('.')[0]
    });

    if (result.type === 7) { // ok response
      const json = cvToJSON(result);
      return json.value;
    }
    return null;
  } catch (error) {
    // Market might not exist
    return null;
  }
}

/**
 * Fetch prices for a market from V2 market-pool
 */
async function getMarketPrices(marketId) {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: useContracts.marketPool.split('.')[0],
      contractName: useContracts.marketPool.split('.')[1],
      functionName: 'get-prices',
      functionArgs: [uintCV(marketId)],
      network,
      senderAddress: useContracts.marketPool.split('.')[0]
    });

    if (result.type === 7) { // ok response
      const json = cvToJSON(result);
      return {
        yesPrice: Number(json.value['yes-price'].value) / 1000000,
        noPrice: Number(json.value['no-price'].value) / 1000000
      };
    }
    return { yesPrice: 0, noPrice: 0 };
  } catch (error) {
    return { yesPrice: 0, noPrice: 0 };
  }
}

/**
 * Fetch reserves for a market
 */
async function getMarketReserves(marketId) {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: useContracts.marketPool.split('.')[0],
      contractName: useContracts.marketPool.split('.')[1],
      functionName: 'get-reserves',
      functionArgs: [uintCV(marketId)],
      network,
      senderAddress: useContracts.marketPool.split('.')[0]
    });

    if (result.type === 7) { // ok response
      const json = cvToJSON(result);
      return {
        yesReserve: Number(json.value['yes-reserve'].value) / 1000000,
        noReserve: Number(json.value['no-reserve'].value) / 1000000
      };
    }
    return { yesReserve: 0, noReserve: 0 };
  } catch (error) {
    return { yesReserve: 0, noReserve: 0 };
  }
}

/**
 * Check if market is active (not resolved)
 */
async function isMarketActive(marketId) {
  try {
    const market = await getMarket(marketId);
    if (!market) return false;
    // Check if resolved field exists and is false
    return !market['resolved']?.value || market['resolved']?.value === false;
  } catch {
    return false;
  }
}

/**
 * Format timestamp to readable date
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(Number(timestamp) * 1000);
  return date.toISOString().split('T')[0] + ' ' + date.toTimeString().split(' ')[0].substring(0, 5);
}

/**
 * Format principal address to short form
 */
function formatPrincipal(principal) {
  if (!principal || typeof principal !== 'string') return 'N/A';
  if (principal.length <= 20) return principal;
  return principal.substring(0, 8) + '...' + principal.substring(principal.length - 6);
}

/**
 * Get liquidity status color
 */
function getLiquidityStatus(liquidity) {
  if (liquidity < 50) return { color: colors.red, label: 'LOW' };
  if (liquidity < 200) return { color: colors.yellow, label: 'MEDIUM' };
  return { color: colors.green, label: 'HIGH' };
}

/**
 * Display a single market
 */
function displayMarket(market, prices, reserves, index) {
  const question = market['question']?.value || 'N/A';
  const creator = market['creator']?.value || 'N/A';
  const deadline = formatTimestamp(market['deadline']?.value);
  const resolved = market['resolved']?.value || false;
  const winningOutcome = market['winning-outcome']?.value;
  const liquidity = reserves.yesReserve + reserves.noReserve;

  const liquidityStatus = getLiquidityStatus(liquidity);

  console.log(`
${colors.cyan}${colors.bright}[${index}] ${question}${colors.reset}
${colors.gray}    Creator:${colors.reset} ${formatPrincipal(String(creator))}
${colors.gray}    Deadline:${colors.reset} ${deadline}
${colors.gray}    Status:${colors.reset} ${resolved ? `${colors.green}RESOLVED${colors.reset} (Winner: ${winningOutcome === 0 ? 'YES' : 'NO'})` : `${colors.yellow}ACTIVE${colors.reset}`}
${colors.gray}    Liquidity:${colors.reset} $${liquidity.toFixed(2)} ${liquidityStatus.color}[${liquidityStatus.label}]${colors.reset}
${colors.gray}    Prices:${colors.reset} YES ${(prices.yesPrice * 100).toFixed(1)}% | NO ${(prices.noPrice * 100).toFixed(1)}%
${colors.gray}    Reserves:${colors.reset} YES: $${reserves.yesReserve.toFixed(2)} | NO: $${reserves.noReserve.toFixed(2)}
${colors.gray}──────────────────────────────────────────────────────────────${colors.reset}`);
}

/**
 * Export markets to CSV
 */
function exportToCSV(markets) {
  const headers = [
    'Market ID',
    'Question',
    'Creator',
    'Deadline',
    'Status',
    'Winning Outcome',
    'Liquidity (USDC)',
    'YES Price (%)',
    'NO Price (%)',
    'YES Reserve',
    'NO Reserve'
  ];

  const rows = markets.map(m => [
    m.id,
    `"${(m.data.question?.value || 'N/A').replace(/"/g, '""')}"`,
    m.data.creator?.value || 'N/A',
    formatTimestamp(m.data['deadline']?.value),
    m.data.resolved?.value ? 'Resolved' : 'Active',
    m.data['winning-outcome']?.value === 0 ? 'YES' : (m.data['winning-outcome']?.value === 1 ? 'NO' : 'N/A'),
    (m.reserves.yesReserve + m.reserves.noReserve).toFixed(2),
    (m.prices.yesPrice * 100).toFixed(2),
    (m.prices.noPrice * 100).toFixed(2),
    m.reserves.yesReserve.toFixed(2),
    m.reserves.noReserve.toFixed(2)
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  return csv;
}

/**
 * Main monitor function
 */
async function monitor() {
  console.clear();
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════╗
║           StacksPredict Market Monitor Dashboard              ║
╚══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const networkName = options.mainnet ? 'Mainnet' : 'Testnet';
  console.log(`${colors.gray}Network:${colors.reset} ${networkName}`);
  console.log(`${colors.gray}Contracts:${colors.reset} ${useContracts.marketFactoryV2.split('.')[1]}`);
  console.log(`${colors.gray}Filters:${colors.reset} ${options.active ? 'Active only' : 'All'} ${options.creator ? `| Creator: ${formatPrincipal(options.creator)}` : ''}`);
  console.log(`${colors.gray}Updated:${colors.reset} ${new Date().toISOString()}`);

  // Fetch market count
  const marketCount = await getMarketCount();
  console.log(`${colors.gray}Total Markets:${colors.reset} ${marketCount}`);

  if (marketCount === 0) {
    console.log(`\n${colors.yellow}No markets found. Create a market first!${colors.reset}\n`);
    return;
  }

  // Fetch all markets
  const markets = [];
  for (let i = 0; i < marketCount; i++) {
    const market = await getMarket(i);
    if (!market) continue;

    // Filter by creator if specified
    if (options.creator) {
      const creator = market.creator?.value || '';
      if (!creator.includes(options.creator)) continue;
    }

    // Filter active only if specified
    if (options.active) {
      const resolved = market.resolved?.value || false;
      if (resolved) continue;
    }

    const prices = await getMarketPrices(i);
    const reserves = await getMarketReserves(i);

    markets.push({ id: i, data: market, prices, reserves });
  }

  if (markets.length === 0) {
    console.log(`\n${colors.yellow}No markets match the current filters.${colors.reset}\n`);
    return;
  }

  // Display summary
  console.log(`${colors.gray}Showing:${colors.reset} ${markets.length} market(s)\n`);

  // Display each market
  for (const market of markets) {
    displayMarket(market.data, market.prices, market.reserves, market.id);
  }

  // Calculate totals
  const totalLiquidity = markets.reduce((sum, m) => sum + m.reserves.yesReserve + m.reserves.noReserve, 0);
  const activeCount = markets.filter(m => !m.data.resolved?.value).length;
  const resolvedCount = markets.filter(m => m.data.resolved?.value).length;

  console.log(`
${colors.bright}${colors.cyan}Summary${colors.reset}
${colors.gray}  Total Liquidity:${colors.reset} $${totalLiquidity.toFixed(2)}
${colors.gray}  Active Markets:${colors.reset} ${activeCount}
${colors.gray}  Resolved Markets:${colors.reset} ${resolvedCount}
`);

  // Export to CSV if requested
  if (options.export) {
    const fs = await import('fs');
    fs.writeFileSync(options.export, exportToCSV(markets));
    console.log(`${colors.green}✓ Exported ${markets.length} markets to ${options.export}${colors.reset}\n`);
  }

  return markets;
}

/**
 * Watch mode - run monitor repeatedly
 */
async function watchMode() {
  console.log(`${colors.cyan}Watch mode enabled. Updates every 10 seconds.${colors.reset}`);
  console.log(`${colors.gray}Press Ctrl+C to exit.${colors.reset}\n`);

  await monitor();

  const interval = setInterval(async () => {
    await monitor();
  }, 10000);

  // Handle exit
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(`\n${colors.yellow}Monitoring stopped.${colors.reset}\n`);
    process.exit(0);
  });
}

// Export helper functions for testing
export {
  formatTimestamp,
  formatPrincipal,
  getLiquidityStatus,
  exportToCSV
};

// Main entry point
(async () => {
  if (options.watch) {
    await watchMode();
  } else {
    await monitor();
  }
})();
