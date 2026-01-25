/**
 * Step 8: Remove LP liquidity
 *
 * Removes liquidity from a market.
 * The LP (market creator) can withdraw their liquidity + accumulated fees.
 */
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  PostConditionMode,
} from '@stacks/transactions';
import { generateWallet } from '@stacks/wallet-sdk';
import { DEPLOYER, MNEMONIC, NETWORK, waitForTx } from './config.mjs';

const API = 'https://api.testnet.hiro.so';

// Get LP balance for a user
async function getLPBalance(marketId, address) {
  const url = `${API}/v2/contracts/call-read/${DEPLOYER}/sip013-lp-token/get-balance`;

  // Encode market-id as uint
  const marketIdHex = '0x01' + marketId.toString(16).padStart(32, '0');
  // Encode address as principal
  const addressHex = encodePrincipal(address);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: DEPLOYER,
      arguments: [marketIdHex, addressHex],
    }),
  });

  const data = await response.json();
  console.log('LP Balance raw response:', data);
  if (data.okay && data.result) {
    // Parse (ok uint) response - 0x07 = ok, 0x01 = uint, then 16 bytes
    const hex = data.result;
    console.log('Result hex:', hex);
    if (hex.startsWith('0x0701')) {
      const numHex = hex.slice(6); // Skip '0x0701'
      return BigInt('0x' + numHex);
    }
  }
  return BigInt(0);
}

// Simple principal encoding
function encodePrincipal(address) {
  // Standard principal encoding: 0x05 + version byte + hash160
  const c32Alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // Get version from prefix (ST = testnet standard = 0x1a)
  const version = address.startsWith('ST') ? 0x1a : 0x16;

  // Decode c32 address (skip ST/SP prefix)
  const addrPart = address.substring(2);
  let result = BigInt(0);
  for (const char of addrPart) {
    const index = c32Alphabet.indexOf(char.toUpperCase());
    if (index === -1) continue;
    result = result * BigInt(32) + BigInt(index);
  }

  // Convert to bytes (includes checksum, we need to extract hash160)
  const fullHex = result.toString(16).padStart(44, '0');
  const hash160 = fullHex.slice(0, 40); // First 20 bytes are the hash160

  return '0x05' + version.toString(16).padStart(2, '0') + hash160;
}

async function main() {
  const marketId = 1;

  console.log('===========================================');
  console.log('Step 8: Remove LP Liquidity');
  console.log('===========================================\n');

  // Generate wallet from mnemonic
  const wallet = await generateWallet({ secretKey: MNEMONIC, password: '' });
  const account = wallet.accounts[0];
  const privateKey = account.stxPrivateKey;

  console.log('Market ID:', marketId);
  console.log('LP Address:', DEPLOYER);
  console.log('');

  // Get LP balance
  const lpBalance = await getLPBalance(marketId, DEPLOYER);
  console.log('LP Token Balance:', Number(lpBalance) / 1000000, 'LP');

  if (lpBalance === BigInt(0)) {
    console.log('\nNo LP tokens to withdraw.');
    return;
  }

  console.log('');

  // Build transaction to remove all liquidity
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: 'multi-market-pool-v3',
    functionName: 'remove-liquidity',
    functionArgs: [
      uintCV(marketId),
      uintCV(lpBalance),
    ],
    senderKey: privateKey,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    fee: 50000n,
  };

  console.log('Building transaction...');
  const tx = await makeContractCall(txOptions);

  console.log('Broadcasting...');
  const result = await broadcastTransaction({ transaction: tx, network: NETWORK });

  if (result.error) {
    console.error('Broadcast error:', result.error);
    console.error('Reason:', result.reason);
    process.exit(1);
  }

  console.log('\nTransaction broadcast successfully!');
  console.log('TxID:', result.txid);

  await waitForTx(result.txid);

  console.log('\n===========================================');
  console.log('Liquidity removed successfully!');
  console.log('===========================================');
}

main().catch(console.error);
