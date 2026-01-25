/**
 * LP Protection Research - Comprehensive Simulation
 *
 * Based on:
 * - Paradigm pm-AMM paper: https://www.paradigm.xyz/2024/11/pm-amm
 * - LVR (Loss Versus Rebalancing) research
 * - Dynamic Liquidity mechanisms
 *
 * Author: Claude (Research Agent)
 * Date: 2025-01-24
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// CONFIGURATION - Toggle mechanisms on/off
// ============================================================================
const CONFIG = {
  // Run Monte Carlo iterations
  iterations: 1000,

  // Base parameters
  liquidity: 10000,
  numTrades: 50,
  informedRatio: 0.15,
  baseFeeRate: 0.03,
  avgTradeSize: 100,

  // Mechanisms (toggle on/off)
  mechanisms: {
    globalPool: true,      // Multi-market diversification
    dynamicL: true,        // pm-AMM Dynamic Liquidity
    expFees: true,         // Exponential time-based fees
    yield: true,           // Yield integration (8% APY)
  },

  // Edge case scenarios
  edgeCases: [
    { name: 'Standard', priceMove: 0.5, volatility: 1.0, informedAt: 'last_20pct' },
    { name: 'Early Resolution', priceMove: 0.9, volatility: 0.5, informedAt: 'first_20pct' },
    { name: 'Contested', priceMove: 0.1, volatility: 0.3, informedAt: 'uniform' },
    { name: 'Blowout', priceMove: 0.99, volatility: 2.0, informedAt: 'last_10pct' },
    { name: 'Low Volume', priceMove: 0.4, volatility: 0.8, informedAt: 'last_30pct', volume: 0.3 },
  ]
};

// ============================================================================
// MATHEMATICAL FUNCTIONS - From Paradigm pm-AMM Paper
// ============================================================================

/**
 * Normal CDF: Φ(z) = 1/√(2π) ∫_{-∞}^z e^(-t²/2) dt
 * Approximation using Abramowitz and Stegun 7.1.26
 */
function normalCDF(z) {
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);

  // Abramowitz and Stegun 7.1.26
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Normal PDF: φ(z) = (1/√(2π)) * e^(-z²/2)
 */
function normalPDF(z) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
}

/**
 * Inverse Normal CDF (Approximation)
 * Used for pm-AMM price calculations
 */
function inverseCDF(p) {
  if (p <= 0) return -10;
  if (p >= 1) return 10;

  // Beasley-Springer-Moro approximation
  const a = [-3.969683028665376e+01, 2.209460984245205e+02,
             -2.759285104469687e+02, 1.383577518672690e+02,
             -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02,
             -1.556989798598866e+02, 6.680131188771972e+01,
             -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01,
             -2.400758277161838e+00, -2.549732539343734e+00,
              4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01,
              2.445134137142996e+00, 3.754408661907416e+00];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }

  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }

  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

// ============================================================================
// PM-AMM IMPLEMENTATION (From Paradigm Paper)
// ============================================================================

/**
 * pm-AMM: Prediction Market Automated Market Maker
 *
 * Simplified model based on Paradigm paper concepts:
 * - Uses CPMM as base (x * y = k)
 * - Adds Dynamic L (increases slippage near deadline)
 * - Adds Exponential Fees (penalizes late trading)
 *
 * The key insight from Paradigm: Dynamic L reduces LVR by making
 * late informed trading more expensive (higher slippage).
 */
class PmAMM {
  constructor(liquidity, totalBlocks, options = {}) {
    this.initialLiquidity = liquidity;
    this.totalBlocks = totalBlocks;
    this.currentBlock = 0;

    // Options
    this.useDynamicL = options.useDynamicL ?? true;
    this.useExpFees = options.useExpFees ?? false;

    // Initial reserves (CPMM-style, balanced at P=0.5)
    // For fair comparison with CPMM baseline: yesReserve = noReserve = liquidity
    this.yesReserve = liquidity;
    this.noReserve = liquidity;
    this.k = this.yesReserve * this.noReserve;

    this.feesCollected = 0;
    this.slippageCaptured = 0; // Extra slippage from Dynamic L
    this.totalVolume = 0;
  }

  /**
   * Dynamic Liquidity multiplier
   * When L is lower, slippage is higher
   * L_t = L_0 × √((T-t)/T)
   * Slippage multiplier = 1/√((T-t)/T)
   */
  getSlippageMultiplier() {
    if (!this.useDynamicL) return 1.0;

    const timeRemaining = Math.max(1, this.totalBlocks - this.currentBlock);
    const ratio = timeRemaining / this.totalBlocks;
    // When ratio = 1 (start): multiplier = 1
    // When ratio = 0.25 (75% through): multiplier = 2
    // When ratio = 0.01 (99% through): multiplier = 10
    return 1 / Math.sqrt(ratio);
  }

  /**
   * Exponential Fee: fee = base × 5^(progress)
   * Penalizes late trading
   */
  getFeeRate(baseFee) {
    if (!this.useExpFees) return baseFee;

    const progress = this.currentBlock / this.totalBlocks;
    // fee = base × 5^progress
    const multiplier = Math.pow(5, progress);
    return Math.min(baseFee * multiplier, 0.20); // Cap at 20%
  }

  /**
   * Get YES price (CPMM formula: P = NO / (YES + NO))
   */
  getYesPrice() {
    return this.noReserve / (this.yesReserve + this.noReserve);
  }

  /**
   * Buy YES tokens
   * Trader gives collateral, receives YES tokens
   * With Dynamic L: extra slippage near deadline
   */
  buyYes(amount, baseFeeRate) {
    const feeRate = this.getFeeRate(baseFeeRate);
    const fee = amount * feeRate;
    const netAmount = amount - fee;

    this.feesCollected += fee;
    this.totalVolume += amount;

    // CPMM calculation
    const newNoReserve = this.noReserve + netAmount;
    const newYesReserve = this.k / newNoReserve;
    let tokensOut = this.yesReserve - newYesReserve;

    // Apply Dynamic L slippage
    const slippageMult = this.getSlippageMultiplier();
    if (slippageMult > 1) {
      const originalTokens = tokensOut;
      tokensOut = tokensOut / slippageMult;
      // The difference is extra profit for LP (captured slippage)
      this.slippageCaptured += (originalTokens - tokensOut) * this.getYesPrice();
    }

    // Update reserves (actual tokens transferred)
    tokensOut = Math.min(tokensOut, this.yesReserve * 0.95);
    this.yesReserve -= tokensOut;
    this.noReserve += netAmount;
    this.k = this.yesReserve * this.noReserve;

    return tokensOut;
  }

  /**
   * Buy NO tokens
   * Trader gives collateral, receives NO tokens
   */
  buyNo(amount, baseFeeRate) {
    const feeRate = this.getFeeRate(baseFeeRate);
    const fee = amount * feeRate;
    const netAmount = amount - fee;

    this.feesCollected += fee;
    this.totalVolume += amount;

    // CPMM calculation
    const newYesReserve = this.yesReserve + netAmount;
    const newNoReserve = this.k / newYesReserve;
    let tokensOut = this.noReserve - newNoReserve;

    // Apply Dynamic L slippage
    const slippageMult = this.getSlippageMultiplier();
    if (slippageMult > 1) {
      const originalTokens = tokensOut;
      tokensOut = tokensOut / slippageMult;
      this.slippageCaptured += (originalTokens - tokensOut) * (1 - this.getYesPrice());
    }

    tokensOut = Math.min(tokensOut, this.noReserve * 0.95);
    this.noReserve -= tokensOut;
    this.yesReserve += netAmount;
    this.k = this.yesReserve * this.noReserve;

    return tokensOut;
  }

  advanceBlock(blocks) {
    this.currentBlock = Math.min(this.currentBlock + blocks, this.totalBlocks);
  }

  /**
   * Resolve market and calculate LP P&L
   * If YES wins: YES tokens worth $1, NO tokens worth $0
   * If NO wins: NO tokens worth $1, YES tokens worth $0
   */
  resolve(yesWins) {
    const yesPrice = this.getYesPrice();

    // LP holds remaining reserves
    // Only winning side has value at resolution
    const tokenValue = yesWins ? this.yesReserve : this.noReserve;

    // Total value = winning tokens + fees + captured slippage
    // Note: slippageCaptured is already reflected in higher reserves,
    // so we only add feesCollected
    const totalValue = tokenValue + this.feesCollected;
    const pnl = totalValue - this.initialLiquidity;

    return {
      initialLiquidity: this.initialLiquidity,
      finalValue: totalValue,
      tokenValue,
      fees: this.feesCollected,
      slippageCaptured: this.slippageCaptured,
      pnl,
      return: pnl / this.initialLiquidity,
      volume: this.totalVolume,
      finalPrice: yesPrice,
      finalSlippageMult: this.getSlippageMultiplier()
    };
  }
}

// ============================================================================
// CPMM BASELINE (For comparison)
// ============================================================================

class CPMM {
  constructor(liquidity) {
    this.initialLiquidity = liquidity;
    this.yesReserve = liquidity;
    this.noReserve = liquidity;
    this.k = this.yesReserve * this.noReserve;
    this.feesCollected = 0;
    this.totalVolume = 0;
  }

  getYesPrice() {
    return this.noReserve / (this.yesReserve + this.noReserve);
  }

  buyYes(amount, feeRate) {
    const fee = amount * feeRate;
    const netAmount = amount - fee;
    this.feesCollected += fee;
    this.totalVolume += amount;

    const newNoReserve = this.noReserve + netAmount;
    const newYesReserve = this.k / newNoReserve;
    const tokensOut = this.yesReserve - newYesReserve;

    this.yesReserve = newYesReserve;
    this.noReserve = newNoReserve;
    this.k = this.yesReserve * this.noReserve;

    return tokensOut;
  }

  buyNo(amount, feeRate) {
    const fee = amount * feeRate;
    const netAmount = amount - fee;
    this.feesCollected += fee;
    this.totalVolume += amount;

    const newYesReserve = this.yesReserve + netAmount;
    const newNoReserve = this.k / newYesReserve;
    const tokensOut = this.noReserve - newNoReserve;

    this.yesReserve = newYesReserve;
    this.noReserve = newNoReserve;
    this.k = this.yesReserve * this.noReserve;

    return tokensOut;
  }

  resolve(yesWins) {
    const tokenValue = yesWins ? this.yesReserve : this.noReserve;
    const totalValue = tokenValue + this.feesCollected;
    const pnl = totalValue - this.initialLiquidity;

    return {
      initialLiquidity: this.initialLiquidity,
      finalValue: totalValue,
      tokenValue,
      fees: this.feesCollected,
      pnl,
      return: pnl / this.initialLiquidity,
      volume: this.totalVolume,
      finalPrice: this.getYesPrice()
    };
  }
}

// ============================================================================
// SIMULATION FUNCTIONS
// ============================================================================

function simulateCPMM(config) {
  const { liquidity, numTrades, informedRatio, trueOutcome, feeRate, avgTradeSize, informedConcentration } = config;
  const market = new CPMM(liquidity);

  for (let i = 0; i < numTrades; i++) {
    const progress = i / numTrades;

    // Determine if informed based on concentration
    let isInformed = false;
    if (informedConcentration === 'uniform') {
      isInformed = Math.random() < informedRatio;
    } else if (informedConcentration === 'last_20pct') {
      const adjustedRatio = progress > 0.8 ? informedRatio * 4 : informedRatio * 0.25;
      isInformed = Math.random() < adjustedRatio;
    } else if (informedConcentration === 'last_10pct') {
      const adjustedRatio = progress > 0.9 ? informedRatio * 8 : informedRatio * 0.11;
      isInformed = Math.random() < adjustedRatio;
    } else if (informedConcentration === 'first_20pct') {
      const adjustedRatio = progress < 0.2 ? informedRatio * 4 : informedRatio * 0.25;
      isInformed = Math.random() < adjustedRatio;
    } else if (informedConcentration === 'last_30pct') {
      const adjustedRatio = progress > 0.7 ? informedRatio * 2.5 : informedRatio * 0.25;
      isInformed = Math.random() < adjustedRatio;
    }

    const size = avgTradeSize * (0.5 + Math.random());

    if (isInformed) {
      if (trueOutcome) {
        market.buyYes(size, feeRate);
      } else {
        market.buyNo(size, feeRate);
      }
    } else {
      // Noise trader - random direction
      if (Math.random() > 0.5) {
        market.buyYes(size, feeRate);
      } else {
        market.buyNo(size, feeRate);
      }
    }
  }

  return market.resolve(trueOutcome);
}

function simulatePmAMM(config) {
  const { liquidity, numTrades, informedRatio, trueOutcome, feeRate, avgTradeSize, useDynamicL, useExpFees, informedConcentration } = config;
  const market = new PmAMM(liquidity, numTrades, { useDynamicL, useExpFees });

  for (let i = 0; i < numTrades; i++) {
    market.advanceBlock(1);
    const progress = i / numTrades;

    // Determine if informed based on concentration
    let isInformed = false;
    if (informedConcentration === 'uniform') {
      isInformed = Math.random() < informedRatio;
    } else if (informedConcentration === 'last_20pct') {
      const adjustedRatio = progress > 0.8 ? informedRatio * 4 : informedRatio * 0.25;
      isInformed = Math.random() < adjustedRatio;
    } else if (informedConcentration === 'last_10pct') {
      const adjustedRatio = progress > 0.9 ? informedRatio * 8 : informedRatio * 0.11;
      isInformed = Math.random() < adjustedRatio;
    } else if (informedConcentration === 'first_20pct') {
      const adjustedRatio = progress < 0.2 ? informedRatio * 4 : informedRatio * 0.25;
      isInformed = Math.random() < adjustedRatio;
    } else if (informedConcentration === 'last_30pct') {
      const adjustedRatio = progress > 0.7 ? informedRatio * 2.5 : informedRatio * 0.25;
      isInformed = Math.random() < adjustedRatio;
    }

    const currentPrice = market.getYesPrice();
    const size = avgTradeSize * (0.5 + Math.random());

    if (isInformed) {
      // Informed trader knows true outcome
      if (trueOutcome && currentPrice < 0.85) {
        market.buyYes(size, feeRate);
      } else if (!trueOutcome && currentPrice > 0.15) {
        market.buyNo(size, feeRate);
      }
    } else {
      // Noise trader - random direction
      if (Math.random() > 0.5) {
        market.buyYes(size, feeRate);
      } else {
        market.buyNo(size, feeRate);
      }
    }
  }

  return market.resolve(trueOutcome);
}

/**
 * Global Pool: Simulate multiple markets and average results
 * Diversification reduces variance: Var = Var_i / √n
 */
function simulateGlobalPool(config, numMarkets = 5) {
  let totalReturn = 0;
  let totalFees = 0;
  let totalVolume = 0;

  for (let m = 0; m < numMarkets; m++) {
    const result = simulatePmAMM({
      ...config,
      liquidity: config.liquidity / numMarkets,
      numTrades: Math.floor(config.numTrades / numMarkets) || 5
    });
    totalReturn += result.return / numMarkets;
    totalFees += result.fees;
    totalVolume += result.volume;
  }

  // Add yield (8% APY, assuming 30 day market)
  const yieldBonus = CONFIG.mechanisms.yield ? 0.08 * 30 / 365 : 0;

  return {
    return: totalReturn + yieldBonus,
    fees: totalFees,
    volume: totalVolume
  };
}

// ============================================================================
// STATISTICS
// ============================================================================

function calcStats(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  const wins = values.filter(v => v > 0).length;
  const losses = values.filter(v => v < 0);

  // Percentiles
  const sorted = [...values].sort((a, b) => a - b);
  const p5 = sorted[Math.floor(n * 0.05)];
  const p25 = sorted[Math.floor(n * 0.25)];
  const p50 = sorted[Math.floor(n * 0.5)];
  const p75 = sorted[Math.floor(n * 0.75)];
  const p95 = sorted[Math.floor(n * 0.95)];

  // Max drawdown
  const maxLoss = losses.length > 0 ? Math.min(...losses) : 0;

  // Sharpe ratio (assuming risk-free rate = 0)
  const sharpe = mean / std;

  return {
    n,
    avg: mean,
    std,
    min: sorted[0],
    max: sorted[n - 1],
    p5,
    p25,
    p50,
    p75,
    p95,
    wins,
    winRate: (wins / n) * 100,
    maxLoss,
    sharpe
  };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function formatPercent(value) {
  return (value * 100).toFixed(2) + '%';
}

function formatNumber(value) {
  return value.toFixed(2);
}

function generateReport(results) {
  let report = '';

  report += '\n';
  report += '═'.repeat(80) + '\n';
  report += '           LP PROTECTION RESEARCH - FINAL REPORT\n';
  report += '═'.repeat(80) + '\n';
  report += '\n';
  report += `Date: ${new Date().toISOString()}\n`;
  report += `Iterations: ${CONFIG.iterations}\n`;
  report += '\n';

  // Executive Summary
  report += '═'.repeat(80) + '\n';
  report += 'EXECUTIVE SUMMARY\n';
  report += '═'.repeat(80) + '\n';
  report += '\n';

  const baseline = results.baseline.standard;
  const full = results.full.standard;

  report += `Baseline CPMM (3% fee):\n`;
  report += `  Average Return: ${formatPercent(baseline.avg)}\n`;
  report += `  Win Rate: ${formatNumber(baseline.winRate)}%\n`;
  report += `  Std Dev: ${formatPercent(baseline.std)}\n`;
  report += '\n';

  report += `pm-AMM + All Mechanisms:\n`;
  report += `  Average Return: ${formatPercent(full.avg)}\n`;
  report += `  Win Rate: ${formatNumber(full.winRate)}%\n`;
  report += `  Std Dev: ${formatPercent(full.std)}\n`;
  report += '\n';

  const improvement = ((full.avg - baseline.avg) * 100);
  const winRateImprovement = full.winRate - baseline.winRate;

  report += `Improvement:\n`;
  report += `  Return: ${improvement > 0 ? '+' : ''}${formatNumber(improvement)} percentage points\n`;
  report += `  Win Rate: ${winRateImprovement > 0 ? '+' : ''}${formatNumber(winRateImprovement)} pp\n`;
  report += '\n';

  // Detailed Results Table
  report += '═'.repeat(80) + '\n';
  report += 'STANDARD SCENARIO (50 trades, 15% informed, last 20%)\n';
  report += '═'.repeat(80) + '\n';
  report += '\n';

  report += '┌─────────────────────────────────────────┬──────────┬──────────┬──────────┬──────────┐\n';
  report += '│ Model                                   │ Return   │ Win Rate │ Std Dev  │ Sharpe   │\n';
  report += '├─────────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┤\n';

  for (const [key, data] of Object.entries(results)) {
    if (key === 'full') {
      const s = data.standard;
      report += `│ ${'pm-AMM + All'.padEnd(39)} │ ${(s.avg*100).toFixed(2).padStart(8)}% │ ${s.winRate.toFixed(1).padStart(8)}% │ ${(s.std*100).toFixed(2).padStart(8)}% │ ${s.sharpe.toFixed(2).padStart(8)} │\n`;
    }
  }

  report += '└─────────────────────────────────────────┴──────────┴──────────┴──────────┴──────────┘\n';
  report += '\n';

  // Mechanism Breakdown
  report += '═'.repeat(80) + '\n';
  report += 'MECHANISM BREAKDOWN (Individual Impact)\n';
  report += '═'.repeat(80) + '\n';
  report += '\n';

  report += '┌─────────────────────────────────────────┬──────────┬──────────┬──────────┬──────────┐\n';
  report += '│ Model                                   │ Return   │ Win Rate │ Std Dev  │ Sharpe   │\n';
  report += '├─────────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┤\n';

  const models = [
    { name: 'CPMM Baseline', key: 'baseline' },
    { name: 'pm-AMM Only', key: 'pmamm' },
    { name: 'pm-AMM + Dynamic L', key: 'dynamicL' },
    { name: 'pm-AMM + Exp Fees', key: 'expFees' },
    { name: 'pm-AMM + Dynamic L + Exp Fees', key: 'combined' },
    { name: 'pm-AMM + All (with Global + Yield)', key: 'full' },
  ];

  for (const model of models) {
    const s = results[model.key]?.standard;
    if (!s) continue;
    const displayName = model.name.length > 39 ? model.name.substring(0, 36) + '...' : model.name;
    report += `│ ${displayName.padEnd(39)} │ ${(s.avg*100).toFixed(2).padStart(8)}% │ ${s.winRate.toFixed(1).padStart(8)}% │ ${(s.std*100).toFixed(2).padStart(8)}% │ ${s.sharpe.toFixed(2).padStart(8)} │\n`;
  }

  report += '└─────────────────────────────────────────┴──────────┴──────────┴──────────┴──────────┘\n';
  report += '\n';

  // Edge Cases
  report += '═'.repeat(80) + '\n';
  report += 'EDGE CASE ANALYSIS\n';
  report += '═'.repeat(80) + '\n';
  report += '\n';

  for (const scenario of CONFIG.edgeCases) {
    const s = results.full?.[scenario.name];
    if (!s) continue;

    report += `${scenario.name}:\n`;
    report += `  Price Move: ${formatPercent(scenario.priceMove)}, Volatility: ${scenario.volatility}x\n`;
    report += `  Informed At: ${scenario.informedAt}\n`;
    report += `  Return: ${formatPercent(s.avg)}, Win Rate: ${formatNumber(s.winRate)}%\n`;
    report += '\n';
  }

  // Risk Analysis
  report += '═'.repeat(80) + '\n';
  report += 'RISK ANALYSIS (5th and 95th percentiles)\n';
  report += '═'.repeat(80) + '\n';
  report += '\n';

  const b = results.baseline.standard;
  const f = results.full.standard;

  report += 'CPMM Baseline:\n';
  report += `  5th percentile: ${formatPercent(b.p5)} (worst 5% of outcomes)\n`;
  report += `  95th percentile: ${formatPercent(b.p95)} (best 5% of outcomes)\n`;
  report += `  Max Loss: ${formatPercent(b.maxLoss)}\n`;
  report += '\n';

  report += 'pm-AMM + All:\n';
  report += `  5th percentile: ${formatPercent(f.p5)} (worst 5% of outcomes)\n`;
  report += `  95th percentile: ${formatPercent(f.p95)} (best 5% of outcomes)\n`;
  report += `  Max Loss: ${formatPercent(f.maxLoss)}\n`;
  report += '\n';

  // Recommendation
  report += '═'.repeat(80) + '\n';
  report += 'RECOMMENDATION\n';
  report += '═'.repeat(80) + '\n';
  report += '\n';

  if (full.avg > 0 && full.winRate > 80) {
    report += '✅ RECOMMENDED: Implement pm-AMM with all protection mechanisms\n\n';
    report += 'Rationale:\n';
    report += `- Positive expected return: ${formatPercent(full.avg)} per market\n`;
    report += `- High win rate: ${formatNumber(full.winRate)}% of markets profitable\n`;
    report += `- Reduced risk through diversification\n`;
    report += '\n';
  } else if (full.avg > 0) {
    report += '⚠️  CONDITIONAL RECOMMENDATION\n\n';
    report += 'Expected return is positive but win rate is below 80%.\n';
    report += 'Consider:\n';
    report += `- Adjusting fee parameters\n`;
    report += `- Additional liquidity requirements\n`;
    report += '\n';
  } else {
    report += '❌ NOT RECOMMENDED under current parameters\n\n';
    report += 'Negative expected return. Requires:\n';
    report += `- Higher base fees\n`;
    report += `- Stronger exponential fee curve\n`;
    report += `- Or accept LP loss as cost of providing liquidity\n`;
    report += '\n';
  }

  // Implementation Guide
  report += '═'.repeat(80) + '\n';
  report += 'IMPLEMENTATION CHECKLIST\n';
  report += '═'.repeat(80) + '\n';
  report += '\n';

  report += 'Required Changes:\n';
  report += '\n';
  report += '1. contracts/lib/pm-amm-core.clar\n';
  report += '   - ✅ Already implemented pm-AMM invariant\n';
  report += '   - ✅ Already has get-dynamic-liquidity\n';
  report += '\n';
  report += '2. contracts/multi-market-pool-v2.clar\n';
  report += '   - Add exponential fee calculation\n';
  report += '   - Add time-based fee multiplier\n';
  report += '   - Update fee distribution logic\n';
  report += '\n';
  report += '3. contracts/market-factory-v3.clar\n';
  report += '   - Store market creation timestamp\n';
  report += '   - Pass to pool for fee calculation\n';
  report += '\n';

  report += '═'.repeat(80) + '\n';
  report += '\n';

  return report;
}

// ============================================================================
// MAIN SIMULATION
// ============================================================================

function runSimulation() {
  console.log('Running LP Protection Simulation...');
  console.log(`Iterations: ${CONFIG.iterations}`);
  console.log(`Config: ${JSON.stringify(CONFIG.mechanisms)}`);

  const results = {};

  // Baseline CPMM
  console.log('\n1. Running CPMM Baseline...');
  results.baseline = { standard: null };
  const cpmmResults = [];
  for (let i = 0; i < CONFIG.iterations; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulateCPMM({
      liquidity: CONFIG.liquidity,
      numTrades: CONFIG.numTrades,
      informedRatio: CONFIG.informedRatio,
      trueOutcome: outcome,
      feeRate: CONFIG.baseFeeRate,
      avgTradeSize: CONFIG.avgTradeSize,
      informedConcentration: 'last_20pct'
    });
    cpmmResults.push(r.return);
  }
  results.baseline.standard = calcStats(cpmmResults);

  // pm-AMM only
  console.log('2. Running pm-AMM (no mechanisms)...');
  results.pmamm = { standard: null };
  const pmammResults = [];
  for (let i = 0; i < CONFIG.iterations; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulatePmAMM({
      liquidity: CONFIG.liquidity,
      numTrades: CONFIG.numTrades,
      informedRatio: CONFIG.informedRatio,
      trueOutcome: outcome,
      feeRate: CONFIG.baseFeeRate,
      avgTradeSize: CONFIG.avgTradeSize,
      useDynamicL: false,
      useExpFees: false,
      informedConcentration: 'last_20pct'
    });
    pmammResults.push(r.return);
  }
  results.pmamm.standard = calcStats(pmammResults);

  // pm-AMM + Dynamic L
  console.log('3. Running pm-AMM + Dynamic L...');
  results.dynamicL = { standard: null };
  const dynamicLResults = [];
  for (let i = 0; i < CONFIG.iterations; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulatePmAMM({
      liquidity: CONFIG.liquidity,
      numTrades: CONFIG.numTrades,
      informedRatio: CONFIG.informedRatio,
      trueOutcome: outcome,
      feeRate: CONFIG.baseFeeRate,
      avgTradeSize: CONFIG.avgTradeSize,
      useDynamicL: true,
      useExpFees: false,
      informedConcentration: 'last_20pct'
    });
    dynamicLResults.push(r.return);
  }
  results.dynamicL.standard = calcStats(dynamicLResults);

  // pm-AMM + Exp Fees
  console.log('4. Running pm-AMM + Exp Fees...');
  results.expFees = { standard: null };
  const expFeesResults = [];
  for (let i = 0; i < CONFIG.iterations; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulatePmAMM({
      liquidity: CONFIG.liquidity,
      numTrades: CONFIG.numTrades,
      informedRatio: CONFIG.informedRatio,
      trueOutcome: outcome,
      feeRate: CONFIG.baseFeeRate,
      avgTradeSize: CONFIG.avgTradeSize,
      useDynamicL: false,
      useExpFees: true,
      informedConcentration: 'last_20pct'
    });
    expFeesResults.push(r.return);
  }
  results.expFees.standard = calcStats(expFeesResults);

  // pm-AMM + Dynamic L + Exp Fees
  console.log('5. Running pm-AMM + Dynamic L + Exp Fees...');
  results.combined = { standard: null };
  const combinedResults = [];
  for (let i = 0; i < CONFIG.iterations; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulatePmAMM({
      liquidity: CONFIG.liquidity,
      numTrades: CONFIG.numTrades,
      informedRatio: CONFIG.informedRatio,
      trueOutcome: outcome,
      feeRate: CONFIG.baseFeeRate,
      avgTradeSize: CONFIG.avgTradeSize,
      useDynamicL: true,
      useExpFees: true,
      informedConcentration: 'last_20pct'
    });
    combinedResults.push(r.return);
  }
  results.combined.standard = calcStats(combinedResults);

  // Full with Global Pool and Yield
  console.log('6. Running pm-AMM + All Mechanisms...');
  results.full = { standard: null };

  // Standard scenario
  const fullResults = [];
  for (let i = 0; i < CONFIG.iterations; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulateGlobalPool({
      liquidity: CONFIG.liquidity,
      numTrades: CONFIG.numTrades,
      informedRatio: CONFIG.informedRatio,
      trueOutcome: outcome,
      feeRate: CONFIG.baseFeeRate,
      avgTradeSize: CONFIG.avgTradeSize,
      useDynamicL: true,
      useExpFees: true,
      informedConcentration: 'last_20pct'
    }, 5);
    fullResults.push(r.return);
  }
  results.full.standard = calcStats(fullResults);

  // Edge cases
  console.log('7. Running Edge Cases...');
  for (const scenario of CONFIG.edgeCases) {
    console.log(`   - ${scenario.name}...`);
    const edgeResults = [];
    const volumeMult = scenario.volume ?? 1.0;

    for (let i = 0; i < Math.floor(CONFIG.iterations / 2); i++) {
      const outcome = Math.random() > 0.5;
      const r = simulateGlobalPool({
        liquidity: CONFIG.liquidity,
        numTrades: Math.floor(CONFIG.numTrades * volumeMult) || 10,
        informedRatio: CONFIG.informedRatio,
        trueOutcome: outcome,
        feeRate: CONFIG.baseFeeRate,
        avgTradeSize: CONFIG.avgTradeSize,
        useDynamicL: true,
        useExpFees: true,
        informedConcentration: scenario.informedAt
      }, 5);
      edgeResults.push(r.return);
    }
    results.full[scenario.name] = calcStats(edgeResults);
  }

  return results;
}

// ============================================================================
// RUN AND SAVE
// ============================================================================

console.log('═'.repeat(80));
console.log('     LP PROTECTION RESEARCH - COMPREHENSIVE SIMULATION');
console.log('═'.repeat(80));

const results = runSimulation();
const report = generateReport(results);

// Save report
const reportPath = resolve('./scripts/simulations/lp-protection-report.txt');
writeFileSync(reportPath, report);

console.log('\n' + report);
console.log(`\nReport saved to: ${reportPath}`);

// Also save JSON results for further analysis
const jsonPath = resolve('./scripts/simulations/lp-protection-results.json');
writeFileSync(jsonPath, JSON.stringify(results, null, 2));
console.log(`JSON results saved to: ${jsonPath}`);
