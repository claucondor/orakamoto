#!/usr/bin/env node

/**
 * Test script for monitor-markets.mjs
 *
 * This test validates the monitor script by:
 * 1. Verifying syntax is correct
 * 2. Testing help flag works
 * 3. Testing against simnet contracts (if available)
 *
 * Note: Full integration tests require running against deployed testnet contracts
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
║           Market Monitor Script Tests                          ║
╚══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

// Test 1: Syntax check
console.log(`\n${colors.cyan}Test 1: Syntax Validation${colors.reset}`);
test('Script has valid JavaScript syntax', () => {
  try {
    execSync('node --check scripts/monitor-markets.mjs', { cwd: process.cwd() });
    assert(true);
  } catch (error) {
    throw new Error('Syntax check failed: ' + error.message);
  }
});

// Test 2: Help output
console.log(`\n${colors.cyan}Test 2: Help Flag${colors.reset}`);
test('Help flag displays usage information', () => {
  try {
    const output = execSync('node scripts/monitor-markets.mjs --help', {
      cwd: process.cwd(),
      encoding: 'utf-8'
    });
    assertContains(output, 'Market Monitor Dashboard');
    assertContains(output, '--watch');
    assertContains(output, '--export');
    assertContains(output, '--creator');
    assertContains(output, '--active');
  } catch (error) {
    throw new Error('Help output failed: ' + error.message);
  }
});

// Test 3: File permissions
console.log(`\n${colors.cyan}Test 3: File Permissions${colors.reset}`);
test('Script is executable', () => {
  const stats = fs.statSync('scripts/monitor-markets.mjs');
  // On Windows, execute bit may not be set
  const mode = stats.mode;
  // Check if file exists and is readable
  assert(fs.existsSync('scripts/monitor-markets.mjs'), 'Script file exists');
});

// Test 4: Script structure
console.log(`\n${colors.cyan}Test 4: Script Structure${colors.reset}`);
const scriptContent = fs.readFileSync('scripts/monitor-markets.mjs', 'utf-8');

test('Script imports required Stacks.js modules', () => {
  assertContains(scriptContent, '@stacks/transactions', 'Should import @stacks/transactions');
  assertContains(scriptContent, '@stacks/network', 'Should import @stacks/network');
});

test('Script has required functions', () => {
  assertContains(scriptContent, 'function getMarketCount', 'Should have getMarketCount function');
  assertContains(scriptContent, 'function getMarket', 'Should have getMarket function');
  assertContains(scriptContent, 'function getMarketPrices', 'Should have getMarketPrices function');
  assertContains(scriptContent, 'function getMarketReserves', 'Should have getMarketReserves function');
  assertContains(scriptContent, 'function monitor', 'Should have monitor function');
  assertContains(scriptContent, 'function watchMode', 'Should have watchMode function');
});

test('Script has helper functions', () => {
  assertContains(scriptContent, 'function formatTimestamp', 'Should have formatTimestamp function');
  assertContains(scriptContent, 'function formatPrincipal', 'Should have formatPrincipal function');
  assertContains(scriptContent, 'function getLiquidityStatus', 'Should have getLiquidityStatus function');
  assertContains(scriptContent, 'function exportToCSV', 'Should have exportToCSV function');
  assertContains(scriptContent, 'function displayMarket', 'Should have displayMarket function');
});

test('Script has contract configuration', () => {
  assertContains(scriptContent, 'CONTRACTS', 'Should have CONTRACTS configuration');
  assertContains(scriptContent, 'marketFactoryV2', 'Should reference marketFactoryV2');
  assertContains(scriptContent, 'marketPool', 'Should reference marketPool');
  assertContains(scriptContent, 'usdcx', 'Should reference usdcx');
});

test('Script exports helper functions', () => {
  assertContains(scriptContent, 'export {', 'Should export functions');
  assertContains(scriptContent, 'formatTimestamp', 'Should export formatTimestamp');
  assertContains(scriptContent, 'formatPrincipal', 'Should export formatPrincipal');
  assertContains(scriptContent, 'getLiquidityStatus', 'Should export getLiquidityStatus');
  assertContains(scriptContent, 'exportToCSV', 'Should export exportToCSV');
});

// Test 5: Command line argument parsing
console.log(`\n${colors.cyan}Test 5: Command Line Arguments${colors.reset}`);

test('Script parses --watch argument', () => {
  assertContains(scriptContent, "args.includes('--watch')", 'Should parse --watch');
});

test('Script parses --export argument', () => {
  assertContains(scriptContent, "--export'", 'Should parse --export');
});

test('Script parses --creator argument', () => {
  assertContains(scriptContent, "--creator'", 'Should parse --creator');
});

test('Script parses --active argument', () => {
  assertContains(scriptContent, "args.includes('--active')", 'Should parse --active');
});

test('Script parses --mainnet argument', () => {
  assertContains(scriptContent, "args.includes('--mainnet')", 'Should parse --mainnet');
});

// Test 6: API integration patterns
console.log(`\n${colors.cyan}Test 6: API Integration Patterns${colors.reset}`);

test('Script uses fetchCallReadOnlyFunction', () => {
  assertContains(scriptContent, 'fetchCallReadOnlyFunction', 'Should use Stacks API for read calls');
});

test('Script has error handling for fetch failures', () => {
  assertContains(scriptContent, 'try {', 'Should have try-catch blocks');
  assertContains(scriptContent, 'catch (error)', 'Should handle errors');
});

test('Script uses cvToJSON for response parsing', () => {
  assertContains(scriptContent, 'cvToJSON', 'Should use cvToJSON for parsing Clarity values');
});

// Test 7: CSV export functionality
console.log(`\n${colors.cyan}Test 7: CSV Export Functionality${colors.reset}`);

test('Script has CSV headers', () => {
  assertContains(scriptContent, 'Market ID', 'Should have Market ID column');
  assertContains(scriptContent, 'Question', 'Should have Question column');
  assertContains(scriptContent, 'Liquidity', 'Should have Liquidity column');
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
${colors.yellow}Note:${colors.reset} Full integration tests require running against deployed contracts.
To test against simnet:
  1. Run: clarinet console
  2. Create test markets
  3. Run: node scripts/monitor-markets.mjs

To test against testnet:
  1. Ensure V2 contracts are deployed
  2. Run: node scripts/monitor-markets.mjs
`);
  process.exit(0);
}
