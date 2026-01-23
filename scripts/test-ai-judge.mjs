#!/usr/bin/env node

/**
 * Test script for ai-judge.mjs
 *
 * This test validates the AI Judge script by:
 * 1. Verifying syntax is correct
 * 2. Testing help flag works
 * 3. Testing dry-run mode
 * 4. Validating script structure and functions
 * 5. Testing LLM response parsing
 *
 * Note: Full integration tests require valid API keys and STACKS_PRIVATE_KEY
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
║                    AI Judge Script Tests                       ║
╚══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

// Test 1: Syntax check
console.log(`\n${colors.cyan}Test 1: Syntax Validation${colors.reset}`);
test('Script has valid JavaScript syntax', () => {
  try {
    execSync('node --check scripts/ai-judge.mjs', { cwd: process.cwd() });
    assert(true);
  } catch (error) {
    throw new Error('Syntax check failed: ' + error.message);
  }
});

// Test 2: Help output
console.log(`\n${colors.cyan}Test 2: Help Flag${colors.reset}`);
test('Help flag displays usage information', () => {
  try {
    const output = execSync('node scripts/ai-judge.mjs --help', {
      cwd: process.cwd(),
      encoding: 'utf-8'
    });
    assertContains(output, 'AI Judge for StacksPredict');
    assertContains(output, '--market-id');
    assertContains(output, '--question');
    assertContains(output, '--model');
    assertContains(output, '--api-provider');
    assertContains(output, '--batch-pending');
    assertContains(output, '--dry-run');
  } catch (error) {
    throw new Error('Help output failed: ' + error.message);
  }
});

// Test 3: File permissions
console.log(`\n${colors.cyan}Test 3: File Permissions${colors.reset}`);
test('Script is executable', () => {
  const stats = fs.statSync('scripts/ai-judge.mjs');
  assert(fs.existsSync('scripts/ai-judge.mjs'), 'Script file exists');
});

// Test 4: Script structure
console.log(`\n${colors.cyan}Test 4: Script Structure${colors.reset}`);
const scriptContent = fs.readFileSync('scripts/ai-judge.mjs', 'utf-8');

test('Script imports required Stacks.js modules', () => {
  assertContains(scriptContent, '@stacks/transactions', 'Should import @stacks/transactions');
  assertContains(scriptContent, '@stacks/network', 'Should import @stacks/network');
});

test('Script has required functions', () => {
  assertContains(scriptContent, 'function callLLM', 'Should have callLLM function');
  assertContains(scriptContent, 'function parseLLMResponse', 'Should have parseLLMResponse function');
  assertContains(scriptContent, 'function submitRecommendation', 'Should have submitRecommendation function');
  assertContains(scriptContent, 'function judgeMarket', 'Should have judgeMarket function');
});

test('Script has API provider functions', () => {
  assertContains(scriptContent, 'function callOpenRouter', 'Should have callOpenRouter function');
  assertContains(scriptContent, 'function callOpenAI', 'Should have callOpenAI function');
  assertContains(scriptContent, 'function callAnthropic', 'Should have callAnthropic function');
});

test('Script has contract configuration', () => {
  assertContains(scriptContent, 'CONTRACTS', 'Should have CONTRACTS configuration');
  assertContains(scriptContent, 'aiOracleCouncil', 'Should reference aiOracleCouncil');
  assertContains(scriptContent, 'marketFactory', 'Should reference marketFactory');
});

test('Script exports helper functions', () => {
  assertContains(scriptContent, 'export {', 'Should export functions');
  assertContains(scriptContent, 'callLLM', 'Should export callLLM');
  assertContains(scriptContent, 'parseLLMResponse', 'Should export parseLLMResponse');
});

// Test 5: Command line argument parsing
console.log(`\n${colors.cyan}Test 5: Command Line Arguments${colors.reset}`);

test('Script parses --market-id argument', () => {
  assertContains(scriptContent, "--market-id'", 'Should parse --market-id');
});

test('Script parses --question argument', () => {
  assertContains(scriptContent, "--question'", 'Should parse --question');
});

test('Script parses --evidence argument', () => {
  assertContains(scriptContent, "--evidence'", 'Should parse --evidence');
});

test('Script parses --model argument', () => {
  assertContains(scriptContent, "--model'", 'Should parse --model');
});

test('Script parses --api-provider argument', () => {
  assertContains(scriptContent, "--api-provider'", 'Should parse --api-provider');
});

test('Script parses --batch-pending argument', () => {
  assertContains(scriptContent, "args.includes('--batch-pending')", 'Should parse --batch-pending');
});

test('Script parses --auto argument', () => {
  assertContains(scriptContent, "args.includes('--auto')", 'Should parse --auto');
});

test('Script parses --dry-run argument', () => {
  assertContains(scriptContent, "args.includes('--dry-run')", 'Should parse --dry-run');
});

// Test 6: API integration patterns
console.log(`\n${colors.cyan}Test 6: API Integration Patterns${colors.reset}`);

test('Script uses fetch for HTTP requests', () => {
  assertContains(scriptContent, 'fetch(', 'Should use fetch API');
  assertContains(scriptContent, 'openrouter.ai/api/v1', 'Should fetch from OpenRouter API');
  assertContains(scriptContent, 'api.openai.com', 'Should fetch from OpenAI API');
  assertContains(scriptContent, 'api.anthropic.com', 'Should fetch from Anthropic API');
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

// Test 7: LLM response parsing
console.log(`\n${colors.cyan}Test 7: LLM Response Parsing${colors.reset}`);

test('Script parses REASONING from LLM response', () => {
  assertContains(scriptContent, 'REASONING:', 'Should parse REASONING field');
  assertContains(scriptContent, 'reasoningMatch', 'Should store reasoning match');
});

test('Script parses DECISION from LLM response', () => {
  assertContains(scriptContent, 'DECISION:', 'Should parse DECISION field');
  assertContains(scriptContent, 'decisionMatch', 'Should store decision match');
});

test('Script parses CONFIDENCE from LLM response', () => {
  assertContains(scriptContent, 'CONFIDENCE:', 'Should parse CONFIDENCE field');
  assertContains(scriptContent, 'confidenceMatch', 'Should store confidence match');
});

test('Script handles confidence scaling (0-100 to 0-1000000)', () => {
  assertContains(scriptContent, '* 10000', 'Should scale confidence to 6 decimals');
});

// Test 8: Contract interaction
console.log(`\n${colors.cyan}Test 8: Contract Interaction${colors.reset}`);

test('Script calls request-ai-evaluation function', () => {
  assertContains(scriptContent, 'request-ai-evaluation', 'Should call request-ai-evaluation');
});

test('Script uses correct Clarity types for arguments', () => {
  assertContains(scriptContent, 'uintCV(marketId)', 'Should use uintCV for market ID');
  assertContains(scriptContent, 'stringAsciiCV', 'Should use stringAsciiCV for strings');
  assertContains(scriptContent, 'listCV', 'Should use listCV for evidence list');
});

// Test 9: Prompt engineering
console.log(`\n${colors.cyan}Test 9: Prompt Engineering${colors.reset}`);

test('Script includes clear instructions in prompt', () => {
  assertContains(scriptContent, 'impartial judge', 'Should specify impartial role');
  assertContains(scriptContent, 'REASONING:', 'Should request reasoning format');
  assertContains(scriptContent, 'DECISION:', 'Should request decision format');
  assertContains(scriptContent, 'CONFIDENCE:', 'Should request confidence format');
});

test('Script includes current date in prompt', () => {
  assertContains(scriptContent, 'new Date().toISOString()', 'Should include current date');
});

test('Script handles evidence in prompt', () => {
  assertContains(scriptContent, 'Evidence Provided:', 'Should include evidence in prompt');
  assertContains(scriptContent, 'evidence.map', 'Should format evidence list');
});

// Test 10: Configuration and defaults
console.log(`\n${colors.cyan}Test 10: Configuration and Defaults${colors.reset}`);

test('Script has default model', () => {
  assertContains(scriptContent, "'openai/gpt-4-turbo'", 'Should have default model');
});

test('Script has default API provider', () => {
  assertContains(scriptContent, "'openrouter'", 'Should have default provider');
});

test('Script checks for API keys', () => {
  assertContains(scriptContent, 'OPENROUTER_API_KEY', 'Should check for OpenRouter key');
  assertContains(scriptContent, 'OPENAI_API_KEY', 'Should check for OpenAI key');
  assertContains(scriptContent, 'ANTHROPIC_API_KEY', 'Should check for Anthropic key');
});

test('Script has network configuration', () => {
  assertContains(scriptContent, 'CONTRACTS', 'Should have contracts config');
  assertContains(scriptContent, 'simnet:', 'Should have simnet contracts');
  assertContains(scriptContent, 'testnet:', 'Should have testnet contracts');
  assertContains(scriptContent, 'mainnet:', 'Should have mainnet contracts');
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
${colors.yellow}Note:${colors.reset} Full integration tests require valid API keys and STACKS_PRIVATE_KEY.

To test with OpenRouter (requires OPENROUTER_API_KEY):
  export OPENROUTER_API_KEY=sk-or-...
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/ai-judge.mjs --market-id 5 --question "Will BTC reach 100k?" --dry-run

To test with OpenAI (requires OPENAI_API_KEY):
  export OPENAI_API_KEY=sk-...
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/ai-judge.mjs --api-provider openai --market-id 5 --question "Will BTC reach 100k?" --dry-run

To test with Anthropic (requires ANTHROPIC_API_KEY):
  export ANTHROPIC_API_KEY=sk-ant-...
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/ai-judge.mjs --api-provider anthropic --market-id 5 --question "Will BTC reach 100k?" --dry-run

To judge a market with auto-submit (80%+ confidence):
  export OPENROUTER_API_KEY=sk-or-...
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/ai-judge.mjs --market-id 5 --question "Will BTC reach 100k?" --auto

To judge with specific model:
  export OPENROUTER_API_KEY=sk-or-...
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/ai-judge.mjs --market-id 5 --question "Will BTC reach 100k?" --model anthropic/claude-3-opus
`);
  process.exit(0);
}
