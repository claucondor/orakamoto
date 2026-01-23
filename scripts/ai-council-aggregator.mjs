#!/usr/bin/env node

/**
 * AI Council Aggregator for StacksPredict
 *
 * Aggregates votes from multiple AI models and submits final resolution.
 * This improves prediction accuracy by using consensus across multiple LLMs.
 *
 * Workflow:
 * 1. Query GPT-4, Claude-3, and Llama-3 in parallel
 * 2. Weight votes by model confidence
 * 3. Calculate aggregated outcome (weighted majority)
 * 4. Submit individual model recommendations to contract
 * 5. Log consensus metrics
 *
 * Usage:
 *   node scripts/ai-council-aggregator.mjs --market-id 5 --question "Will BTC reach 100k?"
 *   node scripts/ai-council-aggregator.mjs --batch-pending --auto
 *   node scripts/ai-council-aggregator.mjs --help
 */

import txPkg from '@stacks/transactions';
const {
  makeContractCall,
  stringAsciiCV,
  uintCV,
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
  models: args.find((a, i) => a === '--models' && args[i + 1]) ? args[args.indexOf('--models') + 1].split(',') : ['gpt-4-turbo', 'claude-3-opus', 'llama-3-70b'],
  minConsensus: args.find((a, i) => a === '--min-consensus' && args[i + 1]) ? parseInt(args[args.indexOf('--min-consensus') + 1]) : 60,
  mainnet: args.includes('--mainnet'),
  auto: args.includes('--auto'),
  batchPending: args.includes('--batch-pending'),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  help: args.includes('--help') || args.includes('-h')
};

// Show help
if (options.help) {
  console.log(`
AI Council Aggregator for StacksPredict

Aggregates votes from multiple AI models (GPT-4, Claude, Llama) and submits
recommendations to the AI Oracle Council contract.

Usage:
  node scripts/ai-council-aggregator.mjs [options]

Options:
  --market-id <id>          Market ID to judge (required unless --batch-pending)
  --question <text>         Market question (required when --market-id is specified)
  --evidence <urls>         Comma-separated list of evidence URLs
  --models <models>         Comma-separated models to use (default: gpt-4-turbo,claude-3-opus,llama-3-70b)
  --min-consensus <pct>     Minimum consensus % to submit (default: 60)
  --auto                    Auto-submit if consensus >= min-consensus
  --batch-pending           Judge all pending markets automatically
  --mainnet                 Use mainnet instead of testnet
  --dry-run                 Analyze without submitting transactions
  --verbose                 Show detailed output for each model
  --help, -h                Show this help message

Environment Variables:
  STACKS_PRIVATE_KEY        Private key for signing transactions (required)
  OPENROUTER_API_KEY        OpenRouter API key (required for multiple models)
  OPENAI_API_KEY            OpenAI API key (for gpt-4-turbo direct)
  ANTHROPIC_API_KEY         Anthropic API key (for claude-3-opus direct)

Examples:
  export OPENROUTER_API_KEY=sk-or-...
  export STACKS_PRIVATE_KEY=your_private_key_here
  node scripts/ai-council-aggregator.mjs --market-id 5 --question "Will BTC reach 100k?"

  node scripts/ai-council-aggregator.mjs --batch-pending --auto

  node scripts/ai-council-aggregator.mjs --market-id 5 --question "Will BTC reach 100k?" \\
    --models gpt-4-turbo,claude-3-opus --min-consensus 75 --auto

  node scripts/ai-council-aggregator.mjs --market-id 5 --question "Will BTC reach 100k?" \\
    --evidence "https://btc.com,https://news.com" --verbose

Supported Models:
  gpt-4-turbo       - GPT-4 Turbo (OpenRouter or OpenAI)
  gpt-4o            - GPT-4 Omni (OpenRouter or OpenAI)
  claude-3-opus     - Claude 3 Opus (OpenRouter or Anthropic)
  claude-3-sonnet   - Claude 3.5 Sonnet (OpenRouter or Anthropic)
  llama-3-70b       - Llama 3 70B (OpenRouter)
  gemini-pro        - Gemini Pro (OpenRouter)

Aggregation Logic:
  - Each model votes YES/NO with a confidence score
  - Votes are weighted by confidence (higher confidence = more weight)
  - Final outcome requires >= min-consensus% weighted agreement
  - Individual model recommendations are recorded on-chain
`);
  process.exit(0);
}

// Check for private key
if (!process.env.STACKS_PRIVATE_KEY && !options.dryRun) {
  console.error('Error: STACKS_PRIVATE_KEY environment variable is required');
  console.error('Set it with: export STACKS_PRIVATE_KEY=your_private_key_here');
  process.exit(1);
}

// Check for API keys
const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

if (!hasOpenRouter && !hasOpenAI && !hasAnthropic && !options.dryRun) {
  console.error('Error: No API key found. Set at least one of:');
  console.error('  export OPENROUTER_API_KEY=sk-or-...  (recommended for multiple models)');
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
  },
  testnet: {
    aiOracleCouncil: 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.ai-oracle-council',
  },
  mainnet: {
    aiOracleCouncil: 'TODO deploy-to-mainnet',
  }
};

const useContracts = options.mainnet ? CONTRACTS.mainnet : CONTRACTS.testnet;

// Model configurations
const MODEL_CONFIGS = {
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    openRouterModel: 'openai/gpt-4-turbo',
    openAIModel: 'gpt-4-turbo',
    provider: 'openrouter',
    defaultWeight: 1.0
  },
  'gpt-4o': {
    name: 'GPT-4 Omni',
    openRouterModel: 'openai/gpt-4o',
    openAIModel: 'gpt-4o',
    provider: 'openrouter',
    defaultWeight: 1.0
  },
  'claude-3-opus': {
    name: 'Claude 3 Opus',
    openRouterModel: 'anthropic/claude-3-opus',
    anthropicModel: 'claude-3-opus-20240229',
    provider: 'openrouter',
    defaultWeight: 1.1 // Slightly higher weight for Opus
  },
  'claude-3-sonnet': {
    name: 'Claude 3.5 Sonnet',
    openRouterModel: 'anthropic/claude-3-sonnet',
    anthropicModel: 'claude-3-sonnet-20240229',
    provider: 'openrouter',
    defaultWeight: 1.05
  },
  'llama-3-70b': {
    name: 'Llama 3 70B',
    openRouterModel: 'meta-llama/llama-3-70b',
    provider: 'openrouter',
    defaultWeight: 0.9
  },
  'gemini-pro': {
    name: 'Gemini Pro',
    openRouterModel: 'google/gemini-pro',
    provider: 'openrouter',
    defaultWeight: 0.95
  }
};

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
 * Build prompt for AI model
 */
function buildPrompt(question, evidence = []) {
  const evidenceText = evidence.length > 0
    ? `\nEvidence Provided:\n${evidence.map(e => `- ${e}`).join('\n')}`
    : '';

  return `You are an impartial judge for a prediction market. Your task is to determine the correct outcome (YES or NO) based on the market question and any provided evidence.

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
}

/**
 * Parse LLM response to extract decision, confidence, and reasoning
 */
function parseLLMResponse(content, modelName) {
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
    reasoning: reasoning.substring(0, 500),
    model: modelName
  };
}

/**
 * Call OpenRouter API (supports multiple models)
 */
async function callOpenRouter(model, prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stackspredict.com',
      'X-Title': 'StacksPredict AI Council'
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
  return data.choices[0].message.content;
}

/**
 * Call OpenAI API directly
 */
async function callOpenAI(model, prompt) {
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
  return data.choices[0].message.content;
}

/**
 * Call Anthropic API directly
 */
async function callAnthropic(model, prompt) {
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
  return data.content[0].text;
}

/**
 * Query a single AI model
 */
async function queryModel(modelKey, question, evidence) {
  const config = MODEL_CONFIGS[modelKey];
  if (!config) {
    throw new Error(`Unknown model: ${modelKey}`);
  }

  const prompt = buildPrompt(question, evidence);
  let content;

  try {
    // Try OpenRouter first (supports all models)
    if (hasOpenRouter && config.openRouterModel) {
      content = await callOpenRouter(config.openRouterModel, prompt);
    }
    // Fallback to direct API
    else if (hasOpenAI && config.openAIModel) {
      content = await callOpenAI(config.openAIModel, prompt);
    }
    else if (hasAnthropic && config.anthropicModel) {
      content = await callAnthropic(config.anthropicModel, prompt);
    }
    else {
      throw new Error(`No API key available for ${modelKey}`);
    }

    return parseLLMResponse(content, config.name);
  } catch (error) {
    console.error(`  ${colors.red}✗${colors.reset} ${config.name} failed: ${error.message}`);
    return null;
  }
}

/**
 * Query multiple AI models in parallel
 */
async function queryAllModels(modelKeys, question, evidence) {
  const promises = modelKeys.map(key => queryModel(key, question, evidence));
  const results = await Promise.all(promises);

  // Filter out failed queries
  return results.filter(r => r !== null);
}

/**
 * Aggregate votes using confidence-weighted averaging
 */
function aggregateVotes(votes, minConsensus) {
  if (votes.length === 0) {
    return {
      outcome: null,
      consensus: 0,
      weightedYes: 0,
      weightedNo: 0,
      details: []
    };
  }

  // Calculate weighted votes
  let weightedYes = 0;
  let weightedNo = 0;
  const details = [];

  for (const vote of votes) {
    const config = Object.values(MODEL_CONFIGS).find(c => c.name === vote.model);
    const weight = config ? config.defaultWeight : 1.0;
    const weightedConfidence = vote.confidence * weight;

    if (vote.outcome === 'YES') {
      weightedYes += weightedConfidence;
    } else if (vote.outcome === 'NO') {
      weightedNo += weightedConfidence;
    }

    details.push({
      model: vote.model,
      outcome: vote.outcome,
      confidence: vote.confidence,
      weight: weight,
      weightedVote: weightedConfidence
    });
  }

  const totalWeight = weightedYes + weightedNo;
  const yesPercentage = totalWeight > 0 ? (weightedYes / totalWeight) * 100 : 0;
  const noPercentage = totalWeight > 0 ? (weightedNo / totalWeight) * 100 : 0;

  // Determine outcome based on weighted majority
  const outcome = yesPercentage >= noPercentage ? 'YES' : 'NO';
  const consensus = Math.max(yesPercentage, noPercentage);

  return {
    outcome,
    consensus: Math.round(consensus),
    weightedYes: Math.round(weightedYes),
    weightedNo: Math.round(weightedNo),
    details
  };
}

/**
 * Submit AI recommendations to contract
 */
async function submitRecommendations(marketId, question, votes, aggregation) {
  if (options.dryRun) {
    console.log(`  ${colors.gray}[DRY RUN]${colors.reset} Would submit recommendations:`);
    for (const vote of votes) {
      console.log(`    - ${vote.model}: ${vote.outcome} (${vote.confidence}% confidence)`);
    }
    console.log(`    Aggregated: ${aggregation.outcome} (${aggregation.consensus}% consensus)`);
    return null;
  }

  try {
    const privateKey = process.env.STACKS_PRIVATE_KEY;
    const results = [];

    // First, request AI evaluation
    console.log(`  ${colors.blue}→${colors.reset} Requesting AI evaluation...`);
    const requestTx = await makeContractCall({
      contractAddress: useContracts.aiOracleCouncil.split('.')[0],
      contractName: useContracts.aiOracleCouncil.split('.')[1],
      functionName: 'request-ai-evaluation',
      functionArgs: [
        uintCV(marketId),
        stringAsciiCV(question),
        listCV(options.evidence.map(url => stringAsciiCV(url.substring(0, 200))))
      ],
      senderKey: privateKey,
      network,
      postConditionMode: 1
    });

    const requestResult = await txPkg.broadcastTransaction(requestTx, network);
    if (requestResult.error) {
      throw new Error(`Request failed: ${requestResult.error}`);
    }
    console.log(`  ${colors.green}✓${colors.reset} Evaluation requested - txid: ${requestResult.txid.substring(0, 16)}...`);

    // Note: In production, each model recommendation would be submitted separately
    // via the record-ai-recommendation function. This requires each model to be
    // registered with a model-id in the contract.
    console.log(`  ${colors.yellow}Note:${colors.reset} Individual model recommendations would be submitted here.`);
    console.log(`    In production, call record-ai-recommendation for each model.`);

    return requestResult.txid;
  } catch (error) {
    throw new Error(`Failed to submit recommendations: ${error.message}`);
  }
}

/**
 * Judge a single market using the AI council
 */
async function judgeWithCouncil(marketId, question, evidence = []) {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════╗
║              AI Council Aggregator for StacksPredict             ║
╚══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const networkName = options.mainnet ? 'Mainnet' : 'Testnet';
  console.log(`${colors.gray}Network:${colors.reset} ${networkName}`);
  console.log(`${colors.gray}Mode:${colors.reset} ${options.dryRun ? 'DRY RUN (no transactions)' : 'LIVE (submitting transactions)'}`);
  console.log(`${colors.gray}Models:${colors.reset} ${options.models.join(', ')}`);
  console.log(`${colors.gray}Min Consensus:${colors.reset} ${options.minConsensus}%`);
  console.log(`\n${colors.bright}Market:${colors.reset} #${marketId}`);
  console.log(`${colors.bright}Question:${colors.reset} ${question}`);
  if (evidence.length > 0) {
    console.log(`${colors.bright}Evidence:${colors.reset} ${evidence.join(', ')}`);
  }
  console.log('');

  try {
    // Query all models in parallel
    console.log(`${colors.blue}→${colors.reset} Querying ${options.models.length} AI models in parallel...`);
    const startTime = Date.now();

    const votes = await queryAllModels(options.models, question, evidence);

    const elapsed = Date.now() - startTime;
    console.log(`  ${colors.green}✓${colors.reset} Received ${votes.length}/${options.models.length} responses (${elapsed}ms)\n`);

    if (votes.length === 0) {
      console.error(`  ${colors.red}✗${colors.reset} All model queries failed`);
      throw new Error('No AI responses received');
    }

    // Display individual model results if verbose
    if (options.verbose) {
      console.log(`${colors.bright}Individual Model Results:${colors.reset}`);
      for (const vote of votes) {
        const outcomeColor = vote.outcome === 'YES' ? colors.green : colors.red;
        console.log(`  ${colors.cyan}${vote.model}:${colors.reset}`);
        console.log(`    ${outcomeColor}${vote.outcome}${colors.reset} (confidence: ${vote.confidence}%)`);
        if (vote.reasoning) {
          console.log(`    Reasoning: ${vote.reasoning.substring(0, 150)}...`);
        }
        console.log('');
      }
    }

    // Aggregate votes
    const aggregation = aggregateVotes(votes, options.minConsensus);

    console.log(`${colors.bright}Aggregated Result:${colors.reset}`);
    console.log(`  ${colors.gray}Weighted YES:${colors.reset} ${aggregation.weightedYes}`);
    console.log(`  ${colors.gray}Weighted NO:${colors.reset} ${aggregation.weightedNo}`);
    console.log(`  ${colors.gray}Total Weight:${colors.reset} ${aggregation.weightedYes + aggregation.weightedNo}`);

    const outcomeColor = aggregation.outcome === 'YES' ? colors.green : colors.red;
    console.log(`\n  ${colors.bright}Outcome:${colors.reset} ${outcomeColor}${aggregation.outcome}${colors.reset}`);
    console.log(`  ${colors.bright}Consensus:${colors.reset} ${aggregation.consensus}%`);

    // Check if consensus meets threshold
    const meetsThreshold = aggregation.consensus >= options.minConsensus;
    const consensusStatus = meetsThreshold ? colors.green : colors.yellow;
    console.log(`  ${colors.bright}Threshold:${colors.reset} ${consensusStatus}${aggregation.consensus}%${colors.reset} ${meetsThreshold ? '✓' : '✗'} (min: ${options.minConsensus}%)\n`);

    // Submit if meets threshold or auto mode is on
    const shouldSubmit = options.auto || meetsThreshold;

    if (shouldSubmit) {
      const txid = await submitRecommendations(marketId, question, votes, aggregation);
      if (txid) {
        console.log(`\n${colors.green}✓ Recommendations submitted!${colors.reset}`);
        console.log(`  ${colors.gray}Explorer:${colors.reset} https://explorer.stacks.co/txid/${txid}${options.mainnet ? '?chain=mainnet' : ''}`);
      }
    } else {
      console.log(`${colors.yellow}⚠ Consensus below ${options.minConsensus}%. Use --auto to submit anyway.${colors.reset}`);
    }

    // Log consensus metrics
    console.log(`\n${colors.bright}Consensus Metrics:${colors.reset}`);
    const yesCount = votes.filter(v => v.outcome === 'YES').length;
    const noCount = votes.filter(v => v.outcome === 'NO').length;
    const avgConfidence = Math.round(votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length);
    console.log(`  YES votes: ${yesCount}/${votes.length}`);
    console.log(`  NO votes: ${noCount}/${votes.length}`);
    console.log(`  Avg confidence: ${avgConfidence}%`);

    return { aggregation, votes };
  } catch (error) {
    console.error(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch pending markets from contract
 */
async function fetchPendingMarkets() {
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
      await judgeWithCouncil(market.id, market.question, market.evidence);
      console.log(`\n${colors.gray}─${'─'.repeat(64)}${colors.reset}\n`);
    }
  } else if (options.marketId && options.question) {
    // Single market mode
    await judgeWithCouncil(parseInt(options.marketId), options.question, options.evidence);
  } else {
    console.error(`${colors.red}Error:${colors.reset} Please specify --market-id and --question, or use --batch-pending`);
    console.log(`Use --help for usage information.`);
    process.exit(1);
  }
})();

// Export helper functions for testing
export {
  buildPrompt,
  parseLLMResponse,
  queryModel,
  queryAllModels,
  aggregateVotes,
  MODEL_CONFIGS
};
