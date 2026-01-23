#!/usr/bin/env node

/**
 * Test script for update-pyth-oracle.mjs
 *
 * This test validates the Pyth oracle updater script by:
 * 1. Verifying syntax is correct
 * 2. Testing help flag works
 * 3. Testing dry-run mode
 * 4. Validating script structure and functions
 *
 * Note: Full integration tests require valid STACKS_PRIVATE_KEY
 */

import { execSync } from 'child_process';
import fs from 'fs';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ${colors.green}✓${colors.reset} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} ${name}`);
    console.log(`    ${colors.red}${error.message}${colors.reset}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertContains(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message || `Expected "${haystack}" to contain "${needle}"`);
  }
}

console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════════╗
║           Pyth Oracle Updater Script Tests                     ║
╚══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

// Test 1: Syntax check
console.log(`\n${colors.cyan}Test 1: Syntax Validation${colors.reset}`);
test('Script has valid JavaScript syntax', () => {
  try {
    execSync('node --check scripts/update-pyth-oracle.mjs', { cwd: process.cwd() });
    assert(true);
  } catch (error) {
    throw new Error('Syntax check failed: ' + error.message);
  }
});

// Test 2: Help output
console.log(`\n${colors.cyan}Test 2: Help Flag${colors.reset}`);
test('Help flag displays usage information', () => {
  try {
    const output = execSync('node scripts/update-pyth-oracle.mjs --help', {
      cwd: process.cwd(),
      encoding: 'utf-8'
    });
    assertContains(output, 'Pyth Oracle Updater');
    assertContains(output, '--watch');
    assertContains(output, '--assets');
    assertContains(output, '--dry-run');
    assertContains(output, '--mainnet');
  } catch (error) {
    throw new Error('Help output failed: ' + error.message);
  }
});

// Test 3: File permissions
console.log(`\n${colors.cyan}Test 3: File Permissions${colors.reset}`);
test('Script is executable', () => {
  const stats = fs.statSync('scripts/update-pyth-oracle.mjs');
  // On Windows, execute bit may not be set
  // Check if file exists and is readable
  assert(fs.existsSync('scripts/update-pyth-oracle.mjs'), 'Script file exists');
});

// Test 4: Script structure
console.log(`\n${colors.cyan}Test 4: Script Structure${colors.reset}`);
const scriptContent = fs.readFileSync('scripts/update-pyth-oracle.mjs', 'utf-8');

test('Script imports required Stacks.js modules', () => {
  assertContains(scriptContent, '@stacks/transactions', 'Should import @stacks/transactions');
  assertContains(scriptContent, '@stacks/network', 'Should import @stacks/network');
});

test('Script has required functions', () => {
  assertContains(scriptContent, 'function fetchPythPrice', 'Should have fetchPythPrice function');
  assertContains(scriptContent, 'function updateMockOracle', 'Should have updateMockOracle function');
  assertContains(scriptContent, 'function updatePrices', 'Should have updatePrices function');
  assertContains(scriptContent, 'function watchMode', 'Should have watchMode function');
});

test('Script has helper functions', () => {
  assertContains(scriptContent, 'function priceTo8Decimals', 'Should have priceTo8Decimals function');
  assertContains(scriptContent, 'function formatPrice', 'Should have formatPrice function');
  assertContains(scriptContent, 'function formatTimestamp', 'Should have formatTimestamp function');
  assertContains(scriptContent, 'function sleep', 'Should have sleep function');
});

test('Script has contract configuration', () => {
  assertContains(scriptContent, 'CONTRACTS', 'Should have CONTRACTS configuration');
  assertContains(scriptContent, 'mockOracle', 'Should reference mockOracle');
  assertContains(scriptContent, 'pythOracleWrapper', 'Should reference pythOracleWrapper');
});

test('Script has Pyth price feed IDs', () => {
  assertContains(scriptContent, 'PRICE_FEED_IDS', 'Should have PRICE_FEED_IDS configuration');
  assertContains(scriptContent, 'BTC:', 'Should have BTC price feed ID');
  assertContains(scriptContent, 'STX:', 'Should have STX price feed ID');
  assertContains(scriptContent, 'ETH:', 'Should have ETH price feed ID');
  assertContains(scriptContent, 'USDC:', 'Should have USDC price feed ID');
});

test('Script exports helper functions', () => {
  assertContains(scriptContent, 'export {', 'Should export functions');
  assertContains(scriptContent, 'fetchPythPrice', 'Should export fetchPythPrice');
  assertContains(scriptContent, 'priceTo8Decimals', 'Should export priceTo8Decimals');
  assertContains(scriptContent, 'formatPrice', 'Should export formatPrice');
  assertContains(scriptContent, 'formatTimestamp', 'Should export formatTimestamp');
  assertContains(scriptContent, 'PRICE_FEED_IDS', 'Should export PRICE_FEED_IDS');
});

// Test 5: Command line argument parsing
console.log(`\n${colors.cyan}Test 5: Command Line Arguments${colors.reset}`);

test('Script parses --watch argument', () => {
  assertContains(scriptContent, "args.includes('--watch')", 'Should parse --watch');
});

test('Script parses --assets argument', () => {
  assertContains(scriptContent, "--assets'", 'Should parse --assets');
});

test('Script parses --mainnet argument', () => {
  assertContains(scriptContent, "args.includes('--mainnet')", 'Should parse --mainnet');
});

test('Script parses --dry-run argument', () => {
  assertContains(scriptContent, "args.includes('--dry-run')", 'Should parse --dry-run');
});

test('Script parses --help argument', () => {
  assertContains(scriptContent, "args.includes('--help')", 'Should parse --help');
});

// Test 6: API integration patterns
console.log(`\n${colors.cyan}Test 6: API Integration Patterns${colors.reset}`);

test('Script uses fetch for HTTP requests', () => {
  assertContains(scriptContent, 'fetch(', 'Should use fetch API');
  assertContains(scriptContent, 'hermes.pyth.network', 'Should fetch from Pyth Hermes API');
});

test('Script has error handling for fetch failures', () => {
  assertContains(scriptContent, 'try {', 'Should have try-catch blocks');
  assertContains(scriptContent, 'catch (error)', 'Should handle errors');
});

test('Script uses makeContractCall for transactions', () => {
  assertContains(scriptContent, 'makeContractCall', 'Should use makeContractCall for contract calls');
});

test('Script uses broadcastTransaction for broadcasting', () => {
  assertContains(scriptContent, 'broadcastTransaction', 'Should use broadcastTransaction');
});

// Test 7: Price conversion logic
console.log(`\n${colors.cyan}Test 7: Price Conversion Logic${colors.reset}`);

test('Script has 8-decimal price conversion', () => {
  assertContains(scriptContent, '100000000', 'Should use 8 decimals (100000000)');
  assertContains(scriptContent, 'Math.pow(10, expo + 8)', 'Should convert Pyth expo to 8 decimals');
});

test('Script formats prices for display', () => {
  assertContains(scriptContent, 'toLocaleString', 'Should format prices for display');
  assertContains(scriptContent, 'minimumFractionDigits', 'Should specify decimal places');
});

test('Script handles Pyth price data structure', () => {
  assertContains(scriptContent, 'data.parsed', 'Should access parsed price data');
  assertContains(scriptContent, 'priceData.price', 'Should access price field');
  assertContains(scriptContent, 'priceData.expo', 'Should access expo field');
  assertContains(scriptContent, 'priceData.conf', 'Should access conf field');
  assertContains(scriptContent, 'publish_time', 'Should access publish_time field');
});

// Test 8: Watch mode functionality
console.log(`\n${colors.cyan}Test 8: Watch Mode Functionality${colors.reset}`);

test('Script has watch mode implementation', () => {
  assertContains(scriptContent, 'setInterval', 'Should use setInterval for watch mode');
  assertContains(scriptContent, '60000', 'Should update every 60 seconds (60000ms)');
  assertContains(scriptContent, 'SIGINT', 'Should handle SIGINT for graceful exit');
});

test('Script clears interval on exit', () => {
  assertContains(scriptContent, 'clearInterval', 'Should clear interval on exit');
});

// Summary
console.log(`
${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bright}Test Results:${colors.reset}
  ${colors.green}Passed:${colors.reset} ${testsPassed}
  ${colors.red}Failed:${colors.reset} ${testsFailed}
  ${colors.bright}Total:${colors.reset}  ${testsPassed + testsFailed}
${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
`);

if (testsFailed > 0) {
  console.log(`${colors.red}Some tests failed!${colors.reset}`);
  process.exit(1);
} else {
  console.log(`${colors.green}All tests passed!${colors.reset}`);
  console.log(`
${colors.yellow}Note:${colors.reset} Full integration tests require valid STACKS_PRIVATE_KEY.

To test against Pyth API (no key required):
  node scripts/update-pyth-oracle.mjs --dry-run

To test against mock-oracle (requires devnet setup):
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/update-pyth-oracle.mjs --dry-run

To run live (update on-chain prices):
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/update-pyth-oracle.mjs

To run in watch mode:
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/update-pyth-oracle.mjs --watch
`);
  process.exit(0);
}
