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

function parseUint(hex) {
  if (hex.startsWith('0x01')) {
    const numHex = hex.slice(4);
    return BigInt('0x' + numHex);
  }
  return BigInt(0);
}

function encodePrincipal(address) {
  const c32Alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const version = address.startsWith('ST') ? 0x1a : 0x16;
  const addrPart = address.substring(2);
  let result = BigInt(0);
  for (const char of addrPart) {
    const index = c32Alphabet.indexOf(char.toUpperCase());
    if (index === -1) continue;
    result = result * BigInt(32) + BigInt(index);
  }
  const fullHex = result.toString(16).padStart(44, '0');
  const hash160 = fullHex.slice(0, 40);
  return '0x05' + version.toString(16).padStart(2, '0') + hash160;
}

async function main() {
  const marketId = 1;
  const marketIdHex = '0x01' + marketId.toString(16).padStart(32, '0');
  const deployerHex = encodePrincipal(DEPLOYER);
  const yesOutcome = '0x01' + '00'.padStart(32, '0'); // uint 0
  const noOutcome = '0x01' + '01'.padStart(32, '0');  // uint 1

  console.log('===========================================');
  console.log('Outcome Balances - Market', marketId);
  console.log('===========================================\n');
  console.log('Address:', DEPLOYER);
  console.log('');

  // Get YES balance
  const yesResult = await callReadOnly('multi-market-pool-v3', 'get-outcome-balance', [
    marketIdHex,
    deployerHex,
    yesOutcome
  ]);
  const yesBalance = yesResult ? parseUint(yesResult) : BigInt(0);
  console.log('YES Balance:', Number(yesBalance) / 1000000, 'tokens');

  // Get NO balance
  const noResult = await callReadOnly('multi-market-pool-v3', 'get-outcome-balance', [
    marketIdHex,
    deployerHex,
    noOutcome
  ]);
  const noBalance = noResult ? parseUint(noResult) : BigInt(0);
  console.log('NO Balance:', Number(noBalance) / 1000000, 'tokens');

  console.log('');
  console.log('Total tokens:', Number(yesBalance + noBalance) / 1000000);
}

main().catch(console.error);
