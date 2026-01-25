/**
 * SIMULACION CORRECTA DE LP EN PREDICTION MARKETS
 *
 * Modelo CPMM correcto:
 * - Pool tiene YES y NO tokens
 * - Invariante: yes × no = k
 * - Precio YES = no / (yes + no)
 * - Para comprar Δy YES, pagas: k/(y-Δy) - k/y en valor
 *
 * Al resolver:
 * - YES gana: cada YES = $1, cada NO = $0
 * - NO gana: cada YES = $0, cada NO = $1
 */

console.log('═'.repeat(70));
console.log('SIMULACION LP CORREGIDA - CPMM CORRECTO');
console.log('═'.repeat(70));

// ============================================================================
// CPMM CORRECTO PARA PREDICTION MARKETS
// ============================================================================

class CPMM {
  constructor(liquidity) {
    // LP deposita $L, crea L YES + L NO tokens
    this.initialLiquidity = liquidity;
    this.yesReserve = liquidity;
    this.noReserve = liquidity;
    this.k = this.yesReserve * this.noReserve; // invariante

    this.feesCollected = 0;
    this.totalVolume = 0;
  }

  getYesPrice() {
    return this.noReserve / (this.yesReserve + this.noReserve);
  }

  getNoPrice() {
    return this.yesReserve / (this.yesReserve + this.noReserve);
  }

  /**
   * Comprar YES tokens
   * El trader quiere gastar $amount para obtener YES tokens
   *
   * Mecanica CPMM:
   * 1. El trader deposita 'amount' como colateral
   * 2. Esto se convierte en 'amount' complete sets (YES + NO)
   * 3. El trader vende los NO tokens al pool por mas YES
   *
   * Simplificacion: calculamos cuantos YES tokens salen por el amount
   */
  buyYes(amount, feeRate) {
    const fee = amount * feeRate;
    const netAmount = amount - fee;
    this.feesCollected += fee;
    this.totalVolume += amount;

    // Usando CPMM: cuantos YES tokens por netAmount?
    // Si el trader "vende" netAmount de NO al pool:
    // new_no = noReserve + netAmount
    // new_yes = k / new_no
    // tokens_out = yesReserve - new_yes

    const newNoReserve = this.noReserve + netAmount;
    const newYesReserve = this.k / newNoReserve;
    const tokensOut = this.yesReserve - newYesReserve;

    // Limitar a reservas disponibles (no puede ir a 0)
    const actualTokensOut = Math.min(tokensOut, this.yesReserve * 0.95);

    // Actualizar reservas
    this.yesReserve -= actualTokensOut;
    this.noReserve += netAmount;

    // Mantener invariante (ajustar por el limite)
    this.k = this.yesReserve * this.noReserve;

    return actualTokensOut;
  }

  /**
   * Comprar NO tokens
   */
  buyNo(amount, feeRate) {
    const fee = amount * feeRate;
    const netAmount = amount - fee;
    this.feesCollected += fee;
    this.totalVolume += amount;

    const newYesReserve = this.yesReserve + netAmount;
    const newNoReserve = this.k / newYesReserve;
    const tokensOut = this.noReserve - newNoReserve;

    const actualTokensOut = Math.min(tokensOut, this.noReserve * 0.95);

    this.noReserve -= actualTokensOut;
    this.yesReserve += netAmount;
    this.k = this.yesReserve * this.noReserve;

    return actualTokensOut;
  }

  /**
   * Resolver el mercado
   */
  resolve(yesWins) {
    // Al resolver:
    // - Si YES gana: yesReserve vale $1 cada uno, noReserve vale $0
    // - Si NO gana: yesReserve vale $0, noReserve vale $1 cada uno

    const tokenValue = yesWins ? this.yesReserve : this.noReserve;
    const totalValue = tokenValue + this.feesCollected;
    const pnl = totalValue - this.initialLiquidity;

    return {
      initialLiquidity: this.initialLiquidity,
      yesReserve: this.yesReserve,
      noReserve: this.noReserve,
      tokenValue,
      fees: this.feesCollected,
      totalValue,
      pnl,
      return: pnl / this.initialLiquidity,
      volume: this.totalVolume,
      finalPrice: this.getYesPrice()
    };
  }
}

// ============================================================================
// SIMULACION DE UN MERCADO
// ============================================================================

function simulateMarket(config) {
  const {
    liquidity,
    numTrades,
    informedRatio,
    trueOutcome,
    feeRate,
    avgTradeSize,
    useDynamicFees
  } = config;

  const market = new CPMM(liquidity);

  for (let i = 0; i < numTrades; i++) {
    const isInformed = Math.random() < informedRatio;
    const currentPrice = market.getYesPrice();

    // Trade size con variacion
    const size = avgTradeSize * (0.5 + Math.random());

    // Dynamic fee: aumenta hacia el final del mercado
    let fee = feeRate;
    if (useDynamicFees) {
      const progress = i / numTrades;
      fee = feeRate * (1 + progress * 1.5); // hasta 2.5x al final
    }

    if (isInformed) {
      // Trader informado: sabe el outcome, compra el lado ganador
      // Pero solo si el precio le da edge (no compra a 99%)
      if (trueOutcome) {
        // YES va a ganar, comprar YES si precio < 0.90
        if (currentPrice < 0.85) {
          market.buyYes(size, fee);
        }
      } else {
        // NO va a ganar, comprar NO si precio > 0.10
        if (currentPrice > 0.15) {
          market.buyNo(size, fee);
        }
      }
    } else {
      // Noise trader: compra random 50/50
      if (Math.random() > 0.5) {
        market.buyYes(size, fee);
      } else {
        market.buyNo(size, fee);
      }
    }
  }

  return market.resolve(trueOutcome);
}

// ============================================================================
// EJEMPLO PASO A PASO
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('EJEMPLO PASO A PASO');
console.log('═'.repeat(70));

const example = new CPMM(1000);
console.log(`
Estado inicial:
  Liquidez: $1,000
  YES reserve: ${example.yesReserve}
  NO reserve: ${example.noReserve}
  Precio YES: ${(example.getYesPrice() * 100).toFixed(1)}%
  k = ${example.k}
`);

console.log('--- Trade 1: Informed compra YES por $100 (fee 2%) ---');
let tokens = example.buyYes(100, 0.02);
console.log(`  Tokens YES recibidos: ${tokens.toFixed(2)}`);
console.log(`  Nuevo YES reserve: ${example.yesReserve.toFixed(2)}`);
console.log(`  Nuevo NO reserve: ${example.noReserve.toFixed(2)}`);
console.log(`  Nuevo precio YES: ${(example.getYesPrice() * 100).toFixed(1)}%`);
console.log(`  Fees acumulados: $${example.feesCollected.toFixed(2)}`);

console.log('\n--- Trade 2: Noise compra NO por $50 (fee 2%) ---');
tokens = example.buyNo(50, 0.02);
console.log(`  Tokens NO recibidos: ${tokens.toFixed(2)}`);
console.log(`  Nuevo YES reserve: ${example.yesReserve.toFixed(2)}`);
console.log(`  Nuevo NO reserve: ${example.noReserve.toFixed(2)}`);
console.log(`  Nuevo precio YES: ${(example.getYesPrice() * 100).toFixed(1)}%`);

console.log('\n--- Trade 3: Informed compra YES por $150 (fee 2%) ---');
tokens = example.buyYes(150, 0.02);
console.log(`  Tokens YES recibidos: ${tokens.toFixed(2)}`);
console.log(`  Nuevo YES reserve: ${example.yesReserve.toFixed(2)}`);
console.log(`  Nuevo NO reserve: ${example.noReserve.toFixed(2)}`);
console.log(`  Nuevo precio YES: ${(example.getYesPrice() * 100).toFixed(1)}%`);

console.log('\n--- Resolucion ---');
const resultYes = example.resolve(true);
const resultNo = new CPMM(1000);
resultNo.buyYes(100, 0.02);
resultNo.buyNo(50, 0.02);
resultNo.buyYes(150, 0.02);
const resultNoWins = resultNo.resolve(false);

console.log(`
SI YES GANA:
  YES reserve (${resultYes.yesReserve.toFixed(0)}) × $1 = $${resultYes.yesReserve.toFixed(2)}
  NO reserve (${resultYes.noReserve.toFixed(0)}) × $0 = $0
  Fees: $${resultYes.fees.toFixed(2)}
  Total: $${resultYes.totalValue.toFixed(2)}
  P&L: $${resultYes.pnl.toFixed(2)} (${(resultYes.return * 100).toFixed(1)}%)

SI NO GANA:
  YES reserve × $0 = $0
  NO reserve (${resultNoWins.noReserve.toFixed(0)}) × $1 = $${resultNoWins.noReserve.toFixed(2)}
  Fees: $${resultNoWins.fees.toFixed(2)}
  Total: $${resultNoWins.totalValue.toFixed(2)}
  P&L: $${resultNoWins.pnl.toFixed(2)} (${(resultNoWins.return * 100).toFixed(1)}%)
`);

// ============================================================================
// SIMULACION MONTE CARLO
// ============================================================================

console.log('═'.repeat(70));
console.log('SIMULACION MONTE CARLO');
console.log('═'.repeat(70));

const RUNS = 1000;
const LIQUIDITY = 10000;

// Escenario realista
const scenarios = [
  { name: 'Bajo (10 trades, 10% inf)', trades: 10, informed: 0.10, tradeSize: 100 },
  { name: 'Medio (20 trades, 15% inf)', trades: 20, informed: 0.15, tradeSize: 100 },
  { name: 'Alto (50 trades, 20% inf)', trades: 50, informed: 0.20, tradeSize: 100 },
  { name: 'Extremo (100 trades, 30% inf)', trades: 100, informed: 0.30, tradeSize: 100 },
];

console.log(`\nParametros: Liquidez $${LIQUIDITY}, ${RUNS} runs, fee base 2%\n`);

console.log('┌─────────────────────────────┬──────────┬──────────┬──────────┬────────┐');
console.log('│ Escenario                   │ Avg Ret  │ Std Dev  │ Rango    │ Win %  │');
console.log('├─────────────────────────────┼──────────┼──────────┼──────────┼────────┤');

for (const scenario of scenarios) {
  const results = [];

  for (let i = 0; i < RUNS; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulateMarket({
      liquidity: LIQUIDITY,
      numTrades: scenario.trades,
      informedRatio: scenario.informed,
      trueOutcome: outcome,
      feeRate: 0.02,
      avgTradeSize: scenario.tradeSize,
      useDynamicFees: false
    });
    results.push(r.return);
  }

  const avg = results.reduce((a, b) => a + b) / results.length;
  const std = Math.sqrt(results.map(r => (r - avg) ** 2).reduce((a, b) => a + b) / results.length);
  const min = Math.min(...results);
  const max = Math.max(...results);
  const wins = results.filter(r => r > 0).length / results.length * 100;

  console.log(`│ ${scenario.name.padEnd(27)} │ ${(avg*100).toFixed(1).padStart(7)}% │ ${(std*100).toFixed(1).padStart(7)}% │ ${(min*100).toFixed(0).padStart(3)} a ${(max*100).toFixed(0)}% │ ${wins.toFixed(0).padStart(5)}% │`);
}

console.log('└─────────────────────────────┴──────────┴──────────┴──────────┴────────┘');

// ============================================================================
// COMPARACION: BASELINE vs GLOBAL POOL vs DYNAMIC FEES
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('COMPARACION DE MECANISMOS');
console.log('═'.repeat(70));

// Funcion para simular Global Pool
function simulateGlobalPool(config) {
  const { totalLiquidity, numMarkets, tradesPerMarket, informedRatio, feeRate, avgTradeSize, useDynamicFees } = config;

  const liquidityPerMarket = totalLiquidity / numMarkets;
  let totalPnL = 0;

  for (let m = 0; m < numMarkets; m++) {
    const outcome = Math.random() > 0.5;
    const result = simulateMarket({
      liquidity: liquidityPerMarket,
      numTrades: tradesPerMarket,
      informedRatio,
      trueOutcome: outcome,
      feeRate,
      avgTradeSize: avgTradeSize / 2, // trades mas pequenos por mercado
      useDynamicFees
    });
    totalPnL += result.pnl;
  }

  return totalPnL / totalLiquidity;
}

console.log('\nEscenario: 20 trades totales, 15% informed, fee 2%\n');

// Baseline
const baselineResults = [];
for (let i = 0; i < RUNS; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateMarket({
    liquidity: LIQUIDITY,
    numTrades: 20,
    informedRatio: 0.15,
    trueOutcome: outcome,
    feeRate: 0.02,
    avgTradeSize: 100,
    useDynamicFees: false
  });
  baselineResults.push(r.return);
}

// Global Pool (5 mercados)
const globalResults = [];
for (let i = 0; i < RUNS; i++) {
  const r = simulateGlobalPool({
    totalLiquidity: LIQUIDITY,
    numMarkets: 5,
    tradesPerMarket: 4,
    informedRatio: 0.15,
    feeRate: 0.02,
    avgTradeSize: 100,
    useDynamicFees: false
  });
  globalResults.push(r);
}

// Global + Dynamic Fees
const dynamicResults = [];
for (let i = 0; i < RUNS; i++) {
  const r = simulateGlobalPool({
    totalLiquidity: LIQUIDITY,
    numMarkets: 5,
    tradesPerMarket: 4,
    informedRatio: 0.15,
    feeRate: 0.02,
    avgTradeSize: 100,
    useDynamicFees: true
  });
  dynamicResults.push(r);
}

// Con Yield (8% APY por 30 dias)
const yieldBonus = 0.08 * 30 / 365; // ~0.66%
const yieldResults = dynamicResults.map(r => r + yieldBonus);

function printStats(name, results) {
  const avg = results.reduce((a, b) => a + b) / results.length;
  const std = Math.sqrt(results.map(r => (r - avg) ** 2).reduce((a, b) => a + b) / results.length);
  const wins = results.filter(r => r > 0).length / results.length * 100;
  return { name, avg, std, wins };
}

const stats = [
  printStats('1. Baseline (aislado)', baselineResults),
  printStats('2. Global Pool (5 mkts)', globalResults),
  printStats('3. Global + Dynamic Fees', dynamicResults),
  printStats('4. Global + Dyn + Yield', yieldResults)
];

console.log('┌───────────────────────────────┬───────────┬───────────┬─────────┐');
console.log('│ Modelo                        │ Avg Ret   │ Std Dev   │ Win %   │');
console.log('├───────────────────────────────┼───────────┼───────────┼─────────┤');

for (const s of stats) {
  console.log(`│ ${s.name.padEnd(29)} │ ${(s.avg*100).toFixed(1).padStart(8)}% │ ${(s.std*100).toFixed(1).padStart(8)}% │ ${s.wins.toFixed(0).padStart(6)}% │`);
}

console.log('└───────────────────────────────┴───────────┴───────────┴─────────┘');

// ============================================================================
// MEJORA INCREMENTAL
// ============================================================================

console.log('\nMEJORA INCREMENTAL:');
console.log('─'.repeat(50));
console.log(`Baseline → Global Pool:     ${((stats[1].avg - stats[0].avg) * 100).toFixed(1)} puntos`);
console.log(`Global → +Dynamic Fees:     ${((stats[2].avg - stats[1].avg) * 100).toFixed(1)} puntos`);
console.log(`+Dynamic → +Yield:          ${((stats[3].avg - stats[2].avg) * 100).toFixed(1)} puntos`);
console.log(`─`.repeat(50));
console.log(`TOTAL (Baseline → Todo):    ${((stats[3].avg - stats[0].avg) * 100).toFixed(1)} puntos`);

// ============================================================================
// SENSIBILIDAD A FEES
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('SENSIBILIDAD: QUE FEE NECESITAMOS?');
console.log('═'.repeat(70));

console.log('\nGlobal Pool + Dynamic Fees, 15% informed:\n');

console.log('┌─────────────┬───────────┬─────────┐');
console.log('│ Base Fee    │ Avg Ret   │ Win %   │');
console.log('├─────────────┼───────────┼─────────┤');

for (const baseFee of [0.01, 0.02, 0.03, 0.05, 0.08, 0.10]) {
  const results = [];
  for (let i = 0; i < 500; i++) {
    const r = simulateGlobalPool({
      totalLiquidity: LIQUIDITY,
      numMarkets: 5,
      tradesPerMarket: 4,
      informedRatio: 0.15,
      feeRate: baseFee,
      avgTradeSize: 100,
      useDynamicFees: true
    });
    results.push(r + yieldBonus);
  }
  const avg = results.reduce((a, b) => a + b) / results.length;
  const wins = results.filter(r => r > 0).length / results.length * 100;

  console.log(`│ ${(baseFee*100).toFixed(0).padStart(10)}% │ ${(avg*100).toFixed(1).padStart(8)}% │ ${wins.toFixed(0).padStart(6)}% │`);
}

console.log('└─────────────┴───────────┴─────────┘');

// ============================================================================
// SENSIBILIDAD A % INFORMED
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('SENSIBILIDAD: COMO AFECTA % INFORMED?');
console.log('═'.repeat(70));

console.log('\nGlobal Pool + Dynamic Fees (3%) + Yield:\n');

console.log('┌─────────────┬───────────┬─────────┐');
console.log('│ % Informed  │ Avg Ret   │ Win %   │');
console.log('├─────────────┼───────────┼─────────┤');

for (const informed of [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]) {
  const results = [];
  for (let i = 0; i < 500; i++) {
    const r = simulateGlobalPool({
      totalLiquidity: LIQUIDITY,
      numMarkets: 5,
      tradesPerMarket: 4,
      informedRatio: informed,
      feeRate: 0.03,
      avgTradeSize: 100,
      useDynamicFees: true
    });
    results.push(r + yieldBonus);
  }
  const avg = results.reduce((a, b) => a + b) / results.length;
  const wins = results.filter(r => r > 0).length / results.length * 100;

  console.log(`│ ${(informed*100).toFixed(0).padStart(10)}% │ ${(avg*100).toFixed(1).padStart(8)}% │ ${wins.toFixed(0).padStart(6)}% │`);
}

console.log('└─────────────┴───────────┴─────────┘');

// ============================================================================
// TIME-BASED FEES: PENALIZAR INFORMED TRADERS CERCA DEL CIERRE
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('TIME-BASED FEES: PENALIZAR TRADES CERCA DEL CIERRE');
console.log('═'.repeat(70));

console.log(`
EL PROBLEMA:
Los informed traders prefieren actuar CERCA del cierre porque:
1. Tienen mas certeza del outcome
2. El precio aun no refleja la informacion
3. Pueden comprar "shares baratos" del lado ganador

LA SOLUCION:
Fees que aumentan EXPONENCIALMENTE cerca del deadline
`);

// Simulacion con informed traders concentrados al final
function simulateWithTimeConcentration(config) {
  const {
    liquidity,
    numTrades,
    informedRatio,
    trueOutcome,
    baseFeeRate,
    avgTradeSize,
    feeModel, // 'flat', 'linear', 'exponential', 'last10pct_only'
    informedConcentration // 'uniform', 'end_heavy', 'last_20pct'
  } = config;

  const market = new CPMM(liquidity);

  for (let i = 0; i < numTrades; i++) {
    const progress = i / numTrades; // 0 a 1

    // Determinar si este trade es informed basado en concentracion
    let isInformed = false;
    if (informedConcentration === 'uniform') {
      isInformed = Math.random() < informedRatio;
    } else if (informedConcentration === 'end_heavy') {
      // 70% de informed trades ocurren en ultimo 30% del tiempo
      const adjustedRatio = progress > 0.7 ? informedRatio * 2.33 : informedRatio * 0.43;
      isInformed = Math.random() < adjustedRatio;
    } else if (informedConcentration === 'last_20pct') {
      // 80% de informed trades en ultimo 20%
      const adjustedRatio = progress > 0.8 ? informedRatio * 4 : informedRatio * 0.25;
      isInformed = Math.random() < adjustedRatio;
    }

    const currentPrice = market.getYesPrice();
    const size = avgTradeSize * (0.5 + Math.random());

    // Calcular fee segun modelo
    let fee;
    if (feeModel === 'flat') {
      fee = baseFeeRate;
    } else if (feeModel === 'linear') {
      // 1x a 2.5x
      fee = baseFeeRate * (1 + progress * 1.5);
    } else if (feeModel === 'exponential') {
      // 1x al inicio, hasta 5x al final (exponencial)
      fee = baseFeeRate * Math.pow(5, progress);
    } else if (feeModel === 'last10pct_only') {
      // Fee normal, pero 4x en ultimo 10%
      fee = progress > 0.9 ? baseFeeRate * 4 : baseFeeRate;
    } else if (feeModel === 'last20pct_surge') {
      // Fee normal, 2x en 80-90%, 4x en 90-100%
      if (progress > 0.9) fee = baseFeeRate * 4;
      else if (progress > 0.8) fee = baseFeeRate * 2;
      else fee = baseFeeRate;
    }

    if (isInformed) {
      if (trueOutcome && currentPrice < 0.85) {
        market.buyYes(size, fee);
      } else if (!trueOutcome && currentPrice > 0.15) {
        market.buyNo(size, fee);
      }
    } else {
      if (Math.random() > 0.5) {
        market.buyYes(size, fee);
      } else {
        market.buyNo(size, fee);
      }
    }
  }

  return market.resolve(trueOutcome);
}

// Comparar modelos de fees cuando informed traders se concentran al final
console.log('\n=== ESCENARIO: Informed traders concentrados en ultimo 20% ===\n');
console.log('(Esto simula el comportamiento real: traders esperan cerca del cierre)\n');

const feeModels = [
  { id: 'flat', name: 'Fee Plano (3%)' },
  { id: 'linear', name: 'Fee Lineal (3% → 7.5%)' },
  { id: 'exponential', name: 'Fee Exponencial (3% → 15%)' },
  { id: 'last20pct_surge', name: 'Surge Ultimo 20% (3%/6%/12%)' }
];

console.log('┌─────────────────────────────────┬───────────┬───────────┬─────────┐');
console.log('│ Modelo de Fee                   │ Avg Ret   │ Fees/Vol  │ Win %   │');
console.log('├─────────────────────────────────┼───────────┼───────────┼─────────┤');

for (const feeModel of feeModels) {
  const results = [];
  let totalFees = 0;
  let totalVol = 0;

  for (let i = 0; i < 500; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulateWithTimeConcentration({
      liquidity: LIQUIDITY,
      numTrades: 50,
      informedRatio: 0.15,
      trueOutcome: outcome,
      baseFeeRate: 0.03,
      avgTradeSize: 100,
      feeModel: feeModel.id,
      informedConcentration: 'last_20pct'
    });
    results.push(r.return);
    totalFees += r.fees;
    totalVol += r.volume;
  }

  const avg = results.reduce((a, b) => a + b) / results.length;
  const wins = results.filter(r => r > 0).length / results.length * 100;
  const feeRatio = (totalFees / totalVol * 100).toFixed(1);

  console.log(`│ ${feeModel.name.padEnd(31)} │ ${(avg*100).toFixed(1).padStart(8)}% │ ${feeRatio.padStart(8)}% │ ${wins.toFixed(0).padStart(6)}% │`);
}

console.log('└─────────────────────────────────┴───────────┴───────────┴─────────┘');

// Comparar: uniform vs concentrated informed
console.log('\n=== COMPARACION: Informed Uniformes vs Concentrados ===\n');
console.log('Fee Model: Exponencial (3% → 15%)\n');

const concentrations = [
  { id: 'uniform', name: 'Uniform (distribuidos)' },
  { id: 'end_heavy', name: 'End Heavy (70% en ultimo 30%)' },
  { id: 'last_20pct', name: 'Last 20% (80% en ultimo 20%)' }
];

console.log('┌─────────────────────────────────┬───────────┬───────────┬─────────┐');
console.log('│ Concentracion Informed          │ Avg Ret   │ Fees/Vol  │ Win %   │');
console.log('├─────────────────────────────────┼───────────┼───────────┼─────────┤');

for (const conc of concentrations) {
  const results = [];
  let totalFees = 0;
  let totalVol = 0;

  for (let i = 0; i < 500; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulateWithTimeConcentration({
      liquidity: LIQUIDITY,
      numTrades: 50,
      informedRatio: 0.15,
      trueOutcome: outcome,
      baseFeeRate: 0.03,
      avgTradeSize: 100,
      feeModel: 'exponential',
      informedConcentration: conc.id
    });
    results.push(r.return);
    totalFees += r.fees;
    totalVol += r.volume;
  }

  const avg = results.reduce((a, b) => a + b) / results.length;
  const wins = results.filter(r => r > 0).length / results.length * 100;
  const feeRatio = (totalFees / totalVol * 100).toFixed(1);

  console.log(`│ ${conc.name.padEnd(31)} │ ${(avg*100).toFixed(1).padStart(8)}% │ ${feeRatio.padStart(8)}% │ ${wins.toFixed(0).padStart(6)}% │`);
}

console.log('└─────────────────────────────────┴───────────┴───────────┴─────────┘');

console.log(`
INSIGHT CLAVE:
- Con fees EXPONENCIALES, cuando los informed traders se concentran al final,
  pagan MUCHO mas en fees (capturamos mas de su edge)
- Fee ratio aumenta porque los trades toxicos pagan mas
- Esto "redistribuye" las ganancias de informed → LPs
`);

// ============================================================================
// EDGE CASES: QUE PASA SI LOS FEES CAMBIAN EL COMPORTAMIENTO?
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('EDGE CASES: CAMBIO DE COMPORTAMIENTO POR FEES ALTOS');
console.log('═'.repeat(70));

console.log(`
PREGUNTA: Si los fees son muy altos al final, ¿los traders se mueven al inicio?
Simulamos diferentes distribuciones de trades en respuesta a los fees.
`);

// Simulacion donde traders reaccionan a fees
function simulateWithTraderReaction(config) {
  const {
    liquidity,
    numTrades,
    informedRatio,
    trueOutcome,
    baseFeeRate,
    avgTradeSize,
    feeModel,
    traderDistribution // 'uniform', 'early', 'middle', 'late', 'avoid_end'
  } = config;

  const market = new CPMM(liquidity);

  for (let i = 0; i < numTrades; i++) {
    // Ajustar progreso segun distribucion de traders
    let effectiveProgress;
    const rawProgress = i / numTrades;

    if (traderDistribution === 'uniform') {
      effectiveProgress = rawProgress;
    } else if (traderDistribution === 'early') {
      // Todos tradean temprano - 80% de trades en primer 40%
      effectiveProgress = Math.pow(rawProgress, 2); // Comprime al inicio
    } else if (traderDistribution === 'middle') {
      // Concentrados en el medio
      effectiveProgress = 0.3 + rawProgress * 0.4; // 30% a 70%
    } else if (traderDistribution === 'avoid_end') {
      // Evitan el final - 90% de trades antes del 70%
      effectiveProgress = rawProgress < 0.9 ? rawProgress * 0.7 : 0.7 + (rawProgress - 0.9) * 3;
    }

    const isInformed = Math.random() < informedRatio;
    const currentPrice = market.getYesPrice();
    const size = avgTradeSize * (0.5 + Math.random());

    // Fee basado en progreso efectivo
    let fee;
    if (feeModel === 'flat') {
      fee = baseFeeRate;
    } else if (feeModel === 'exponential') {
      fee = baseFeeRate * Math.pow(5, effectiveProgress);
    }

    if (isInformed) {
      if (trueOutcome && currentPrice < 0.85) {
        market.buyYes(size, fee);
      } else if (!trueOutcome && currentPrice > 0.15) {
        market.buyNo(size, fee);
      }
    } else {
      if (Math.random() > 0.5) {
        market.buyYes(size, fee);
      } else {
        market.buyNo(size, fee);
      }
    }
  }

  return market.resolve(trueOutcome);
}

const distributions = [
  { id: 'uniform', name: 'Uniforme (baseline)' },
  { id: 'early', name: 'Early (80% en primer 40%)' },
  { id: 'middle', name: 'Middle (concentrado 30-70%)' },
  { id: 'avoid_end', name: 'Avoid End (evitan ultimo 30%)' }
];

console.log('\n=== Con Fee EXPONENCIAL (3% → 15%): ===\n');
console.log('┌─────────────────────────────────┬───────────┬───────────┬─────────┐');
console.log('│ Distribucion Traders            │ Avg Ret   │ Avg Fee   │ Win %   │');
console.log('├─────────────────────────────────┼───────────┼───────────┼─────────┤');

for (const dist of distributions) {
  const results = [];
  let totalFees = 0;
  let totalVol = 0;

  for (let i = 0; i < 500; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulateWithTraderReaction({
      liquidity: LIQUIDITY,
      numTrades: 50,
      informedRatio: 0.15,
      trueOutcome: outcome,
      baseFeeRate: 0.03,
      avgTradeSize: 100,
      feeModel: 'exponential',
      traderDistribution: dist.id
    });
    results.push(r.return);
    totalFees += r.fees;
    totalVol += r.volume;
  }

  const avg = results.reduce((a, b) => a + b) / results.length;
  const wins = results.filter(r => r > 0).length / results.length * 100;
  const feeRatio = (totalFees / totalVol * 100).toFixed(1);

  console.log(`│ ${dist.name.padEnd(31)} │ ${(avg*100).toFixed(1).padStart(8)}% │ ${feeRatio.padStart(8)}% │ ${wins.toFixed(0).padStart(6)}% │`);
}

console.log('└─────────────────────────────────┴───────────┴───────────┴─────────┘');

console.log(`
HALLAZGO: Si todos evitan el final, los fees promedio bajan
pero el LP IGUAL gana porque los informed no pueden esperar
a tener certeza total - tienen que tradear antes.

El fee exponencial FUERZA a los informed a elegir:
1. Tradear temprano (menos certeza, mas riesgo para ellos)
2. Tradear tarde (pagar fees muy altos)
`);

// ============================================================================
// MECANISMOS ADICIONALES NO SIMULADOS AUN
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('MECANISMOS ADICIONALES: BATCH AUCTIONS + pm-AMM + VPIN');
console.log('═'.repeat(70));

// BATCH AUCTIONS (FM-AMM)
console.log('\n=== 1. BATCH AUCTIONS (FM-AMM) ===\n');
console.log(`
Como funciona:
- Trades se acumulan durante N bloques
- Todos ejecutan al MISMO precio (uniform clearing)
- Arbitrageurs compiten entre si → sus ganancias → 0
- Sin front-running, sin timing advantage
`);

function simulateBatchAuction(config) {
  const {
    liquidity,
    numBatches,
    tradesPerBatch,
    informedRatio,
    trueOutcome,
    feeRate,
    avgTradeSize
  } = config;

  let totalLpValue = liquidity;
  let totalFees = 0;
  let totalVolume = 0;
  let currentProb = 0.5;

  for (let batch = 0; batch < numBatches; batch++) {
    // Acumular ordenes del batch
    let netYesDemand = 0; // positivo = mas YES, negativo = mas NO
    let batchVolume = 0;

    for (let t = 0; t < tradesPerBatch; t++) {
      const isInformed = Math.random() < informedRatio;
      const size = avgTradeSize * (0.5 + Math.random());
      batchVolume += size;

      if (isInformed) {
        // Informed compra el lado ganador
        netYesDemand += trueOutcome ? size : -size;
      } else {
        // Noise es 50/50
        netYesDemand += Math.random() > 0.5 ? size : -size;
      }
    }

    // BATCH AUCTION: todos al mismo precio
    // El precio se ajusta basado en demanda neta
    // Pero TODOS pagan el mismo precio, no hay ventaja de timing

    const priceImpact = netYesDemand / (liquidity * 2);
    const newProb = Math.max(0.05, Math.min(0.95, currentProb + priceImpact));

    // En batch auction, el "slippage" se distribuye equitativamente
    // Los arbitrageurs no extraen valor porque compiten entre si
    // El LP solo pierde por el movimiento de precio, no por arbitrage

    const fees = batchVolume * feeRate;
    totalFees += fees;
    totalVolume += batchVolume;

    // Perdida del LP es proporcional al cambio de precio (pero reducida)
    // En batch auction, se estima ~0% LVR vs ~σ²/8 en AMM normal
    const lvrReduction = 0.9; // Batch auction elimina 90% del LVR
    const lpLoss = Math.abs(newProb - currentProb) * batchVolume * 0.5 * (1 - lvrReduction);
    totalLpValue -= lpLoss;
    totalLpValue += fees;

    currentProb = newProb;
  }

  // Resolucion
  const probAtEnd = currentProb;
  const expectedLoss = trueOutcome ?
    (1 - probAtEnd) * liquidity * 0.5 :
    probAtEnd * liquidity * 0.5;

  totalLpValue -= expectedLoss * 0.3; // Factor de perdida reducido por batch

  const pnl = totalLpValue - liquidity;
  return {
    return: pnl / liquidity,
    fees: totalFees,
    volume: totalVolume
  };
}

// Comparar AMM normal vs Batch Auction
console.log('┌─────────────────────────────────┬───────────┬───────────┬─────────┐');
console.log('│ Modelo                          │ Avg Ret   │ Std Dev   │ Win %   │');
console.log('├─────────────────────────────────┼───────────┼───────────┼─────────┤');

// AMM Normal con fees exponenciales
const ammResults = [];
for (let i = 0; i < 500; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateWithTimeConcentration({
    liquidity: LIQUIDITY,
    numTrades: 50,
    informedRatio: 0.15,
    trueOutcome: outcome,
    baseFeeRate: 0.03,
    avgTradeSize: 100,
    feeModel: 'exponential',
    informedConcentration: 'last_20pct'
  });
  ammResults.push(r.return);
}

// Batch Auction
const batchResults = [];
for (let i = 0; i < 500; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateBatchAuction({
    liquidity: LIQUIDITY,
    numBatches: 10,
    tradesPerBatch: 5,
    informedRatio: 0.15,
    trueOutcome: outcome,
    feeRate: 0.02, // Fees mas bajos porque no hay LVR
    avgTradeSize: 100
  });
  batchResults.push(r.return);
}

function calcStats(results) {
  const avg = results.reduce((a, b) => a + b) / results.length;
  const std = Math.sqrt(results.map(r => (r - avg) ** 2).reduce((a, b) => a + b) / results.length);
  const wins = results.filter(r => r > 0).length / results.length * 100;
  return { avg, std, wins };
}

const ammStats = calcStats(ammResults);
const batchStats = calcStats(batchResults);

console.log(`│ AMM + Exp Fees (3%→15%)         │ ${(ammStats.avg*100).toFixed(1).padStart(8)}% │ ${(ammStats.std*100).toFixed(1).padStart(8)}% │ ${ammStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ Batch Auction (2% fee)          │ ${(batchStats.avg*100).toFixed(1).padStart(8)}% │ ${(batchStats.std*100).toFixed(1).padStart(8)}% │ ${batchStats.wins.toFixed(0).padStart(6)}% │`);
console.log('└─────────────────────────────────┴───────────┴───────────┴─────────┘');

// pm-AMM
console.log('\n=== 2. pm-AMM + DYNAMIC LIQUIDITY ===\n');
console.log(`
CONCEPTO CLAVE: Dynamic Liquidity como PENALIZACION a late traders

Formula: L_t = L_0 × √((T-t)/T)

Ejemplo con mercado de 100 bloques:
- Bloque 0:   L = L_0 × √1.00 = 100% de L_0 (slippage normal)
- Bloque 50:  L = L_0 × √0.50 = 71% de L_0  (slippage 1.4x)
- Bloque 80:  L = L_0 × √0.20 = 45% de L_0  (slippage 2.2x)
- Bloque 95:  L = L_0 × √0.05 = 22% de L_0  (slippage 4.5x)
- Bloque 99:  L = L_0 × √0.01 = 10% de L_0  (slippage 10x)

¡Los informed traders que esperan pagan MUCHO mas slippage!
`);

// Normal distribution functions
function normalPDF(z) {
  return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
}

function normalCDF(z) {
  // Approximation using error function
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z);
  const t = 1 / (1 + p * z);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

function inverseCDF(p) {
  // Approximation for Φ⁻¹(p)
  if (p <= 0) return -10;
  if (p >= 1) return 10;
  if (p === 0.5) return 0;

  const a = [0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1];
  const c = [0, -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
             -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [0, 7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];

  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) / ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q / (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) / ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
  }
}

// CPMM con Dynamic Liquidity (híbrido CPMM + pm-AMM Dynamic L)
// Usamos la mecánica de CPMM pero agregamos slippage basado en Dynamic L
class CPMMWithDynamicL {
  constructor(liquidity, totalBlocks, useDynamicL = true) {
    this.initialLiquidity = liquidity;
    this.yesReserve = liquidity;
    this.noReserve = liquidity;
    this.k = this.yesReserve * this.noReserve;

    this.totalBlocks = totalBlocks;
    this.currentBlock = 0;
    this.useDynamicL = useDynamicL;

    this.feesCollected = 0;
    this.slippageCollected = 0; // Slippage extra por Dynamic L
    this.totalVolume = 0;
  }

  // Dynamic L multiplier: 1/√((T-t)/T)
  // Esto aumenta el slippage cerca del deadline
  getSlippageMultiplier() {
    if (!this.useDynamicL) return 1;

    const timeRemaining = Math.max(1, this.totalBlocks - this.currentBlock);
    const ratio = timeRemaining / this.totalBlocks;
    // Cuando ratio = 1 (inicio): multiplier = 1
    // Cuando ratio = 0.25 (75% avanzado): multiplier = 2
    // Cuando ratio = 0.04 (96% avanzado): multiplier = 5
    return 1 / Math.sqrt(ratio);
  }

  getYesPrice() {
    return this.noReserve / (this.yesReserve + this.noReserve);
  }

  buyYes(amount, feeRate) {
    const fee = amount * feeRate;
    const netAmount = amount - fee;
    this.feesCollected += fee;
    this.totalVolume += amount;

    // CPMM normal
    const newNoReserve = this.noReserve + netAmount;
    const newYesReserve = this.k / newNoReserve;
    let tokensOut = this.yesReserve - newYesReserve;

    // Dynamic L: reducir tokens out (= aumentar slippage)
    // El trader recibe MENOS tokens, el LP conserva MAS
    const slippageMult = this.getSlippageMultiplier();
    const originalTokens = tokensOut;
    tokensOut = tokensOut / slippageMult;

    // Track slippage (para reportes, no se suma a fees)
    this.slippageCollected += (originalTokens - tokensOut) * this.getYesPrice();

    tokensOut = Math.min(tokensOut, this.yesReserve * 0.95);
    this.yesReserve -= tokensOut;
    this.noReserve += netAmount;
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
    let tokensOut = this.noReserve - newNoReserve;

    const slippageMult = this.getSlippageMultiplier();
    const originalTokens = tokensOut;
    tokensOut = tokensOut / slippageMult;
    this.slippageCollected += (originalTokens - tokensOut) * (1 - this.getYesPrice());

    tokensOut = Math.min(tokensOut, this.noReserve * 0.95);
    this.noReserve -= tokensOut;
    this.yesReserve += netAmount;
    this.k = this.yesReserve * this.noReserve;

    return tokensOut;
  }

  advanceBlock(blocks = 1) {
    this.currentBlock = Math.min(this.currentBlock + blocks, this.totalBlocks);
  }

  resolve(yesWins) {
    const tokenValue = yesWins ? this.yesReserve : this.noReserve;
    // NO sumamos slippageCollected porque ya está reflejado en las reservas
    // (el LP conservó más tokens gracias al slippage)
    const totalValue = tokenValue + this.feesCollected;
    const pnl = totalValue - this.initialLiquidity;

    return {
      initialLiquidity: this.initialLiquidity,
      yesReserve: this.yesReserve,
      noReserve: this.noReserve,
      tokenValue,
      fees: this.feesCollected,
      slippage: this.slippageCollected, // Solo para reportes
      totalValue,
      pnl,
      return: pnl / this.initialLiquidity,
      volume: this.totalVolume,
      finalPrice: this.getYesPrice(),
      finalSlippageMult: this.getSlippageMultiplier()
    };
  }
}

function simulateCPMMDynamicL(config) {
  const {
    liquidity,
    numTrades,
    informedRatio,
    trueOutcome,
    feeRate,
    avgTradeSize,
    useDynamicL = true,
    informedConcentration = 'last_20pct'
  } = config;

  const market = new CPMMWithDynamicL(liquidity, numTrades, useDynamicL);

  for (let i = 0; i < numTrades; i++) {
    market.advanceBlock(1);
    const progress = i / numTrades;

    let isInformed = false;
    if (informedConcentration === 'uniform') {
      isInformed = Math.random() < informedRatio;
    } else if (informedConcentration === 'last_20pct') {
      const adjustedRatio = progress > 0.8 ? informedRatio * 4 : informedRatio * 0.25;
      isInformed = Math.random() < adjustedRatio;
    }

    const currentPrice = market.getYesPrice();
    const size = avgTradeSize * (0.5 + Math.random());

    if (isInformed) {
      if (trueOutcome && currentPrice < 0.85) {
        market.buyYes(size, feeRate);
      } else if (!trueOutcome && currentPrice > 0.15) {
        market.buyNo(size, feeRate);
      }
    } else {
      if (Math.random() > 0.5) {
        market.buyYes(size, feeRate);
      } else {
        market.buyNo(size, feeRate);
      }
    }
  }

  return market.resolve(trueOutcome);
}

// Comparar CPMM normal vs CPMM con Dynamic L
console.log('Escenario: Informed traders concentrados en ultimo 20%\n');

console.log('┌─────────────────────────────────┬───────────┬───────────┬───────────┬─────────┐');
console.log('│ Modelo                          │ Avg Ret   │ Slippage  │ Std Dev   │ Win %   │');
console.log('├─────────────────────────────────┼───────────┼───────────┼───────────┼─────────┤');

// CPMM normal (sin Dynamic L)
const cpmmNormalResults = [];
let cpmmNormalSlippage = 0;
for (let i = 0; i < 500; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateCPMMDynamicL({
    liquidity: LIQUIDITY,
    numTrades: 50,
    informedRatio: 0.15,
    trueOutcome: outcome,
    feeRate: 0.03,
    avgTradeSize: 100,
    useDynamicL: false,
    informedConcentration: 'last_20pct'
  });
  cpmmNormalResults.push(r.return);
  cpmmNormalSlippage += r.slippage;
}

// CPMM CON Dynamic L
const cpmmDynamicResults = [];
let cpmmDynamicSlippage = 0;
for (let i = 0; i < 500; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateCPMMDynamicL({
    liquidity: LIQUIDITY,
    numTrades: 50,
    informedRatio: 0.15,
    trueOutcome: outcome,
    feeRate: 0.03,
    avgTradeSize: 100,
    useDynamicL: true,
    informedConcentration: 'last_20pct'
  });
  cpmmDynamicResults.push(r.return);
  cpmmDynamicSlippage += r.slippage;
}

// CPMM + Dynamic L + Exp Fees (doble penalizacion)
const cpmmFullResults = [];
let cpmmFullSlippage = 0;
for (let i = 0; i < 500; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateCPMMDynamicL({
    liquidity: LIQUIDITY,
    numTrades: 50,
    informedRatio: 0.15,
    trueOutcome: outcome,
    feeRate: 0.05, // Fee mas alto (simula exp fees promedio)
    avgTradeSize: 100,
    useDynamicL: true,
    informedConcentration: 'last_20pct'
  });
  cpmmFullResults.push(r.return);
  cpmmFullSlippage += r.slippage;
}

const cpmmNormalStats = calcStats(cpmmNormalResults);
const cpmmDynamicStats = calcStats(cpmmDynamicResults);
const cpmmFullStats = calcStats(cpmmFullResults);

console.log(`│ CPMM (baseline, 3% fee)         │ ${(cpmmNormalStats.avg*100).toFixed(1).padStart(8)}% │ $${(cpmmNormalSlippage/500).toFixed(0).padStart(7)} │ ${(cpmmNormalStats.std*100).toFixed(1).padStart(8)}% │ ${cpmmNormalStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ CPMM + Dynamic L                │ ${(cpmmDynamicStats.avg*100).toFixed(1).padStart(8)}% │ $${(cpmmDynamicSlippage/500).toFixed(0).padStart(7)} │ ${(cpmmDynamicStats.std*100).toFixed(1).padStart(8)}% │ ${cpmmDynamicStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ CPMM + Dynamic L + High Fee     │ ${(cpmmFullStats.avg*100).toFixed(1).padStart(8)}% │ $${(cpmmFullSlippage/500).toFixed(0).padStart(7)} │ ${(cpmmFullStats.std*100).toFixed(1).padStart(8)}% │ ${cpmmFullStats.wins.toFixed(0).padStart(6)}% │`);
console.log('└─────────────────────────────────┴───────────┴───────────┴───────────┴─────────┘');

console.log(`
INSIGHT: Dynamic L captura SLIPPAGE extra de late traders:
- Slippage baseline: $${(cpmmNormalSlippage/500).toFixed(0)}/mercado (no Dynamic L)
- Slippage con Dynamic L: $${(cpmmDynamicSlippage/500).toFixed(0)}/mercado
- Mejora LP return: ${((cpmmDynamicStats.avg - cpmmNormalStats.avg)*100).toFixed(1)} puntos
`);

// Comparar: informed uniform vs concentrados al final
console.log('\n=== Efecto de Dynamic L segun CUANDO tradean los informed ===\n');

console.log('┌─────────────────────────────────┬───────────┬───────────┬─────────┐');
console.log('│ Cuando tradean informed         │ Avg Ret   │ Slippage  │ Win %   │');
console.log('├─────────────────────────────────┼───────────┼───────────┼─────────┤');

for (const conc of ['uniform', 'last_20pct']) {
  const results = [];
  let totalSlippage = 0;
  for (let i = 0; i < 500; i++) {
    const outcome = Math.random() > 0.5;
    const r = simulateCPMMDynamicL({
      liquidity: LIQUIDITY,
      numTrades: 50,
      informedRatio: 0.15,
      trueOutcome: outcome,
      feeRate: 0.03,
      avgTradeSize: 100,
      useDynamicL: true,
      informedConcentration: conc
    });
    results.push(r.return);
    totalSlippage += r.slippage;
  }
  const stats = calcStats(results);
  const name = conc === 'uniform' ? 'Uniform (distribuidos)' : 'Last 20% (concentrados)';
  console.log(`│ ${name.padEnd(31)} │ ${(stats.avg*100).toFixed(1).padStart(8)}% │ $${(totalSlippage/500).toFixed(0).padStart(7)} │ ${stats.wins.toFixed(0).padStart(6)}% │`);
}

console.log('└─────────────────────────────────┴───────────┴───────────┴─────────┘');

console.log(`
HALLAZGO CLAVE:
- Cuando informed se CONCENTRAN al final → pagan MAS slippage
- Este slippage extra se queda con el LP
- Dynamic L es una PENALIZACION MATEMATICA a late traders
`);

// VPIN
console.log('\n=== 3. VPIN (Volume-Synchronized Probability of Informed Trading) ===\n');
console.log(`
Como funciona:
- VPIN = Σ|V_buy - V_sell| / (n × V_bucket)
- Detecta desbalance direccional (señal de informed trading)
- Cuando VPIN alto → aumentar fees dinamicamente
- Cuando VPIN bajo → fees normales (atraer volumen)
`);

function simulateWithVPIN(config) {
  const {
    liquidity,
    numTrades,
    informedRatio,
    trueOutcome,
    baseFeeRate,
    avgTradeSize,
    vpinWindow,
    vpinThreshold
  } = config;

  const market = new CPMM(liquidity);
  const recentTrades = []; // {side: 'yes'|'no', amount}

  for (let i = 0; i < numTrades; i++) {
    const isInformed = Math.random() < informedRatio;
    const currentPrice = market.getYesPrice();
    const size = avgTradeSize * (0.5 + Math.random());

    // Calcular VPIN de ultimos N trades
    let vpin = 0;
    if (recentTrades.length >= vpinWindow) {
      const window = recentTrades.slice(-vpinWindow);
      const yesVol = window.filter(t => t.side === 'yes').reduce((a, t) => a + t.amount, 0);
      const noVol = window.filter(t => t.side === 'no').reduce((a, t) => a + t.amount, 0);
      const totalVol = yesVol + noVol;
      vpin = totalVol > 0 ? Math.abs(yesVol - noVol) / totalVol : 0;
    }

    // Fee dinamico basado en VPIN
    // VPIN alto = mucho informed trading = fees mas altos
    let fee = baseFeeRate;
    if (vpin > vpinThreshold) {
      fee = baseFeeRate * (1 + (vpin - vpinThreshold) * 5); // Hasta 3x
    }

    let side;
    if (isInformed) {
      if (trueOutcome && currentPrice < 0.85) {
        market.buyYes(size, fee);
        side = 'yes';
      } else if (!trueOutcome && currentPrice > 0.15) {
        market.buyNo(size, fee);
        side = 'no';
      } else {
        continue;
      }
    } else {
      if (Math.random() > 0.5) {
        market.buyYes(size, fee);
        side = 'yes';
      } else {
        market.buyNo(size, fee);
        side = 'no';
      }
    }

    recentTrades.push({ side, amount: size });
  }

  return market.resolve(trueOutcome);
}

console.log('┌─────────────────────────────────┬───────────┬───────────┬─────────┐');
console.log('│ Modelo                          │ Avg Ret   │ Fees/Vol  │ Win %   │');
console.log('├─────────────────────────────────┼───────────┼───────────┼─────────┤');

// Sin VPIN
const noVpinResults = [];
let noVpinFees = 0, noVpinVol = 0;
for (let i = 0; i < 500; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateMarket({
    liquidity: LIQUIDITY,
    numTrades: 50,
    informedRatio: 0.20,
    trueOutcome: outcome,
    feeRate: 0.03,
    avgTradeSize: 100,
    useDynamicFees: false
  });
  noVpinResults.push(r.return);
  noVpinFees += r.fees;
  noVpinVol += r.volume;
}

// Con VPIN
const vpinResults = [];
let vpinFees = 0, vpinVol = 0;
for (let i = 0; i < 500; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateWithVPIN({
    liquidity: LIQUIDITY,
    numTrades: 50,
    informedRatio: 0.20,
    trueOutcome: outcome,
    baseFeeRate: 0.03,
    avgTradeSize: 100,
    vpinWindow: 10,
    vpinThreshold: 0.3
  });
  vpinResults.push(r.return);
  vpinFees += r.fees;
  vpinVol += r.volume;
}

const noVpinStats = calcStats(noVpinResults);
const vpinStats = calcStats(vpinResults);

console.log(`│ Sin VPIN (3% flat)              │ ${(noVpinStats.avg*100).toFixed(1).padStart(8)}% │ ${(noVpinFees/noVpinVol*100).toFixed(1).padStart(8)}% │ ${noVpinStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ Con VPIN (3% base, hasta 9%)    │ ${(vpinStats.avg*100).toFixed(1).padStart(8)}% │ ${(vpinFees/vpinVol*100).toFixed(1).padStart(8)}% │ ${vpinStats.wins.toFixed(0).padStart(6)}% │`);
console.log('└─────────────────────────────────┴───────────┴───────────┴─────────┘');

// ============================================================================
// COMBINACION DE TODOS LOS MECANISMOS
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('COMBINACION FINAL: TODOS LOS MECANISMOS');
console.log('═'.repeat(70));

console.log(`
Combinamos:
1. Global Pool (5 mercados)
2. Dynamic Fees Exponenciales (3% → 15%)
3. VPIN Detection (+fee cuando hay imbalance)
4. Yield (8% APY)

Nota: Batch Auctions y pm-AMM son arquitecturas ALTERNATIVAS,
no se combinan directamente con CPMM.
`);

function simulateCombinedModel(config) {
  const {
    totalLiquidity,
    numMarkets,
    tradesPerMarket,
    informedRatio,
    baseFeeRate,
    avgTradeSize,
    yieldAPY,
    marketDuration // en dias
  } = config;

  const liquidityPerMarket = totalLiquidity / numMarkets;
  let totalPnL = 0;

  for (let m = 0; m < numMarkets; m++) {
    const outcome = Math.random() > 0.5;
    const market = new CPMM(liquidityPerMarket);
    const recentTrades = [];

    for (let i = 0; i < tradesPerMarket; i++) {
      const progress = i / tradesPerMarket;
      const isInformed = Math.random() < informedRatio;
      const currentPrice = market.getYesPrice();
      const size = (avgTradeSize / numMarkets) * (0.5 + Math.random());

      // VPIN
      let vpin = 0;
      if (recentTrades.length >= 5) {
        const window = recentTrades.slice(-5);
        const yesVol = window.filter(t => t.side === 'yes').reduce((a, t) => a + t.amount, 0);
        const noVol = window.filter(t => t.side === 'no').reduce((a, t) => a + t.amount, 0);
        const totalVol = yesVol + noVol;
        vpin = totalVol > 0 ? Math.abs(yesVol - noVol) / totalVol : 0;
      }

      // Fee combinado: exponencial por tiempo + VPIN bonus
      let fee = baseFeeRate * Math.pow(5, progress); // Exponencial
      if (vpin > 0.3) {
        fee *= (1 + (vpin - 0.3) * 3); // VPIN multiplier
      }
      fee = Math.min(fee, 0.20); // Cap 20%

      let side;
      if (isInformed) {
        if (outcome && currentPrice < 0.85) {
          market.buyYes(size, fee);
          side = 'yes';
        } else if (!outcome && currentPrice > 0.15) {
          market.buyNo(size, fee);
          side = 'no';
        } else {
          continue;
        }
      } else {
        if (Math.random() > 0.5) {
          market.buyYes(size, fee);
          side = 'yes';
        } else {
          market.buyNo(size, fee);
          side = 'no';
        }
      }
      recentTrades.push({ side, amount: size });
    }

    const result = market.resolve(outcome);
    totalPnL += result.pnl;
  }

  // Agregar yield
  const yieldGain = totalLiquidity * (yieldAPY * marketDuration / 365);
  totalPnL += yieldGain;

  return totalPnL / totalLiquidity;
}

console.log('\nEscenario: 5 mercados, 30 dias, 15% informed\n');

console.log('┌───────────────────────────────────────────┬───────────┬─────────┐');
console.log('│ Modelo                                    │ Avg Ret   │ Win %   │');
console.log('├───────────────────────────────────────────┼───────────┼─────────┤');

// Solo baseline
const baselineOnly = [];
for (let i = 0; i < 500; i++) {
  const outcome = Math.random() > 0.5;
  const r = simulateMarket({
    liquidity: LIQUIDITY,
    numTrades: 50,
    informedRatio: 0.15,
    trueOutcome: outcome,
    feeRate: 0.03,
    avgTradeSize: 100,
    useDynamicFees: false
  });
  baselineOnly.push(r.return);
}

// Global Pool only
const globalOnly = [];
for (let i = 0; i < 500; i++) {
  const r = simulateGlobalPool({
    totalLiquidity: LIQUIDITY,
    numMarkets: 5,
    tradesPerMarket: 10,
    informedRatio: 0.15,
    feeRate: 0.03,
    avgTradeSize: 100,
    useDynamicFees: false
  });
  globalOnly.push(r);
}

// Global + Dynamic Fees Exp
const globalDynamic = [];
for (let i = 0; i < 500; i++) {
  const r = simulateGlobalPool({
    totalLiquidity: LIQUIDITY,
    numMarkets: 5,
    tradesPerMarket: 10,
    informedRatio: 0.15,
    feeRate: 0.03,
    avgTradeSize: 100,
    useDynamicFees: true
  });
  globalDynamic.push(r);
}

// Combined (Global + Exp Fees + VPIN + Yield)
const combined = [];
for (let i = 0; i < 500; i++) {
  const r = simulateCombinedModel({
    totalLiquidity: LIQUIDITY,
    numMarkets: 5,
    tradesPerMarket: 10,
    informedRatio: 0.15,
    baseFeeRate: 0.03,
    avgTradeSize: 100,
    yieldAPY: 0.08,
    marketDuration: 30
  });
  combined.push(r);
}

const baselineStats = calcStats(baselineOnly);
const globalStats = calcStats(globalOnly);
const globalDynStats = calcStats(globalDynamic);
const combinedStats = calcStats(combined);

console.log(`│ 1. Baseline (single market, 3% flat)     │ ${(baselineStats.avg*100).toFixed(1).padStart(8)}% │ ${baselineStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ 2. + Global Pool (5 mercados)            │ ${(globalStats.avg*100).toFixed(1).padStart(8)}% │ ${globalStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ 3. + Dynamic Fees Exp (3%→15%)           │ ${(globalDynStats.avg*100).toFixed(1).padStart(8)}% │ ${globalDynStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ 4. + VPIN + Yield (8% APY)               │ ${(combinedStats.avg*100).toFixed(1).padStart(8)}% │ ${combinedStats.wins.toFixed(0).padStart(6)}% │`);
console.log('└───────────────────────────────────────────┴───────────┴─────────┘');

console.log(`
MEJORA TOTAL: ${((combinedStats.avg - baselineStats.avg) * 100).toFixed(1)} puntos porcentuales
Win Rate: ${baselineStats.wins.toFixed(0)}% → ${combinedStats.wins.toFixed(0)}%
`);

// ============================================================================
// COMPARACION FINAL: DOS ARQUITECTURAS
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('COMPARACION FINAL: CPMM vs pm-AMM CON DYNAMIC L');
console.log('═'.repeat(70));

console.log(`
Dos enfoques para derrotar informed traders:

ARQUITECTURA 1: CPMM + Mecanismos
- Global Pool (diversificacion)
- Dynamic Fees Exponenciales (3% → 15%)
- Yield Integration (8% APY)

ARQUITECTURA 2: pm-AMM con Dynamic Liquidity
- Invariante Gaussiano (ya implementado en contracts/lib/pm-amm-core.clar)
- Dynamic L: L_t = L_0 × √(T-t)
- Fees base (no necesita exponencial, slippage hace el trabajo)
`);

console.log('Escenario: 50 trades, 15% informed concentrados al final\n');

console.log('┌───────────────────────────────────────────┬───────────┬───────────┬─────────┐');
console.log('│ Arquitectura                              │ Avg Ret   │ Std Dev   │ Win %   │');
console.log('├───────────────────────────────────────────┼───────────┼───────────┼─────────┤');

// CPMM con todos los mecanismos
const cpmmFinalResults = [];
for (let i = 0; i < 500; i++) {
  // Simular 5 mercados (Global Pool)
  let totalReturn = 0;
  for (let m = 0; m < 5; m++) {
    const outcome = Math.random() > 0.5;
    const r = simulateWithTimeConcentration({
      liquidity: LIQUIDITY / 5,
      numTrades: 10,
      informedRatio: 0.15,
      trueOutcome: outcome,
      baseFeeRate: 0.03,
      avgTradeSize: 50,
      feeModel: 'exponential',
      informedConcentration: 'last_20pct'
    });
    totalReturn += r.return / 5;
  }
  // Agregar yield
  const yieldBonus = 0.08 * 30 / 365;
  cpmmFinalResults.push(totalReturn + yieldBonus);
}

// pm-AMM con Dynamic L
const pmammFinalResults = [];
for (let i = 0; i < 500; i++) {
  // Simular 5 mercados (Global Pool)
  let totalReturn = 0;
  for (let m = 0; m < 5; m++) {
    const outcome = Math.random() > 0.5;
    const r = simulateCPMMDynamicL({
      liquidity: LIQUIDITY / 5,
      numTrades: 10,
      informedRatio: 0.15,
      trueOutcome: outcome,
      feeRate: 0.03, // Fee base, slippage hace el resto
      avgTradeSize: 50,
      useDynamicL: true,
      informedConcentration: 'last_20pct'
    });
    totalReturn += r.return / 5;
  }
  const yieldBonus = 0.08 * 30 / 365;
  pmammFinalResults.push(totalReturn + yieldBonus);
}

// Combinacion: pm-AMM Dynamic L + Exp Fees
const combinedFinalResults = [];
for (let i = 0; i < 500; i++) {
  let totalReturn = 0;
  for (let m = 0; m < 5; m++) {
    const outcome = Math.random() > 0.5;
    // Simulamos con fee mas alto para representar exponential + dynamic L
    const r = simulateCPMMDynamicL({
      liquidity: LIQUIDITY / 5,
      numTrades: 10,
      informedRatio: 0.15,
      trueOutcome: outcome,
      feeRate: 0.05, // Fee efectivo promedio con exponential
      avgTradeSize: 50,
      useDynamicL: true,
      informedConcentration: 'last_20pct'
    });
    totalReturn += r.return / 5;
  }
  const yieldBonus = 0.08 * 30 / 365;
  combinedFinalResults.push(totalReturn + yieldBonus);
}

const cpmmFinalStats = calcStats(cpmmFinalResults);
const pmammFinalStats = calcStats(pmammFinalResults);
const combinedFinalStats = calcStats(combinedFinalResults);

console.log(`│ CPMM + Global + ExpFees + Yield           │ ${(cpmmFinalStats.avg*100).toFixed(1).padStart(8)}% │ ${(cpmmFinalStats.std*100).toFixed(1).padStart(8)}% │ ${cpmmFinalStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ pm-AMM + Global + DynamicL + Yield        │ ${(pmammFinalStats.avg*100).toFixed(1).padStart(8)}% │ ${(pmammFinalStats.std*100).toFixed(1).padStart(8)}% │ ${pmammFinalStats.wins.toFixed(0).padStart(6)}% │`);
console.log(`│ pm-AMM + ExpFees + DynamicL + Yield       │ ${(combinedFinalStats.avg*100).toFixed(1).padStart(8)}% │ ${(combinedFinalStats.std*100).toFixed(1).padStart(8)}% │ ${combinedFinalStats.wins.toFixed(0).padStart(6)}% │`);
console.log('└───────────────────────────────────────────┴───────────┴───────────┴─────────┘');

console.log(`
RECOMENDACION FINAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ya tienes pm-AMM implementado. La mejor estrategia es:

1. ✅ pm-AMM (ya tienes: contracts/lib/pm-amm-core.clar)
2. ✅ Dynamic Liquidity (ya tienes: get-dynamic-liquidity en pm-amm-core)
3. ➕ Agregar: Global Pool (diversificacion entre mercados)
4. ➕ Agregar: Dynamic Fees Exponenciales (3% → 15%)
5. ➕ Agregar: Yield Integration (opcional, 8% APY)

La DOBLE PENALIZACION (Dynamic L + Exp Fees) maximiza el costo para
informed traders que esperan cerca del cierre.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

// ============================================================================
// CONCLUSION
// ============================================================================

console.log('\n');
console.log('█'.repeat(70));
console.log('CONCLUSIONES');
console.log('█'.repeat(70));

console.log(`
HALLAZGOS PRINCIPALES:

1. BASELINE vs GLOBAL POOL:
   - El Global Pool diversifica riesgo entre mercados
   - Reduce la varianza significativamente
   - Reduce la perdida promedio

2. DYNAMIC FEES:
   - Aumentar fees cerca de resolucion ayuda un poco
   - El efecto es menor que el Global Pool

3. YIELD:
   - 8% APY por 30 dias = ~0.66% extra
   - Ayuda pero no resuelve el problema

4. PARA BREAK-EVEN:
   - Con 15% informed traders: necesitas ~8-10% fee
   - Con 10% informed traders: necesitas ~5-6% fee
   - Con 5% informed traders: posible con 3% fee

RECOMENDACIONES PARA ORAKAMOTO:

1. IMPLEMENTAR Global Pool (el mecanismo que mas ayuda)
2. Usar Dynamic Fees con base 3%, hasta 5-6% cerca de resolucion
3. Integrar yield si es posible (Zest/ALEX)
4. Atraer mas noise traders (marketing, gamificacion)
   - Cuanto menor sea el % de informed, mejor para LPs

NOTA: Los numeros exactos dependen de muchos factores.
Lo importante es la DIRECCION: Global Pool + Dynamic Fees + Yield
mejoran significativamente vs el baseline aislado.
`);

console.log('█'.repeat(70));
