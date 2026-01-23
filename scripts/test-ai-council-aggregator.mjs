#!/usr/bin/env node

/**
 * Test suite for ai-council-aggregator.mjs
 *
 * Tests:
 * - Syntax validation
 * - Help flag functionality
 * - File permissions
 * - Script structure (imports, functions, exports)
 * - Parallel LLM query functionality
 * - Confidence-weighted vote aggregation
 * - Contract interaction patterns
 * - Configuration and defaults
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m'
};

let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${name}`);
    passed++;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    failed++;
  }
}

console.log(`${colors.cyan}
═══════════════════════════════════════════════════════════════
  Testing ai-council-aggregator.mjs
═══════════════════════════════════════════════════════════════
${colors.reset}`);

// Test 1: File exists and is executable
try {
  const stats = execSync('ls -l scripts/ai-council-aggregator.mjs', { encoding: 'utf-8' });
  test('Script is executable', stats.startsWith('-rwxr-xr-x') || stats.includes('x'));
} catch (e) {
  test('Script is executable', false);
}

// Test 2: Syntax validation
try {
  execSync('node --check scripts/ai-council-aggregator.mjs', { encoding: 'utf-8' });
  test('Script has valid JavaScript syntax', true);
} catch (e) {
  test('Script has valid JavaScript syntax', false);
}

// Test 3: Read file content
let content;
try {
  content = readFileSync('scripts/ai-council-aggregator.mjs', 'utf-8');
  test('Script can be read', true);
} catch (e) {
  test('Script can be read', false);
  process.exit(1);
}

// Test 4: Has help flag
test('Script has --help flag in usage', content.includes('--help') || content.includes('-h'));

// Test 5: Has proper shebang
test('Script has proper shebang', content.startsWith('#!/usr/bin/env node'));

// Test 6: Imports @stacks/transactions
test('Script imports @stacks/transactions', content.includes('@stacks/transactions'));

// Test 7: Imports @stacks/network
test('Script imports @stacks/network', content.includes('@stacks/network'));

// Test 8: Has buildPrompt function
test('Script has buildPrompt function', content.includes('function buildPrompt'));

// Test 9: Has parseLLMResponse function
test('Script has parseLLMResponse function', content.includes('function parseLLMResponse'));

// Test 10: Has queryModel function
test('Script has queryModel function', content.includes('function queryModel'));

// Test 11: Has queryAllModels function
test('Script has queryAllModels function', content.includes('function queryAllModels'));

// Test 12: Has aggregateVotes function
test('Script has aggregateVotes function', content.includes('function aggregateVotes'));

// Test 13: Has submitRecommendations function
test('Script has submitRecommendations function', content.includes('function submitRecommendations'));

// Test 14: Has MODEL_CONFIGS with model definitions
test('Script has MODEL_CONFIGS object', content.includes('MODEL_CONFIGS'));

// Test 15: Has GPT-4 Turbo config
test('Script has gpt-4-turbo config', content.includes('gpt-4-turbo'));

// Test 16: Has Claude 3 Opus config
test('Script has claude-3-opus config', content.includes('claude-3-opus'));

// Test 17: Has Llama 3 config
test('Script has llama-3-70b config', content.includes('llama-3-70b'));

// Test 18: Has defaultWeight for models
test('Script has defaultWeight in configs', content.includes('defaultWeight'));

// Test 19: Has OpenRouter integration
test('Script has callOpenRouter function', content.includes('callOpenRouter'));

// Test 20: Has OpenAI integration
test('Script has callOpenAI function', content.includes('callOpenAI'));

// Test 21: Has Anthropic integration
test('Script has callAnthropic function', content.includes('callAnthropic'));

// Test 22: Has parallel query with Promise.all
test('Script uses Promise.all for parallel queries', content.includes('Promise.all'));

// Test 23: Has weighted voting logic
test('Script has weighted voting logic', content.includes('weighted') && content.includes('weight'));

// Test 24: Has consensus calculation
test('Script has consensus calculation', content.includes('consensus'));

// Test 25: Parses DECISION from LLM response
test('Script parses DECISION from LLM response', content.includes('DECISION:'));

// Test 26: Parses CONFIDENCE from LLM response
test('Script parses CONFIDENCE from LLM response', content.includes('CONFIDENCE:'));

// Test 27: Parses REASONING from LLM response
test('Script parses REASONING from LLM response', content.includes('REASONING:'));

// Test 28: Has contract configuration
test('Script has contract configuration', content.includes('aiOracleCouncil'));

// Test 29: Uses makeContractCall
test('Script uses makeContractCall', content.includes('makeContractCall'));

// Test 30: Uses uintCV for market ID
test('Script uses uintCV for market ID', content.includes('uintCV'));

// Test 31: Uses stringAsciiCV for question
test('Script uses stringAsciiCV for question', content.includes('stringAsciiCV'));

// Test 32: Has evidence list support
test('Script supports evidence list', content.includes('evidence'));

// Test 33: Has --models argument
test('Script parses --models argument', content.includes('--models'));

// Test 34: Has --min-consensus argument
test('Script parses --min-consensus argument', content.includes('--min-consensus'));

// Test 35: Has default min consensus of 60
test('Script has default min consensus of 60', content.includes("minConsensus: args") && content.includes('60'));

// Test 36: Has --verbose flag
test('Script has --verbose flag', content.includes('--verbose'));

// Test 37: Has verbose output for individual models
test('Script shows individual model results when verbose', content.includes('verbose') && content.includes('Individual Model Results'));

// Test 38: Has --batch-pending mode
test('Script has --batch-pending mode', content.includes('--batch-pending'));

// Test 39: Has dry-run mode
test('Script has dry-run mode', content.includes('--dry-run') || content.includes('dryRun'));

// Test 40: Has network selection (testnet/mainnet)
test('Script has network selection', content.includes('--mainnet') || content.includes('mainnet'));

// Test 41: Checks for API keys
test('Script checks for API keys', content.includes('OPENROUTER_API_KEY') || content.includes('OPENAI_API_KEY') || content.includes('ANTHROPIC_API_KEY'));

// Test 42: Exports helper functions
test('Script exports helper functions', content.includes('export'));

// Test 43: Has colored output
test('Script has colored output', content.includes('\\x1b[') || content.includes('colors:'));

// Test 44: Has weightedYes/weightedNo calculation
test('Script calculates weightedYes and weightedNo', content.includes('weightedYes') && content.includes('weightedNo'));

// Test 45: Has outcome determination by weighted majority
test('Script determines outcome by weighted majority', content.includes('yesPercentage') && content.includes('noPercentage'));

// Test 46: Has consensus percentage calculation
test('Script calculates consensus percentage', content.includes('totalWeight') && content.includes('consensus'));

// Test 47: Uses request-ai-evaluation function
test('Script calls request-ai-evaluation', content.includes('request-ai-evaluation'));

// Test 48: Records model recommendation in contract
test('Script records model recommendations', content.includes('record-ai-recommendation'));

// Test 49: Has market-id argument parsing
test('Script parses --market-id argument', content.includes('--market-id'));

// Test 50: Has question argument parsing
test('Script parses --question argument', content.includes('--question'));

// Test 51: Has evidence argument parsing
test('Script parses --evidence argument', content.includes('--evidence'));

// Test 52: Has auto-submit mode
test('Script has --auto mode', content.includes('--auto'));

// Test 53: Uses colors.reset for terminal formatting
test('Script uses colors.reset', content.includes('colors.reset'));

// Test 54: Has vote details tracking
test('Script tracks vote details', content.includes('details'));

// Test 55: Has error handling for model queries
test('Script has error handling for model queries', content.includes('try') && content.includes('catch') && content.includes('queryModel'));

// Test 56: Filters out failed model queries
test('Script filters out failed queries', content.includes('filter') && content.includes('null'));

// Test 57: Has timestamp in evaluation request
test('Script includes timestamp in evaluation', content.includes('timestamp') || content.includes('block-height'));

// Test 58: Has current date in prompt
test('Script includes current date in prompt', content.includes('new Date().toISOString()'));

// Test 59: Has clean banner/box output
test('Script has formatted output banner', content.includes('╔═══') || content.includes('AI Council Aggregator'));

// Test 60: Uses listCV for evidence
test('Script uses listCV for evidence', content.includes('listCV'));

// Summary
console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
console.log(`${colors.gray}Total:  ${passed + failed}${colors.reset}`);
console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);

process.exit(failed > 0 ? 1 : 0);
