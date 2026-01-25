import { DEPLOYER } from './config.mjs';

const API = 'https://api.testnet.hiro.so';

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

async function getUSDCxBalance(address) {
  const url = `${API}/v2/contracts/call-read/ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM/usdcx/get-balance`;
  const addressHex = encodePrincipal(address);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: address,
      arguments: [addressHex],
    }),
  });

  const data = await response.json();
  if (data.okay && data.result) {
    const hex = data.result;
    if (hex.startsWith('0x0701')) {
      const numHex = hex.slice(6);
      return BigInt('0x' + numHex);
    }
  }
  return BigInt(0);
}

async function main() {
  console.log('===========================================');
  console.log('Contract USDCx Balance');
  console.log('===========================================\n');
  
  // Check multi-market-pool-v3 contract balance
  const contractAddress = `${DEPLOYER}.multi-market-pool-v3`;
  const balance = await getUSDCxBalance(contractAddress);
  
  console.log('Contract:', contractAddress);
  console.log('USDCx Balance:', Number(balance) / 1000000, 'USDCx');
  console.log('');
}

main().catch(console.error);
