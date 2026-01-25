/**
 * Step 4: Check market prices and balances
 *
 * Read-only calls to check market state.
 */
import { DEPLOYER, getBlockHeight } from './config.mjs';

const API = 'https://api.testnet.hiro.so';

async function callReadOnly(contractName, functionName, args = []) {
  const url = `${API}/v2/contracts/call-read/${DEPLOYER}/${contractName}/${functionName}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: DEPLOYER,
      arguments: args,
    }),
  });

  const data = await response.json();

  if (!data.okay) {
    console.error('Error:', data);
    return null;
  }

  return data.result;
}

// Parse uint from Clarity hex (0x01 + 16 bytes big-endian)
function parseUint(hex) {
  // Remove 0x prefix and type byte (01 for uint)
  if (hex.startsWith('0x01')) {
    const numHex = hex.slice(4); // Remove '0x01'
    return BigInt('0x' + numHex);
  }
  return BigInt(0);
}

// Extract uint value from a tuple field in hex
function extractUint(hex, fieldName) {
  // Find the field in the hex string (simplified extraction)
  const fieldHex = Buffer.from(fieldName).toString('hex');
  const idx = hex.indexOf(fieldHex);
  if (idx === -1) return null;

  // After field name, skip to the uint value (01 + 16 bytes)
  const afterField = hex.substring(idx + fieldHex.length);
  const uintMatch = afterField.match(/^01([0-9a-f]{32})/);
  if (uintMatch) {
    return BigInt('0x' + uintMatch[1]);
  }
  return null;
}

async function main() {
  const marketId = 2;
  const marketIdArg = '0x0100000000000000000000000000000001'; // uint 1

  console.log('===========================================');
  console.log('Step 4: Check Market Status');
  console.log('===========================================\n');

  const currentBlock = await getBlockHeight();
  console.log('Current block:', currentBlock);
  console.log('Market ID:', marketId);
  console.log('');

  // Get prices
  console.log('--- Prices ---');
  const pricesResult = await callReadOnly('multi-market-pool-v2', 'get-prices', [marketIdArg]);
  const yesPrice = extractUint(pricesResult, 'yes-price');
  const noPrice = extractUint(pricesResult, 'no-price');
  const totalLiq = extractUint(pricesResult, 'total-liquidity');

  if (yesPrice !== null) {
    console.log(`YES price: ${(Number(yesPrice) / 1000000 * 100).toFixed(2)}%`);
    console.log(`NO price:  ${(Number(noPrice) / 1000000 * 100).toFixed(2)}%`);
    console.log(`Total liquidity: ${(Number(totalLiq) / 1000000).toFixed(2)} USDC`);
  }
  console.log('');

  // Get reserves
  console.log('--- Reserves ---');
  const reservesResult = await callReadOnly('multi-market-pool-v2', 'get-reserves', [marketIdArg]);
  const yesReserve = extractUint(reservesResult, 'yes-reserve');
  const noReserve = extractUint(reservesResult, 'no-reserve');

  if (yesReserve !== null) {
    console.log(`YES reserve: ${(Number(yesReserve) / 1000000).toFixed(4)} USDC`);
    console.log(`NO reserve:  ${(Number(noReserve) / 1000000).toFixed(4)} USDC`);
  }
  console.log('');

  // Get market info
  console.log('--- Market Info ---');
  const marketResult = await callReadOnly('multi-market-pool-v2', 'get-market', [marketIdArg]);
  const deadline = extractUint(marketResult, 'deadline');
  const isResolved = marketResult.includes('69732d7265736f6c76656404'); // is-resolved + false

  if (deadline !== null) {
    console.log(`Deadline: block ${deadline}`);
    console.log(`Blocks until deadline: ${Number(deadline) - currentBlock}`);
    console.log(`Is resolved: ${!isResolved}`);
  }
  console.log('');

  // Check if market is active
  console.log('--- Status ---');
  const activeResult = await callReadOnly('multi-market-pool-v2', 'is-market-active', [marketIdArg]);
  const isActive = activeResult === '0x0703'; // (ok true)
  console.log(`Market active: ${isActive}`);

  console.log('\n===========================================');
  console.log('Check complete!');
  console.log('===========================================');
}

main().catch(console.error);
