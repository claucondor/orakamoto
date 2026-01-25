import { DEPLOYER } from './config.mjs';

const API = 'https://api.testnet.hiro.so';

// Known addresses from testnet deployment config
const ADDRESSES = {
  'Deployer': 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC',
  'User1 (trader)': 'ST23FF3CP9D662CJ5PG2TH8NJNAQ2Y0R002BF7QAK',
  'User2 (trader)': 'ST14NQ2NWE26YVB4YR9Y82AY03KG00RTNSJNYHMW7',
  'User3 (trader)': 'ST1DPEBJA5AZZGW958NMV8QRBY9H9E1B3P107YCBX',
  'External User': 'ST586FMJ5ZFHWCF3YSYVABAS9KRE9Y8QXB0HAVMT',
};

async function getUSDCxBalance(address) {
  const url = `${API}/extended/v1/address/${address}/balances`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const tokenKey = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx::usdcx-token';
    if (data.fungible_tokens && data.fungible_tokens[tokenKey]) {
      return BigInt(data.fungible_tokens[tokenKey].balance);
    }
  } catch (e) {
    console.error(`Error fetching balance for ${address}:`, e.message);
  }
  return BigInt(0);
}

console.log('===========================================');
console.log('USDCx Balances - All Wallets');
console.log('===========================================\n');

let totalBalance = BigInt(0);

// Check balances for all known addresses
for (const [label, address] of Object.entries(ADDRESSES)) {
  const balance = await getUSDCxBalance(address);
  console.log(`${label}: ${address}`);
  console.log(`Balance: ${Number(balance) / 1000000} USDCx\n`);
  totalBalance += balance;
}

console.log('===========================================');
console.log(`Total: ${Number(totalBalance) / 1000000} USDCx`);
console.log('===========================================');
