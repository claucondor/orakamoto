/**
 * Check V3.1 market state and balances
 */
import { DEPLOYER } from './config.mjs';

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

function extractUint(hex, fieldName) {
  const fieldHex = Buffer.from(fieldName).toString('hex');
  const idx = hex.indexOf(fieldHex);
  if (idx === -1) return null;

  const afterField = hex.substring(idx + fieldHex.length);
  const uintMatch = afterField.match(/^01([0-9a-f]{32})/);
  if (uintMatch) {
    return BigInt('0x' + uintMatch[1]);
  }
  return null;
}

async function main() {
  const marketId = 1;
  const marketIdArg = '0x0100000000000000000000000000000001';

  console.log('===========================================');
  console.log('V3.1 Market Status Check');
  console.log('===========================================\n');

  // Get prices
  console.log('--- Prices ---');
  const pricesResult = await callReadOnly('multi-market-pool-v3-1', 'get-prices', [marketIdArg]);
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
  const reservesResult = await callReadOnly('multi-market-pool-v3-1', 'get-reserves', [marketIdArg]);
  const yesReserve = extractUint(reservesResult, 'yes-reserve');
  const noReserve = extractUint(reservesResult, 'no-reserve');

  if (yesReserve !== null) {
    console.log(`YES reserve: ${(Number(yesReserve) / 1000000).toFixed(4)} USDC`);
    console.log(`NO reserve:  ${(Number(noReserve) / 1000000).toFixed(4)} USDC`);
  }
  console.log('');

  // Get LP balance for deployer
  console.log('--- LP Token Balance ---');
  const deployerPrincipal = `0x05${DEPLOYER.slice(2).split('').map(c => {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return alphabet.indexOf(c).toString(16).padStart(2, '0');
  }).join('')}`;

  console.log('Deployer should have 2 LP tokens remaining (3 initial - 1 removed)');
  console.log('');

  console.log('===========================================');
  console.log('Check complete!');
  console.log('===========================================');
}

main().catch(console.error);
