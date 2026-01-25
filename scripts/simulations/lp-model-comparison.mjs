/**
 * LP Model Comparison Simulations
 *
 * Compares different LP models for prediction markets:
 * 1. Current model (isolated pools per market)
 * 2. Global shared pool (Thales-style)
 * 3. With skew pricing
 * 4. With dynamic liquidity (pm-AMM)
 * 5. Subsidized creator model
 */

// ============================================================================
// MATHEMATICAL HELPERS
// ============================================================================

// Standard normal PDF: φ(z) = (1/√(2π)) * e^(-z²/2)
function normalPdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF: Φ(z) using approximation
function normalCdf(z) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z);

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z / 2);

  return 0.5 * (1.0 + sign * y);
}

// ============================================================================
// PM-AMM PRICING (Current Model)
// ============================================================================

function pmAmmPrice(yesReserve, noReserve, L) {
  const z = (noReserve - yesReserve) / L;
  return normalCdf(z);
}

function pmAmmInvariant(x, y, L) {
  const z = (y - x) / L;
  return (y - x) * normalCdf(z) + L * normalPdf(z) - y;
}

// Calculate tokens out for a buy using pm-AMM
function pmAmmBuy(amountIn, yesReserve, noReserve, L, buyYes) {
  const targetInv = pmAmmInvariant(yesReserve, noReserve, L);

  // Binary search for tokens out
  let low = 0;
  let high = buyYes ? yesReserve : noReserve;

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const newX = buyYes ? yesReserve - mid : yesReserve + amountIn;
    const newY = buyYes ? noReserve + amountIn : noReserve - mid;
    const newInv = pmAmmInvariant(newX, newY, L);

    if (newInv > targetInv) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return (low + high) / 2;
}

// ============================================================================
// MODEL 1: ISOLATED POOLS (Current)
// ============================================================================

class IsolatedPoolMarket {
  constructor(initialLiquidity, marketId) {
    this.marketId = marketId;
    this.yesReserve = initialLiquidity / 2;
    this.noReserve = initialLiquidity / 2;
    this.L = initialLiquidity;
    this.lpDeposit = initialLiquidity;
    this.totalFees = 0;
    this.feeRate = 0.02; // 2% fee
  }

  getPrice() {
    return pmAmmPrice(this.yesReserve, this.noReserve, this.L);
  }

  buy(amount, buyYes) {
    const fee = amount * this.feeRate;
    const amountAfterFee = amount - fee;
    this.totalFees += fee;

    const tokensOut = pmAmmBuy(amountAfterFee, this.yesReserve, this.noReserve, this.L, buyYes);

    if (buyYes) {
      this.yesReserve -= tokensOut;
      this.noReserve += amountAfterFee;
    } else {
      this.noReserve -= tokensOut;
      this.yesReserve += amountAfterFee;
    }

    return tokensOut;
  }

  resolve(yesWins) {
    // LP value after resolution
    // If YES wins: LP has noReserve (worthless) + yesReserve worth $1 each
    // But users claimed their YES tokens, so LP has what's left
    const lpValue = yesWins ? this.yesReserve : this.noReserve;
    return {
      lpValue,
      fees: this.totalFees,
      lpPnL: lpValue + this.totalFees - this.lpDeposit,
      lpPnLPercent: ((lpValue + this.totalFees - this.lpDeposit) / this.lpDeposit) * 100
    };
  }
}

// ============================================================================
// MODEL 2: GLOBAL SHARED POOL (Thales-style)
// ============================================================================

class GlobalPoolMarket {
  constructor(marketId, globalPool) {
    this.marketId = marketId;
    this.globalPool = globalPool;
    this.yesReserve = 0;
    this.noReserve = 0;
    this.yesExposure = 0; // Total YES tokens sold
    this.noExposure = 0;  // Total NO tokens sold
    this.riskCap = globalPool.totalLiquidity * 0.1; // 10% max exposure per market
  }

  getPrice() {
    // Base price from exposure ratio
    const totalExposure = this.yesExposure + this.noExposure + 1;
    let basePrice = 0.5;

    if (totalExposure > 1) {
      basePrice = 0.5 + (this.noExposure - this.yesExposure) / (totalExposure * 4);
    }

    return Math.max(0.05, Math.min(0.95, basePrice));
  }

  getSkewedPrice(buyYes) {
    const basePrice = this.getPrice();
    const imbalance = Math.abs(this.yesExposure - this.noExposure);
    const skewFactor = imbalance / (this.riskCap + 1);

    // Skew makes overbought side more expensive
    if (buyYes && this.yesExposure > this.noExposure) {
      return Math.min(0.95, basePrice + skewFactor * 0.1);
    } else if (!buyYes && this.noExposure > this.yesExposure) {
      return Math.min(0.95, (1 - basePrice) + skewFactor * 0.1);
    }

    return buyYes ? basePrice : (1 - basePrice);
  }

  buy(amount, buyYes) {
    const price = this.getSkewedPrice(buyYes);
    const fee = amount * 0.02;
    const amountAfterFee = amount - fee;

    // Check risk cap
    const newExposure = buyYes ? this.yesExposure + amountAfterFee : this.noExposure + amountAfterFee;
    if (newExposure > this.riskCap) {
      return 0; // Reject trade
    }

    const tokensOut = amountAfterFee / price;

    if (buyYes) {
      this.yesExposure += amountAfterFee;
    } else {
      this.noExposure += amountAfterFee;
    }

    this.globalPool.addFees(fee);
    this.globalPool.addExposure(this.marketId, buyYes, amountAfterFee);

    return tokensOut;
  }

  resolve(yesWins) {
    // Calculate P&L for this market
    const pnl = yesWins
      ? this.noExposure - this.yesExposure  // Pool wins NO bets, loses YES bets
      : this.yesExposure - this.noExposure;

    return {
      marketPnL: pnl,
      yesExposure: this.yesExposure,
      noExposure: this.noExposure
    };
  }
}

class GlobalPool {
  constructor(totalLiquidity) {
    this.totalLiquidity = totalLiquidity;
    this.markets = new Map();
    this.totalFees = 0;
    this.exposures = new Map(); // market -> { yes, no }
  }

  createMarket(marketId) {
    const market = new GlobalPoolMarket(marketId, this);
    this.markets.set(marketId, market);
    this.exposures.set(marketId, { yes: 0, no: 0 });
    return market;
  }

  addFees(amount) {
    this.totalFees += amount;
  }

  addExposure(marketId, buyYes, amount) {
    const exp = this.exposures.get(marketId);
    if (buyYes) {
      exp.yes += amount;
    } else {
      exp.no += amount;
    }
  }

  resolveAll(outcomes) {
    // outcomes: Map<marketId, boolean (yesWins)>
    let totalPnL = 0;
    const results = [];

    for (const [marketId, yesWins] of outcomes) {
      const market = this.markets.get(marketId);
      if (market) {
        const result = market.resolve(yesWins);
        totalPnL += result.marketPnL;
        results.push({ marketId, ...result });
      }
    }

    return {
      totalPnL,
      fees: this.totalFees,
      netPnL: totalPnL + this.totalFees,
      lpReturn: ((totalPnL + this.totalFees) / this.totalLiquidity) * 100,
      marketResults: results
    };
  }
}

// ============================================================================
// MODEL 3: SUBSIDIZED CREATOR
// ============================================================================

class SubsidizedMarket {
  constructor(creatorSubsidy, marketId) {
    this.marketId = marketId;
    this.subsidy = creatorSubsidy;
    this.yesReserve = creatorSubsidy / 2;
    this.noReserve = creatorSubsidy / 2;
    this.L = creatorSubsidy;
    this.protocolFees = 0;
    this.feeRate = 0.03; // 3% to protocol
  }

  getPrice() {
    return pmAmmPrice(this.yesReserve, this.noReserve, this.L);
  }

  buy(amount, buyYes) {
    const fee = amount * this.feeRate;
    const amountAfterFee = amount - fee;
    this.protocolFees += fee; // All fees go to protocol

    const tokensOut = pmAmmBuy(amountAfterFee, this.yesReserve, this.noReserve, this.L, buyYes);

    if (buyYes) {
      this.yesReserve -= tokensOut;
      this.noReserve += amountAfterFee;
    } else {
      this.noReserve -= tokensOut;
      this.yesReserve += amountAfterFee;
    }

    return tokensOut;
  }

  resolve(yesWins) {
    // Creator's remaining value
    const creatorValue = yesWins ? this.yesReserve : this.noReserve;
    return {
      creatorValue,
      creatorLoss: this.subsidy - creatorValue,
      creatorLossPercent: ((this.subsidy - creatorValue) / this.subsidy) * 100,
      protocolFees: this.protocolFees,
      maxLoss: this.subsidy // Bounded!
    };
  }
}

// ============================================================================
// SIMULATION SCENARIOS
// ============================================================================

function runScenario(name, trades, finalOutcome) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCENARIO: ${name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Trades: ${trades.length}, Final outcome: ${finalOutcome ? 'YES wins' : 'NO wins'}`);

  // Model 1: Isolated Pool
  const isolated = new IsolatedPoolMarket(1000, 1);

  // Model 2: Global Pool (simulating 5 markets)
  const global = new GlobalPool(5000);
  const globalMarket = global.createMarket(1);
  // Create other markets for diversification
  for (let i = 2; i <= 5; i++) {
    global.createMarket(i);
  }

  // Model 3: Subsidized Creator
  const subsidized = new SubsidizedMarket(1000, 1);

  // Execute trades
  for (const trade of trades) {
    isolated.buy(trade.amount, trade.buyYes);
    globalMarket.buy(trade.amount, trade.buyYes);
    subsidized.buy(trade.amount, trade.buyYes);
  }

  // Print prices after trading
  console.log(`\nPrices after trading:`);
  console.log(`  Isolated: YES=${(isolated.getPrice() * 100).toFixed(1)}%`);
  console.log(`  Global:   YES=${(globalMarket.getPrice() * 100).toFixed(1)}%`);
  console.log(`  Subsid:   YES=${(subsidized.getPrice() * 100).toFixed(1)}%`);

  // Resolve
  const isolatedResult = isolated.resolve(finalOutcome);

  // For global pool, simulate other markets with random outcomes
  const outcomes = new Map();
  outcomes.set(1, finalOutcome);
  outcomes.set(2, Math.random() > 0.5);
  outcomes.set(3, Math.random() > 0.5);
  outcomes.set(4, Math.random() > 0.5);
  outcomes.set(5, Math.random() > 0.5);
  const globalResult = global.resolveAll(outcomes);

  const subsidizedResult = subsidized.resolve(finalOutcome);

  // Print results
  console.log(`\n--- ISOLATED POOL (Current Model) ---`);
  console.log(`  LP Value after resolution: $${isolatedResult.lpValue.toFixed(2)}`);
  console.log(`  Fees earned: $${isolatedResult.fees.toFixed(2)}`);
  console.log(`  LP P&L: $${isolatedResult.lpPnL.toFixed(2)} (${isolatedResult.lpPnLPercent.toFixed(1)}%)`);

  console.log(`\n--- GLOBAL SHARED POOL (Thales-style) ---`);
  console.log(`  Market 1 P&L: $${globalResult.marketResults[0]?.marketPnL.toFixed(2) || 0}`);
  console.log(`  Total Pool P&L (all markets): $${globalResult.totalPnL.toFixed(2)}`);
  console.log(`  Total fees: $${globalResult.fees.toFixed(2)}`);
  console.log(`  Net LP Return: ${globalResult.lpReturn.toFixed(2)}%`);

  console.log(`\n--- SUBSIDIZED CREATOR ---`);
  console.log(`  Creator subsidy (initial): $${subsidizedResult.maxLoss.toFixed(2)}`);
  console.log(`  Creator remaining value: $${subsidizedResult.creatorValue.toFixed(2)}`);
  console.log(`  Creator loss: $${subsidizedResult.creatorLoss.toFixed(2)} (${subsidizedResult.creatorLossPercent.toFixed(1)}%)`);
  console.log(`  Protocol fees earned: $${subsidizedResult.protocolFees.toFixed(2)}`);
  console.log(`  Max possible loss: $${subsidizedResult.maxLoss.toFixed(2)} (BOUNDED)`);

  return { isolatedResult, globalResult, subsidizedResult };
}

// ============================================================================
// RUN SIMULATIONS
// ============================================================================

console.log('\n' + '█'.repeat(70));
console.log('LP MODEL COMPARISON - MATHEMATICAL SIMULATIONS');
console.log('█'.repeat(70));

// Scenario 1: Balanced trading (equal YES and NO)
runScenario('Balanced Trading', [
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: false },
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: false },
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: false },
], true);

// Scenario 2: Heavy YES buying (market moves to 70%)
runScenario('Heavy YES Buying (Smart Money Correct)', [
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: true },
  { amount: 50, buyYes: false },
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: true },
], true); // YES wins as predicted

// Scenario 3: Heavy YES buying but NO wins (upset)
runScenario('Heavy YES Buying (Upset - NO wins)', [
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: true },
  { amount: 50, buyYes: false },
  { amount: 100, buyYes: true },
  { amount: 100, buyYes: true },
], false); // NO wins (upset!)

// Scenario 4: Extreme one-sided (90% YES)
runScenario('Extreme One-Sided (90% YES)', [
  { amount: 200, buyYes: true },
  { amount: 200, buyYes: true },
  { amount: 200, buyYes: true },
  { amount: 200, buyYes: true },
  { amount: 100, buyYes: true },
], true);

// Scenario 5: High volume balanced
runScenario('High Volume Balanced', [
  ...Array(20).fill(null).map((_, i) => ({ amount: 50, buyYes: i % 2 === 0 }))
], true);

// ============================================================================
// MONTE CARLO SIMULATION
// ============================================================================

console.log('\n' + '█'.repeat(70));
console.log('MONTE CARLO SIMULATION (1000 markets)');
console.log('█'.repeat(70));

function runMonteCarlo(numMarkets, numTradesPerMarket, correctPredictionRate) {
  let isolatedTotalPnL = 0;
  let subsidizedTotalCreatorLoss = 0;
  let subsidizedTotalProtocolFees = 0;

  const globalPool = new GlobalPool(numMarkets * 1000);

  for (let m = 0; m < numMarkets; m++) {
    const isolated = new IsolatedPoolMarket(1000, m);
    const globalMarket = globalPool.createMarket(m);
    const subsidized = new SubsidizedMarket(1000, m);

    // Generate random trades with bias toward correct outcome
    const yesWins = Math.random() > 0.5;
    const buyYesBias = yesWins ? correctPredictionRate : (1 - correctPredictionRate);

    for (let t = 0; t < numTradesPerMarket; t++) {
      const amount = 20 + Math.random() * 80; // $20-$100 per trade
      const buyYes = Math.random() < buyYesBias;

      isolated.buy(amount, buyYes);
      globalMarket.buy(amount, buyYes);
      subsidized.buy(amount, buyYes);
    }

    const isolatedResult = isolated.resolve(yesWins);
    isolatedTotalPnL += isolatedResult.lpPnL;

    const subsidizedResult = subsidized.resolve(yesWins);
    subsidizedTotalCreatorLoss += subsidizedResult.creatorLoss;
    subsidizedTotalProtocolFees += subsidizedResult.protocolFees;
  }

  // Resolve global pool
  const globalOutcomes = new Map();
  for (let m = 0; m < numMarkets; m++) {
    globalOutcomes.set(m, Math.random() > 0.5);
  }
  const globalResult = globalPool.resolveAll(globalOutcomes);

  return {
    isolated: {
      totalPnL: isolatedTotalPnL,
      avgPnLPerMarket: isolatedTotalPnL / numMarkets,
      avgPnLPercent: (isolatedTotalPnL / (numMarkets * 1000)) * 100
    },
    global: {
      totalPnL: globalResult.netPnL,
      avgPnLPercent: globalResult.lpReturn
    },
    subsidized: {
      totalCreatorLoss: subsidizedTotalCreatorLoss,
      avgCreatorLoss: subsidizedTotalCreatorLoss / numMarkets,
      avgCreatorLossPercent: (subsidizedTotalCreatorLoss / (numMarkets * 1000)) * 100,
      totalProtocolFees: subsidizedTotalProtocolFees,
      avgProtocolFees: subsidizedTotalProtocolFees / numMarkets
    }
  };
}

// Run with different prediction accuracy rates
const scenarios = [
  { name: '50% prediction accuracy (random)', rate: 0.5 },
  { name: '60% prediction accuracy', rate: 0.6 },
  { name: '70% prediction accuracy (informed traders)', rate: 0.7 },
  { name: '80% prediction accuracy (very informed)', rate: 0.8 },
];

for (const scenario of scenarios) {
  console.log(`\n--- ${scenario.name} ---`);
  const results = runMonteCarlo(100, 10, scenario.rate);

  console.log(`\nISOLATED POOLS (100 markets × $1000 each):`);
  console.log(`  Total LP P&L: $${results.isolated.totalPnL.toFixed(2)}`);
  console.log(`  Avg P&L per market: $${results.isolated.avgPnLPerMarket.toFixed(2)}`);
  console.log(`  Avg LP Return: ${results.isolated.avgPnLPercent.toFixed(2)}%`);

  console.log(`\nGLOBAL SHARED POOL ($100,000 total):`);
  console.log(`  Total P&L: $${results.global.totalPnL.toFixed(2)}`);
  console.log(`  LP Return: ${results.global.avgPnLPercent.toFixed(2)}%`);

  console.log(`\nSUBSIDIZED CREATOR (100 markets × $1000 subsidy):`);
  console.log(`  Total creator loss: $${results.subsidized.totalCreatorLoss.toFixed(2)}`);
  console.log(`  Avg creator loss: $${results.subsidized.avgCreatorLoss.toFixed(2)} (${results.subsidized.avgCreatorLossPercent.toFixed(1)}%)`);
  console.log(`  Total protocol fees: $${results.subsidized.totalProtocolFees.toFixed(2)}`);
  console.log(`  Avg protocol fees/market: $${results.subsidized.avgProtocolFees.toFixed(2)}`);
}

// ============================================================================
// SUMMARY & RECOMMENDATIONS
// ============================================================================

console.log('\n' + '█'.repeat(70));
console.log('SUMMARY & RECOMMENDATIONS');
console.log('█'.repeat(70));

console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│                    LP MODEL COMPARISON SUMMARY                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  MODEL 1: ISOLATED POOLS (Current)                                  │
│  ─────────────────────────────────                                  │
│  • LP loses when market moves in one direction                      │
│  • Fees don't compensate for adverse selection                      │
│  • Loss is UNBOUNDED (can lose 100% if extreme movement)            │
│  • Simple to implement ✓                                            │
│  • Misleads LPs into thinking they'll profit ✗                      │
│                                                                      │
│  MODEL 2: GLOBAL SHARED POOL (Thales-style)                         │
│  ───────────────────────────────────────────                        │
│  • Risk distributed across multiple markets                         │
│  • Some markets win, some lose → smoother returns                   │
│  • Requires risk caps per market                                    │
│  • Skew pricing protects against one-sided exposure                 │
│  • More complex to implement ✗                                      │
│  • Still can lose if all markets move same direction                │
│  • Better for professional LPs ✓                                    │
│                                                                      │
│  MODEL 3: SUBSIDIZED CREATOR                                        │
│  ───────────────────────────────                                    │
│  • Creator pays for market liquidity (subsidy)                      │
│  • Loss is BOUNDED to initial subsidy ✓                             │
│  • Protocol earns fees ✓                                            │
│  • Honest model - no false promises ✓                               │
│  • Simple to implement ✓                                            │
│  • Creator knows max loss upfront ✓                                 │
│  • Aligns incentives: creator wants market to succeed               │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  RECOMMENDATION FOR YOUR PROTOCOL:                                  │
│                                                                      │
│  Option A: SUBSIDIZED CREATOR (Simple, Honest)                      │
│  • Creator deposits liquidity as "cost of market"                   │
│  • No external LPs (avoids false promises)                          │
│  • Protocol takes all fees                                          │
│  • Best for: hackathon, MVP, small markets                          │
│                                                                      │
│  Option B: GLOBAL POOL + SKEW (Scalable)                            │
│  • Single pool serves all markets                                   │
│  • Risk caps limit exposure                                         │
│  • Skew pricing balances demand                                     │
│  • Best for: mainnet, high volume                                   │
│                                                                      │
│  Option C: HYBRID (Best of both)                                    │
│  • Creator subsidizes minimum liquidity                             │
│  • Global pool adds additional liquidity                            │
│  • Risk shared between creator and pool                             │
│  • Best for: medium-term growth                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
`);
