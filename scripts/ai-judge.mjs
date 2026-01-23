#!/usr/bin/env node

/**
 * AI Judge for StacksPredict
 *
 * Uses LLMs (GPT-4, Claude, etc.) to analyze market outcomes and submit resolution votes.
 * Supports multiple AI providers: OpenAI, OpenRouter, Anthropic.
 *
 * Usage:
 *   node scripts/ai-judge.js --market-id 5 --question "Will BTC reach 100k?"
 *   node scripts/ai-judge.js --batch-pending --auto
 *   node scripts/ai-judge.js --help
 */

import txPkg from '@stacks/transactions';
const {
  makeContractCall,
  stringAsciiCV,
  uintCV,
  boolCV,
  listCV
} = txPkg;
import netPkg from '@stacks/network';
const { StacksTestnet, StacksMainnet } = netPkg;

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  marketId: args.find((a, i) => a === '--market-id' && args[i + 1]) ? args[args.indexOf('--market-id') + 1] : null,
  question: args.find((a, i) => a === '--question' && args[i + 1]) ? args[args.indexOf('--question') + 1] : null,
  evidence: args.find((a, i) => a === '--evidence' && args[i + 1]) ? args[args.indexOf('--evidence') + 1].split(',') : [],
  model: args.find((a, i) => a === '--model' && args[i + 1]) ? args[args.indexOf('--model') + 1] : 'openai/gpt-4-turbo',
  apiProvider: args.find((a, i) => a === '--api-provider' && args[i + 1]) ? args[args.indexOf('--api-provider') + 1] : 'openrouter',
  mainnet: args.includes('--mainnet'),
  auto: args.includes('--auto'),
  batchPending: args.includes('--batch-pending'),
  dryRun: args.includes('--dry-run'),
  help: args.includes('--help') || args.includes('-h')
};

// Show help
if (options.help) {
  console.log(`
AI Judge for StacksPredict

Usage:
  node scripts/ai-judge.js [options]

Options:
  --market-id <id>          Market ID to judge (required unless --batch-pending)
  --question <text>         Market question (required when --market-id is specified)
  --evidence <urls>         Comma-separated list of evidence URLs
  --model <model>           AI model to use (default: openai/gpt-4-turbo)
  --api-provider <provider> API provider: openrouter, openai, or anthropic (default: openrouter)
  --batch-pending           Judge all pending markets automatically
  --auto                    Auto-submit if confidence > 80%
  --mainnet                 Use mainnet instead of testnet
  --dry-run                 Analyze without submitting transactions
  --help, -h                Show this help message

Environment Variables:
  STACKS_PRIVATE_KEY        Private key for signing transactions (required)
  OPENROUTER_API_KEY        OpenRouter API key (default provider)
  OPENAI_API_KEY            OpenAI API key (for --api-provider openai)
  ANTHROPIC_API_KEY         Anthropic API key (for --api-provider anthropic)

Examples:
  export OPENROUTER_API_KEY=sk-or-...
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/ai-judge.js --market-id 5 --question "Will BTC reach 100k?"

  node scripts/ai-judge.js --batch-pending --auto

  node scripts/ai-judge.js --market-id 5 --question "Will BTC reach 100k?" \\
    --evidence "https://btc.com,https://news.com" --model claude-3-opus

Supported Models:
  openai/gpt-4-turbo       - GPT-4 Turbo (OpenRouter)
  openai/gpt-4o           - GPT-4 Omni (OpenRouter)
  anthropic/claude-3-opus  - Claude 3 Opus (OpenRouter)
  anthropic/claude-3-sonnet - Claude 3.5 Sonnet (OpenRouter)
  meta-llama/llama-3-70b  - Llama 3 70B (OpenRouter)

Direct API Providers:
  openai - gpt-4-turbo, gpt-4o, gpt-4
  anthropic - claude-3-opus-20240229, claude-3-sonnet-20240229
`);
  process.exit(0);
}

// Check for private key
if (!process.env.STACKS_PRIVATE_KEY && !options.dryRun) {
  console.error('Error: STACKS_PRIVATE_KEY environment variable is required');
  console.error('Set it with: export STACKS_PRIVATE_KEY=your_private_key_here');
  process.exit(1);
}

// Check for API key
const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey && !options.dryRun) {
  console.error('Error: No API key found. Set one of:');
  console.error('  export OPENROUTER_API_KEY=sk-or-...');
  console.error('  export OPENAI_API_KEY=sk-...');
  console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

// Configuration
const network = options.mainnet ? StacksMainnet : StacksTestnet;

// Contract addresses
const CONTRACTS = {
  simnet: {
    aiOracleCouncil: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.ai-oracle-council',
    marketFactory: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.market-factory'
  },
  testnet: {
    aiOracleCouncil: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.ai-oracle-council',
    marketFactory: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.market-factory-v2'
  },
  mainnet: {
    aiOracleCouncil: 'TODO deploy-to-mainnet',
    marketFactory: 'TODO deploy-to-mainnet'
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
  gray: '\x1b[90m',
  magenta: '\x1b[35m'
};

/**
 * Call LLM API to analyze market
 * @param {string} question - Market question
 * @param {string[]} evidence - List of evidence URLs/contexts
 * @returns {Promise<{outcome: string, confidence: number, reasoning: string}>}
 */
async function callLLM(question, evidence = []) {
  const provider = options.apiProvider.toLowerCase();
  const model = options.model;

  // Build prompt
  const evidenceText = evidence.length > 0
    ? `\nEvidence Provided:\n${evidence.map(e => `- ${e}`).join('\n')}`
    : '';

  const prompt = `You are an impartial judge for a prediction market. Your task is to determine the correct outcome (YES or NO) based on the market question and any provided evidence.

Market Question: "${question}"${evidenceText}

Instructions:
1. Analyze the question carefully
2. Consider the current date: ${new Date().toISOString().split('T')[0]}
3. Evaluate any evidence provided
4. Determine the correct outcome based on facts
5. Provide your reasoning and confidence level

Respond in this exact format:
REASONING: [Your detailed analysis and reasoning]
DECISION: [YES or NO]
CONFIDENCE: [0-100]

Important rules:
- If the question refers to a future event that hasn't happened yet, base your decision on current available information
- Be objective and factual
- Confidence should reflect how certain you are of your decision
- DECISION must be exactly "YES" or "NO" (uppercase)`;

  try {
    let response;

    if (provider === 'openrouter' || provider === 'openrouter') {
      response = await callOpenRouter(prompt, model);
    } else if (provider === 'openai') {
      response = await callOpenAI(prompt, model);
    } else if (provider === 'anthropic') {
      response = await callAnthropic(prompt, model);
    } else {
      throw new Error(`Unknown API provider: ${provider}`);
    }

    return response;
  } catch (error) {
    throw new Error(`LLM API call failed: ${error.message}`);
  }
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(prompt, model) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stackspredict.com',
      'X-Title': 'StacksPredict AI Judge'
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return parseLLMResponse(content);
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return parseLLMResponse(content);
}

/**
 * Call Anthropic API
 */
async function callAnthropic(prompt, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  return parseLLMResponse(content);
}

/**
 * Parse LLM response to extract decision, confidence, and reasoning
 */
function parseLLMResponse(content) {
  // Extract reasoning
  const reasoningMatch = content.match(/REASONING:\s*(.+?)(?=DECISION:|$)/s);
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : content;

  // Extract decision
  const decisionMatch = content.match(/DECISION:\s*(YES|NO)/i);
  const decision = decisionMatch ? decisionMatch[1].toUpperCase() : 'UNKNOWN';

  // Extract confidence
  const confidenceMatch = content.match(/CONFIDENCE:\s*(\d+)/);
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 50;

  return {
    outcome: decision,
    confidence,
    reasoning: reasoning.substring(0, 500) // Limit to 500 chars for contract
  };
}

/**
 * Submit AI recommendation to contract
 * @param {number} marketId - Market ID
 * @param {string} outcome - YES or NO
 * @param {number} confidence - Confidence 0-1000000 (6 decimals)
 * @param {string[]} evidence - Evidence links
 */
async function submitRecommendation(marketId, outcome, confidence, evidence) {
  if (options.dryRun) {
    console.log(`  ${colors.gray}[DRY RUN]${colors.reset} Would submit recommendation:`);
    console.log(`    Market ID: ${marketId}`);
    console.log(`    Outcome: ${outcome}`);
    console.log(`    Confidence: ${(confidence / 10000).toFixed(2)}%`);
    console.log(`    Evidence: ${evidence.join(', ')}`);
    return null;
  }

  try {
    const privateKey = process.env.STACKS_PRIVATE_KEY;

    // First, request AI evaluation
    console.log(`  ${colors.blue}→${colors.reset} Requesting AI evaluation...`);
    const requestTx = await makeContractCall({
      contractAddress: useContracts.aiOracleCouncil.split('.')[0],
      contractName: useContracts.aiOracleCouncil.split('.')[1],
      functionName: 'request-ai-evaluation',
      functionArgs: [
        uintCV(marketId),
        stringAsciiCV(options.question || `Market ${marketId}`),
        listCV(evidence.map(url => stringAsciiCV(url.substring(0, 200))))
      ],
      senderKey: privateKey,
      network,
      postConditionMode: 1 // Allow
    });

    const requestResult = await txPkg.broadcastTransaction(requestTx, network);
    if (requestResult.error) {
      throw new Error(`Request failed: ${requestResult.error}`);
    }

    console.log(`  ${colors.green}✓${colors.reset} Evaluation requested - txid: ${requestResult.txid.substring(0, 16)}...`);

    // Then submit the recommendation (in production, this would be done by the authorized bridge)
    // For now, we'll just log what would be submitted
    console.log(`  ${colors.yellow}Note:${colors.reset} In production, the authorized AI bridge would submit the recommendation.`);
    console.log(`    Outcome: ${outcome}`);
    console.log(`    Confidence: ${(confidence / 10000).toFixed(2)}%`);

    return requestResult.txid;
  } catch (error) {
    throw new Error(`Failed to submit recommendation: ${error.message}`);
  }
}

/**
 * Judge a single market
 */
async function judgeMarket(marketId, question, evidence = []) {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════╗
║                    AI Judge for StacksPredict                   ║
╚══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const networkName = options.mainnet ? 'Mainnet' : 'Testnet';
  console.log(`${colors.gray}Network:${colors.reset} ${networkName}`);
  console.log(`${colors.gray}Mode:${colors.reset} ${options.dryRun ? 'DRY RUN (no transactions)' : 'LIVE (submitting transactions)'}`);
  console.log(`${colors.gray}Model:${colors.reset} ${options.model}`);
  console.log(`${colors.gray}Provider:${colors.reset} ${options.apiProvider}`);
  console.log(`\n${colors.bright}Market:${colors.reset} #${marketId}`);
  console.log(`${colors.bright}Question:${colors.reset} ${question}`);
  if (evidence.length > 0) {
    console.log(`${colors.bright}Evidence:${colors.reset} ${evidence.join(', ')}`);
  }
  console.log('');

  try {
    // Call LLM
    console.log(`${colors.blue}→${colors.reset} Analyzing market with AI...`);
    const result = await callLLM(question, evidence);

    console.log(`  ${colors.green}✓${colors.reset} AI Analysis Complete\n`);
    console.log(`${colors.bright}REASONING:${colors.reset}`);
    console.log(`  ${result.reasoning.substring(0, 400)}${result.reasoning.length > 400 ? '...' : ''}`);
    console.log(`\n${colors.bright}DECISION:${colors.reset} ${result.outcome}`);
    console.log(`${colors.bright}CONFIDENCE:${colors.reset} ${result.confidence}%\n`);

    // Auto-submit if confidence is high enough
    const shouldSubmit = options.auto || result.confidence >= 80;

    if (shouldSubmit) {
      const confidenceScaled = Math.floor(result.confidence * 10000); // Convert to 6 decimals
      const txid = await submitRecommendation(marketId, result.outcome, confidenceScaled, evidence);
      if (txid) {
        console.log(`\n${colors.green}✓ Recommendation submitted!${colors.reset}`);
        console.log(`  ${colors.gray}Explorer:${colors.reset} https://explorer.stacks.co/txid/${txid}${options.mainnet ? '?chain=mainnet' : ''}`);
      }
    } else {
      console.log(`${colors.yellow}⚠ Confidence below 80%. Use --auto to submit anyway.${colors.reset}`);
    }

    return result;
  } catch (error) {
    console.error(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch pending markets from contract
 */
async function fetchPendingMarkets() {
  // This would query the contract for markets needing AI evaluation
  // For now, return empty array - this would need to be implemented
  // based on how markets are tracked
  console.log(`${colors.yellow}Note: Batch mode requires market tracking integration.${colors.reset}`);
  console.log(`Please specify --market-id and --question for individual markets.\n`);
  return [];
}

/**
 * Main entry point
 */
(async () => {
  if (options.batchPending) {
    // Batch mode - judge all pending markets
    console.log(`${colors.cyan}Batch mode enabled.${colors.reset}\n`);
    const pending = await fetchPendingMarkets();
    console.log(`Found ${pending.length} pending markets.\n`);

    for (const market of pending) {
      await judgeMarket(market.id, market.question, market.evidence);
      console.log(`\n${colors.gray}─${'─'.repeat(64)}${colors.reset}\n`);
    }
  } else if (options.marketId && options.question) {
    // Single market mode
    await judgeMarket(parseInt(options.marketId), options.question, options.evidence);
  } else {
    console.error(`${colors.red}Error:${colors.reset} Please specify --market-id and --question, or use --batch-pending`);
    console.log(`Use --help for usage information.`);
    process.exit(1);
  }
})();

// Export helper functions for testing
export {
  callLLM,
  parseLLMResponse,
  callOpenRouter,
  callOpenAI,
  callAnthropic
};
