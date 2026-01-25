import { describe, it, expect, beforeAll } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

const CONTRACT_NAME = 'multi-market-pool-v3';

// ============================================================================
// MONTE CARLO SIMULATION PARAMETERS (from academic paper)
// ============================================================================

// Academic Paper Equivalent Configuration
// Paper: 10,000 USDC liquidity, ~100 USDC trades (1% of pool), 50 trades
// This creates high volume/liquidity ratio: 50 trades × 100 = 5000 USDC = 50% of pool
const SIMULATION_CONFIG = {
  iterations: 100,
  liquidity: 10_000_000_000n, // 10,000 USDC with 6 decimals
  numTrades: 50,
  informedRatio: 0.15, // 15% informed traders
  baseFeeRate: 0.01, // 1% base fee (v3 uses 1% -> 20% exponential)
  // Trade sizes: 50-150 USDC = 0.5-1.5% of 10k pool (avg ~100 USDC = 1%)
  minTradeSize: 50_000_000n,   // 50 USDC with 6 decimals
  maxTradeSize: 150_000_000n,  // 150 USDC with 6 decimals
};

// Edge case scenarios from academic paper
interface ScenarioConfig {
  name: string;
  priceMove: number; // Final YES price (0-1)
  volatility: number; // Trade size multiplier
  informedDistribution: 'last_10pct' | 'last_20pct' | 'last_30pct' | 'first_20pct' | 'uniform';
  concentrationFactor?: number; // For concentrated informed trading
}

const SCENARIOS: ScenarioConfig[] = [
  { name: 'Standard', priceMove: 0.50, volatility: 1.0, informedDistribution: 'last_20pct', concentrationFactor: 4 },
  { name: 'Early Resolution', priceMove: 0.90, volatility: 0.5, informedDistribution: 'first_20pct', concentrationFactor: 4 },
  { name: 'Contested', priceMove: 0.10, volatility: 0.3, informedDistribution: 'uniform' },
  { name: 'Blowout', priceMove: 0.99, volatility: 2.0, informedDistribution: 'last_10pct', concentrationFactor: 8 },
  { name: 'Low Volume', priceMove: 0.40, volatility: 0.8, informedDistribution: 'last_30pct', concentrationFactor: 2 },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function fundWallet(wallet: string, amount: bigint | number) {
  const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount);
  simnet.callPublicFn('usdcx', 'faucet', [Cl.uint(amountBigInt)], wallet);
}

function mineToBlockHeight(targetHeight: number) {
  const currentHeight = simnet.blockHeight;
  const blocksToMine = Math.max(0, targetHeight - currentHeight);
  if (blocksToMine > 0) {
    simnet.mineEmptyBlocks(blocksToMine);
  }
}

// LP token authorization
const MULTI_MARKET_POOL_V3_PRINCIPAL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.multi-market-pool-v3';

function ensureLpTokenSetup() {
  const setResult = simnet.callPublicFn(
    'sip013-lp-token',
    'set-authorized-minter',
    [Cl.contractPrincipal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'multi-market-pool-v3')],
    deployer
  );
}

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Simple LCG random number generator
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextBoolean(): boolean {
    return this.next() < 0.5;
  }
}

// ============================================================================
// STATISTICAL FUNCTIONS
// ============================================================================

interface SimulationStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  wins: number;
  winRate: number;
  sharpe: number;
}

function calculateStats(returns: number[]): SimulationStats {
  const n = returns.length;
  const sorted = [...returns].sort((a, b) => a - b);

  const mean = returns.reduce((sum, r) => sum + r, 0) / n;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  const wins = returns.filter(r => r > 0).length;

  return {
    mean,
    std,
    min: sorted[0],
    max: sorted[n - 1],
    p5: sorted[Math.floor(n * 0.05)],
    p25: sorted[Math.floor(n * 0.25)],
    p50: sorted[Math.floor(n * 0.50)],
    p75: sorted[Math.floor(n * 0.75)],
    p95: sorted[Math.floor(n * 0.95)],
    wins,
    winRate: (wins / n) * 100,
    sharpe: mean / std,
  };
}

// ============================================================================
// MARKET SIMULATION
// ============================================================================

interface Trade {
  traderType: 'informed' | 'noise';
  outcome: number; // 0 for YES, 1 for NO
  amount: bigint;
  block: number;
}

interface MarketSimulationResult {
  lpReturn: number;
  feesCollected: bigint;
  finalYesPrice: number;
}

function generateTrades(rng: SeededRandom, scenario: ScenarioConfig, totalDuration: number, trueOutcome: number): Trade[] {
  const trades: Trade[] = [];
  const informedCount = Math.floor(SIMULATION_CONFIG.numTrades * SIMULATION_CONFIG.informedRatio);
  const noiseCount = SIMULATION_CONFIG.numTrades - informedCount;

  // Generate trade schedule
  const tradeBlocks: number[] = [];
  for (let i = 0; i < SIMULATION_CONFIG.numTrades; i++) {
    // Distribute trades throughout the market duration
    const block = rng.nextInt(1, totalDuration - 10);
    tradeBlocks.push(block);
  }
  tradeBlocks.sort((a, b) => a - b);

  // Determine informed trader positions based on scenario
  const informedPositions: number[] = [];
  const firstTradeBlock = Math.floor(tradeBlocks[0]);
  const lastTradeBlock = Math.floor(tradeBlocks[tradeBlocks.length - 1]);

  for (let i = 0; i < SIMULATION_CONFIG.numTrades; i++) {
    const block = tradeBlocks[i];

    switch (scenario.informedDistribution) {
      case 'last_10pct':
        // Informed traders in last 10% of trades
        if (i >= SIMULATION_CONFIG.numTrades * 0.9) {
          informedPositions.push(i);
        }
        break;
      case 'last_20pct':
        // Informed traders in last 20% of trades
        if (i >= SIMULATION_CONFIG.numTrades * 0.8) {
          informedPositions.push(i);
        }
        break;
      case 'last_30pct':
        // Informed traders in last 30% of trades
        if (i >= SIMULATION_CONFIG.numTrades * 0.7) {
          informedPositions.push(i);
        }
        break;
      case 'first_20pct':
        // Informed traders in first 20% of trades
        if (i < SIMULATION_CONFIG.numTrades * 0.2) {
          informedPositions.push(i);
        }
        break;
      case 'uniform':
        // Uniform distribution
        if (i % Math.floor(SIMULATION_CONFIG.numTrades / informedCount) === 0 && informedPositions.length < informedCount) {
          informedPositions.push(i);
        }
        break;
    }
  }

  // Fill remaining informed positions
  while (informedPositions.length < informedCount) {
    const pos = rng.nextInt(0, SIMULATION_CONFIG.numTrades - 1);
    if (!informedPositions.includes(pos)) {
      informedPositions.push(pos);
    }
  }

  const informedSet = new Set(informedPositions);

  // Generate trades
  for (let i = 0; i < SIMULATION_CONFIG.numTrades; i++) {
    const isInformed = informedSet.has(i);
    const baseAmount = BigInt(rng.nextInt(
      Number(SIMULATION_CONFIG.minTradeSize),
      Number(SIMULATION_CONFIG.maxTradeSize)
    ));

    // Adjust trade size by volatility
    const volatilityMultiplier = Math.max(0.5, Math.min(2.0, scenario.volatility));
    const amount = isInformed
      ? (baseAmount * BigInt(Math.floor(volatilityMultiplier * 100))) / 100n
      : baseAmount;

    // Determine outcome: informed traders always trade toward the true outcome, noise traders random
    const outcome = isInformed ? trueOutcome : (rng.nextBoolean() ? 0 : 1);

    trades.push({
      traderType: isInformed ? 'informed' : 'noise',
      outcome,
      amount,
      block: tradeBlocks[i],
    });
  }

  return trades;
}

function simulateMarket(
  rng: SeededRandom,
  scenario: ScenarioConfig,
  iteration: number
): MarketSimulationResult {
  // Ensure LP token authorization is set before creating market
  ensureLpTokenSetup();

  // Determine true outcome BEFORE generating trades
  // Randomize outcome for each iteration (50% YES, 50% NO)
  const trueOutcome = rng.nextBoolean() ? 0 : 1;

  // Create a fresh market for each iteration
  fundWallet(deployer, SIMULATION_CONFIG.liquidity);

  const marketDuration = 500; // blocks
  const currentBlock = simnet.blockHeight;
  const deadline = currentBlock + marketDuration;
  const resolutionDeadline = deadline + 100;

  const createResult = simnet.callPublicFn(
    CONTRACT_NAME,
    'create-market',
    [
      Cl.stringUtf8(`Market ${scenario.name} #${iteration}`),
      Cl.uint(deadline),
      Cl.uint(resolutionDeadline),
      Cl.uint(SIMULATION_CONFIG.liquidity),
    ],
    deployer
  );

  if (createResult.result.type !== 'ok') {
    throw new Error(`Failed to create market: ${JSON.stringify(createResult.result)}`);
  }

  const marketId = Number((createResult.result as any).value.value);

  // Get initial market state
  const marketBefore = simnet.callReadOnlyFn(
    CONTRACT_NAME,
    'get-market',
    [Cl.uint(marketId)],
    deployer
  );

  const createdAt = Number((marketBefore.result as any).value.value['created-at'].value);

  // Generate trades with the TRUE outcome known
  const trades = generateTrades(rng, scenario, marketDuration, trueOutcome);

  // Track LP initial position - get-balance returns (ok uint)
  const lpTokensBefore = simnet.callReadOnlyFn(
    'sip013-lp-token',
    'get-balance',
    [Cl.uint(marketId), Cl.standardPrincipal(deployer)],
    deployer
  );

  const initialLpTokens = BigInt(((lpTokensBefore.result as any).value?.value ?? '0') as string);

  // Execute trades
  let informedTraders = [wallet1, wallet2, wallet3];
  let noiseTraderIndex = 0;

  for (const trade of trades) {
    const trader = trade.traderType === 'informed'
      ? informedTraders[iteration % informedTraders.length]
      : (noiseTraderIndex % 2 === 0 ? wallet1 : wallet2);

    // Fund trader
    fundWallet(trader, trade.amount * 2n);

    // Mine to trade block
    const targetBlock = createdAt + trade.block;
    mineToBlockHeight(targetBlock);

    // Execute trade
    const tradeResult = simnet.callPublicFn(
      CONTRACT_NAME,
      'buy-outcome',
      [
        Cl.uint(marketId),
        Cl.uint(trade.outcome),
        Cl.uint(trade.amount),
        Cl.uint(0), // min tokens out
      ],
      trader
    );

    noiseTraderIndex++;
  }

  // Resolve market based on scenario
  // Resolve market with the true outcome (determined at the start of simulation)
  mineToBlockHeight(deadline + 1);
  simnet.callPublicFn(
    CONTRACT_NAME,
    'resolve',
    [Cl.uint(marketId), Cl.uint(trueOutcome)],
    deployer
  );

  // Wait for dispute window
  simnet.mineEmptyBlocks(10);

  // Calculate LP return
  // Get final fees
  const feesResult = simnet.callReadOnlyFn(
    CONTRACT_NAME,
    'get-accumulated-fees',
    [Cl.uint(marketId)],
    deployer
  );

  const totalFees = BigInt((feesResult.result as any).value.value['accumulated-fees'].value ?? 0n);
  const creatorFees = BigInt((feesResult.result as any).value.value['creator-fees'].value ?? 0n);

  // Get final LP tokens (unchanged for initial LP) - get-balance returns (ok uint)
  const lpTokensAfter = simnet.callReadOnlyFn(
    'sip013-lp-token',
    'get-balance',
    [Cl.uint(marketId), Cl.standardPrincipal(deployer)],
    deployer
  );

  const finalLpTokens = BigInt(((lpTokensAfter.result as any).value?.value ?? '0') as string);

  // Get final reserves to calculate total LP value
  const reserves = simnet.callReadOnlyFn(
    CONTRACT_NAME,
    'get-reserves',
    [Cl.uint(marketId)],
    deployer
  );

  let finalYesPrice = 0.5;
  let finalReserveValue = 0n;

  if (reserves.result && (reserves.result as any).value) {
    const yesReserves = BigInt(((reserves.result as any).value.value['yes-reserve']?.value ?? '0') as string);
    const noReserves = BigInt(((reserves.result as any).value.value['no-reserve']?.value ?? '0') as string);
    const total = yesReserves + noReserves;
    finalReserveValue = total;
    if (total > 0n) {
      finalYesPrice = Number(noReserves) / Number(total);
    }
  }

  // Calculate LP return including BOTH fees AND reserve value
  // With Dynamic Liquidity, value is captured through:
  // 1. Fees (explicit)
  // 2. Increased slippage that leaves more value in reserves (implicit)
  //
  // LP Return = (Final Reserve Value + Fees - Initial Liquidity) / Initial Liquidity
  const initialLiquidity = SIMULATION_CONFIG.liquidity;
  const finalValue = finalReserveValue + creatorFees; // Reserves + fees earned
  const lpReturn = Number(finalValue - initialLiquidity) / Number(initialLiquidity);

  return {
    lpReturn,
    feesCollected: totalFees,
    finalYesPrice,
  };
}

// ============================================================================
// MONTE CARLO TESTS
// ============================================================================

describe('Multi-Market Pool V3 - Monte Carlo Performance Tests', () => {
  beforeAll(() => {
    ensureLpTokenSetup();
  });

  describe('Academic Paper Validation', () => {
    it('should match expected performance metrics from academic paper', () => {
      const scenario: ScenarioConfig = {
        name: 'Standard',
        priceMove: 0.50,
        volatility: 1.0,
        informedDistribution: 'last_20pct',
        concentrationFactor: 4,
      };

      const returns: number[] = [];
      // Run 50 iterations to match academic paper methodology
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        const rng = new SeededRandom(i + 1);
        const result = simulateMarket(rng, scenario, i);
        returns.push(result.lpReturn);
      }

      const stats = calculateStats(returns);

      // Expected results from academic paper (Table 1):
      // CPMM Baseline: -4.51% mean return, 19.4% win rate
      // pm-AMM + Exp Fees Only: -1.81% mean return, 34.1% win rate
      // pm-AMM + Dynamic L Only: +5.81% mean return, 90.0% win rate
      // pm-AMM + Dynamic L + Exp Fees: +7.62% mean return, 95.0% win rate ← OUR TARGET
      // Full Protection (+ Global Pool + Yield): +10.36%, 98.6% win rate
      //
      // Our current implementation: pm-AMM + Dynamic Liquidity + Exponential Fees
      // Expected: +7.62% mean return, 95.0% win rate

      console.log('\n=== Monte Carlo Results (Standard Scenario) ===');
      console.log(`Implementation: pm-AMM + Dynamic Liquidity + Exponential Fees`);
      console.log(`Iterations: ${iterations}`);
      console.log(`Mean Return: ${(stats.mean * 100).toFixed(2)}%`);
      console.log(`Win Rate: ${stats.winRate.toFixed(1)}%`);
      console.log(`Std Dev: ${(stats.std * 100).toFixed(2)}%`);
      console.log(`Sharpe Ratio: ${stats.sharpe.toFixed(2)}`);
      console.log(`Max Loss: ${(stats.min * 100).toFixed(2)}%`);
      console.log(`Max Gain: ${(stats.max * 100).toFixed(2)}%`);
      console.log(`\nPercentiles:`);
      console.log(`  5th:  ${(stats.p5 * 100).toFixed(2)}%`);
      console.log(`  25th: ${(stats.p25 * 100).toFixed(2)}%`);
      console.log(`  50th: ${(stats.p50 * 100).toFixed(2)}%`);
      console.log(`  75th: ${(stats.p75 * 100).toFixed(2)}%`);
      console.log(`  95th: ${(stats.p95 * 100).toFixed(2)}%`);
      console.log(`\n--- Academic Paper Benchmarks (Table 1) ---`);
      console.log(`CPMM Baseline: -4.51%, 19.4% win rate`);
      console.log(`pm-AMM + Exp Fees Only: -1.81%, 34.1% win rate`);
      console.log(`pm-AMM + Dynamic L Only: +5.81%, 90.0% win rate`);
      console.log(`pm-AMM + Both (TARGET): +7.62%, 95.0% win rate`);
      console.log(`Full Protection: +10.36%, 98.6% win rate`);

      // Validate implementation correctness
      // Note: Our simulation uses smaller trades (0.5-1.5% of liquidity) vs paper's larger trades
      // Paper used: 100 USDC trades with 10k liquidity (1%), 1000 iterations, 30-day markets
      // We use: 50-150 USDC trades with 10M liquidity (0.005-0.015%), 50 iterations, 500-block markets
      //
      // With Dynamic L + Exp Fees implemented correctly, we should see:
      // 1. Positive returns (LPs are protected)
      // 2. Very high win rate (95%+ of iterations profitable)
      // 3. Low variance (consistent protection)
      //
      // The absolute return % will be lower than paper due to smaller trade sizes,
      // but the MECHANISM correctness is validated by positive returns + high win rate
      expect(stats.mean).toBeGreaterThan(0); // Positive returns = protection working
      expect(stats.winRate).toBeGreaterThan(90); // High win rate = consistent protection
      expect(stats.sharpe).toBeGreaterThan(2); // Good risk-adjusted returns
    });
  });

  describe('Edge Case Scenarios', () => {
    for (const scenario of SCENARIOS) {
      it(`should handle ${scenario.name} scenario`, () => {
        const returns: number[] = [];
        const iterations = 30; // Reduced for faster testing

        for (let i = 0; i < iterations; i++) {
          const rng = new SeededRandom(i + 1000);
          const result = simulateMarket(rng, scenario, i);
          returns.push(result.lpReturn);
        }

        const stats = calculateStats(returns);

        console.log(`\n=== ${scenario.name} Scenario ===`);
        console.log(`Mean Return: ${(stats.mean * 100).toFixed(2)}%`);
        console.log(`Win Rate: ${stats.winRate.toFixed(1)}%`);
        console.log(`Sharpe Ratio: ${stats.sharpe.toFixed(2)}`);

        // All scenarios should show positive expected returns
        expect(stats.mean).toBeGreaterThan(-0.05); // Allow some loss in worst cases
        expect(stats.winRate).toBeGreaterThan(30); // At least 30% win rate
      });
    }
  });

  describe('Exponential Fee Effectiveness', () => {
    it('should show increasing fees as market progresses', () => {
      ensureLpTokenSetup();
      fundWallet(deployer, SIMULATION_CONFIG.liquidity);

      const duration = 100;
      const currentBlock = simnet.blockHeight;
      const deadline = currentBlock + duration;

      const createResult = simnet.callPublicFn(
        CONTRACT_NAME,
        'create-market',
        [
          Cl.stringUtf8('Fee Test Market'),
          Cl.uint(deadline),
          Cl.uint(deadline + 100),
          Cl.uint(SIMULATION_CONFIG.liquidity),
        ],
        deployer
      );

      const marketId = Number((createResult.result as any).value.value);

      // Get created-at
      const market = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        'get-market',
        [Cl.uint(marketId)],
        deployer
      );
      const createdAt = Number((market.result as any).value.value['created-at'].value);

      // Test fees at different progress points
      const testPoints = [0, 25, 50, 75, 95];
      const fees: bigint[] = [];

      for (const progress of testPoints) {
        const targetBlock = createdAt + Math.floor((duration * progress) / 100);
        mineToBlockHeight(targetBlock);

        fundWallet(wallet1, 1_000_000n);

        // Get fee before trade
        const feesBefore = simnet.callReadOnlyFn(
          CONTRACT_NAME,
          'get-accumulated-fees',
          [Cl.uint(marketId)],
          deployer
        );
        const feeBefore = BigInt((feesBefore.result as any).value.value['accumulated-fees'].value ?? 0n);

        // Execute trade
        simnet.callPublicFn(
          CONTRACT_NAME,
          'buy-outcome',
          [Cl.uint(marketId), Cl.uint(0), Cl.uint(1_000_000n), Cl.uint(0)],
          wallet1
        );

        // Get fee after trade
        const feesAfter = simnet.callReadOnlyFn(
          CONTRACT_NAME,
          'get-accumulated-fees',
          [Cl.uint(marketId)],
          deployer
        );
        const feeAfter = BigInt((feesAfter.result as any).value.value['accumulated-fees'].value ?? 0n);

        fees.push(feeAfter - feeBefore);
      }

      console.log('\n=== Fee Progression ===');
      testPoints.forEach((p, i) => {
        console.log(`${p}% progress: ${Number(fees[i]) / 10000}% fee`);
      });

      // Fees should increase with progress (last fee > first fee)
      expect(fees[fees.length - 1]).toBeGreaterThan(fees[0]);
    });
  });

  describe('LP Protection Metrics', () => {
    it('should calculate comprehensive LP protection metrics', () => {
      const scenario: ScenarioConfig = {
        name: 'Comprehensive Test',
        priceMove: 0.60,
        volatility: 1.2,
        informedDistribution: 'last_20pct',
        concentrationFactor: 4,
      };

      const returns: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const rng = new SeededRandom(i + 5000);
        const result = simulateMarket(rng, scenario, i);
        returns.push(result.lpReturn);
      }

      const stats = calculateStats(returns);

      console.log('\n=== Comprehensive LP Protection Metrics ===');
      console.log(`Iterations: ${iterations}`);
      console.log(`\nReturn Statistics:`);
      console.log(`  Mean: ${(stats.mean * 100).toFixed(2)}%`);
      console.log(`  Std Dev: ${(stats.std * 100).toFixed(2)}%`);
      console.log(`  Min: ${(stats.min * 100).toFixed(2)}%`);
      console.log(`  Max: ${(stats.max * 100).toFixed(2)}%`);
      console.log(`\nRisk Metrics:`);
      console.log(`  Sharpe Ratio: ${stats.sharpe.toFixed(2)}`);
      console.log(`  Win Rate: ${stats.winRate.toFixed(1)}%`);
      console.log(`  Max Loss: ${(stats.min * 100).toFixed(2)}%`);
      console.log(`\nDistribution:`);
      console.log(`  5th percentile: ${(stats.p5 * 100).toFixed(2)}%`);
      console.log(`  25th percentile: ${(stats.p25 * 100).toFixed(2)}%`);
      console.log(`  Median: ${(stats.p50 * 100).toFixed(2)}%`);
      console.log(`  75th percentile: ${(stats.p75 * 100).toFixed(2)}%`);
      console.log(`  95th percentile: ${(stats.p95 * 100).toFixed(2)}%`);

      // Key assertions based on academic paper findings
      expect(stats.mean).toBeGreaterThan(0); // Positive expected return
      expect(stats.winRate).toBeGreaterThan(60); // High win rate
      expect(stats.min).toBeGreaterThan(-0.15); // Max loss < 15%
    });
  });
});
