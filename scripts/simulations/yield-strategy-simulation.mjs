/**
 * Yield Strategy Simulation
 *
 * Calculates how much yield can offset LP losses
 * if idle funds are deposited in yield protocols
 */

console.log('█'.repeat(70));
console.log('YIELD STRATEGY SIMULATION');
console.log('█'.repeat(70));

// ============================================================================
// ASSUMPTIONS
// ============================================================================

const scenarios = [
  { name: 'Conservative DeFi Yield', apy: 0.05 },   // 5% APY (stablecoin lending)
  { name: 'Medium DeFi Yield', apy: 0.10 },         // 10% APY (LP farming)
  { name: 'Aggressive DeFi Yield', apy: 0.15 },     // 15% APY (risky vaults)
  { name: 'Stacks sBTC Yield (example)', apy: 0.08 }, // 8% APY
];

const marketDurations = [
  { name: '1 week', days: 7 },
  { name: '1 month', days: 30 },
  { name: '3 months', days: 90 },
  { name: '6 months', days: 180 },
  { name: '1 year', days: 365 },
];

// From previous simulation: average LP loss is ~50% of pool
const avgLpLossPercent = 0.50;

// ============================================================================
// CALCULATIONS
// ============================================================================

console.log('\n--- YIELD VS LP LOSS ANALYSIS ---\n');
console.log('Assumption: Average LP loss = 50% of pool value');
console.log('Question: Can yield offset this loss?\n');

console.log('┌────────────────────┬─────────┬─────────┬─────────┬─────────┬─────────┐');
console.log('│ Yield Rate         │ 1 week  │ 1 month │ 3 months│ 6 months│ 1 year  │');
console.log('├────────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤');

for (const scenario of scenarios) {
  const row = [scenario.name.padEnd(18)];

  for (const duration of marketDurations) {
    // Calculate yield for this duration
    const yieldPercent = (scenario.apy * duration.days / 365) * 100;
    row.push(yieldPercent.toFixed(2).padStart(6) + '%');
  }

  console.log(`│ ${row.join(' │ ')} │`);
}

console.log('└────────────────────┴─────────┴─────────┴─────────┴─────────┴─────────┘');

console.log('\n--- BREAK-EVEN ANALYSIS ---\n');
console.log('To offset 50% LP loss, you need:');

for (const scenario of scenarios) {
  // How many days to earn 50% yield?
  const daysToBreakeven = (avgLpLossPercent / scenario.apy) * 365;
  console.log(`  ${scenario.name}: ${daysToBreakeven.toFixed(0)} days (${(daysToBreakeven/365).toFixed(1)} years)`);
}

// ============================================================================
// REALISTIC SCENARIO
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('REALISTIC SCENARIO: $100,000 Pool, 1 Month Market');
console.log('='.repeat(70));

const poolSize = 100000;
const marketDays = 30;
const yieldApy = 0.08; // 8% APY

const yieldEarned = poolSize * (yieldApy * marketDays / 365);
const expectedLpLoss = poolSize * avgLpLossPercent;
const netResult = yieldEarned - expectedLpLoss;

console.log(`
Pool Size:        $${poolSize.toLocaleString()}
Market Duration:  ${marketDays} days
Yield APY:        ${(yieldApy * 100).toFixed(1)}%

Yield Earned:     $${yieldEarned.toFixed(2)} (+${(yieldEarned/poolSize*100).toFixed(2)}%)
Expected LP Loss: $${expectedLpLoss.toFixed(2)} (-${(expectedLpLoss/poolSize*100).toFixed(2)}%)
─────────────────────────────────
Net Result:       $${netResult.toFixed(2)} (${(netResult/poolSize*100).toFixed(2)}%)

Conclusion: Yield does NOT offset LP losses for typical market durations.
`);

// ============================================================================
// BETTER MODEL: YIELD AS BONUS, NOT OFFSET
// ============================================================================

console.log('='.repeat(70));
console.log('BETTER MODEL: YIELD AS PROTOCOL REVENUE');
console.log('='.repeat(70));

console.log(`
Instead of trying to offset LP losses with yield, use yield strategically:

┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  IDLE FUNDS YIELD STRATEGY                                         │
│                                                                     │
│  1. USER DEPOSITS $100 to buy YES tokens                           │
│     └── $100 goes to yield protocol immediately                    │
│                                                                     │
│  2. MARKET RUNS FOR 30 DAYS                                        │
│     └── $100 earns ~$0.65 yield (8% APY)                           │
│     └── Yield accrues to PROTOCOL (not LP)                         │
│                                                                     │
│  3. MARKET RESOLVES                                                │
│     └── Winners claim from yield protocol                          │
│     └── Protocol keeps yield as revenue                            │
│                                                                     │
│  RESULT:                                                           │
│  • Protocol earns yield on ALL deposits                            │
│  • Trading fees + yield = sustainable revenue                      │
│  • LP model can be simpler (subsidized creator)                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
`);

// ============================================================================
// PROTOCOL REVENUE PROJECTION
// ============================================================================

console.log('='.repeat(70));
console.log('PROTOCOL REVENUE PROJECTION');
console.log('='.repeat(70));

const monthlyVolume = 1000000; // $1M monthly trading volume
const avgHoldTime = 15; // Average days funds are held
const tradingFeeRate = 0.02; // 2% trading fee
const yieldRate = 0.08; // 8% APY

// Calculate revenues
const tradingFeeRevenue = monthlyVolume * tradingFeeRate;
const avgLockedFunds = monthlyVolume * 0.5; // Assume 50% of volume is locked at any time
const yieldRevenue = avgLockedFunds * (yieldRate * avgHoldTime / 365);
const totalRevenue = tradingFeeRevenue + yieldRevenue;

console.log(`
Assumptions:
• Monthly Trading Volume: $${monthlyVolume.toLocaleString()}
• Average Hold Time: ${avgHoldTime} days
• Trading Fee: ${(tradingFeeRate * 100).toFixed(1)}%
• Yield APY: ${(yieldRate * 100).toFixed(1)}%

Revenue Breakdown:
┌─────────────────────────────────────────────┐
│ Trading Fees:    $${tradingFeeRevenue.toLocaleString().padStart(10)}  (${(tradingFeeRevenue/totalRevenue*100).toFixed(1)}%)  │
│ Yield Revenue:   $${yieldRevenue.toFixed(2).padStart(10)}  (${(yieldRevenue/totalRevenue*100).toFixed(1)}%)   │
├─────────────────────────────────────────────┤
│ TOTAL MONTHLY:   $${totalRevenue.toFixed(2).padStart(10)}           │
└─────────────────────────────────────────────┘

Yield adds ${(yieldRevenue/tradingFeeRevenue*100).toFixed(1)}% extra revenue on top of trading fees!
`);

// ============================================================================
// IMPLEMENTATION OPTIONS FOR STACKS
// ============================================================================

console.log('='.repeat(70));
console.log('IMPLEMENTATION OPTIONS FOR STACKS');
console.log('='.repeat(70));

console.log(`
Available Yield Sources on Stacks:

┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  1. VELAR LIQUID STAKING                                           │
│     • Stake STX → receive stSTX                                    │
│     • ~5-7% APY                                                    │
│     • Liquid (can unstake)                                         │
│                                                                     │
│  2. ARKADIKO (USDA)                                                │
│     • Stability pool yields                                        │
│     • Variable APY                                                 │
│                                                                     │
│  3. ALEX DEX LP                                                    │
│     • Provide liquidity to USDC pairs                              │
│     • Variable APY + ALEX rewards                                  │
│                                                                     │
│  4. ZEST PROTOCOL (Lending)                                        │
│     • Lend USDC/STX                                                │
│     • Variable lending rates                                       │
│                                                                     │
│  5. SIMPLE: JUST HOLD                                              │
│     • Keep funds in contract                                       │
│     • 0% yield but simplest                                        │
│     • Start here, add yield later                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

RECOMMENDATION:
• Phase 1 (Hackathon): No yield, keep it simple
• Phase 2 (Testnet): Integrate with Zest or ALEX
• Phase 3 (Mainnet): Multiple yield sources with risk management
`);

// ============================================================================
// FINAL ARCHITECTURE
// ============================================================================

console.log('='.repeat(70));
console.log('FINAL RECOMMENDED ARCHITECTURE');
console.log('='.repeat(70));

console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                    ORAKAMOTO FINAL MODEL                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LAYER 1: GLOBAL LIQUIDITY POOL                                    │
│  ────────────────────────────────                                  │
│  • Single pool serves all markets                                  │
│  • LPs deposit USDC, receive oraLP tokens                          │
│  • Risk diversified across markets                                 │
│  • Risk caps per market (max 10% of pool)                          │
│                                                                     │
│  LAYER 2: YIELD STRATEGY                                           │
│  ────────────────────────────                                      │
│  • Idle funds auto-deposit to yield protocol                       │
│  • Yield accrues to protocol treasury                              │
│  • Emergency reserve kept liquid (20%)                             │
│                                                                     │
│  LAYER 3: SKEW PRICING                                             │
│  ──────────────────────                                            │
│  • Overbought side costs more                                      │
│  • Incentivizes balanced markets                                   │
│  • Reduces LP exposure risk                                        │
│                                                                     │
│  LAYER 4: FEE DISTRIBUTION                                         │
│  ─────────────────────────                                         │
│  • 2% trading fee                                                  │
│  • 50% → LPs (compensation for risk)                               │
│  • 30% → Protocol treasury                                         │
│  • 20% → Market creator                                            │
│                                                                     │
│  REVENUE STREAMS:                                                  │
│  ────────────────                                                  │
│  1. Trading fees (2% per trade)                                    │
│  2. Yield on idle funds (~8% APY)                                  │
│  3. Market creation fees ($X per market)                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

This model is:
✓ Sustainable (multiple revenue streams)
✓ Fair to LPs (diversified risk + fees + yield share)
✓ Simple enough for hackathon (can skip yield layer initially)
✓ Scalable for mainnet (add yield integrations later)
`);
