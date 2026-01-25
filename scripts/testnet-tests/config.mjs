// Shared config for testnet test scripts
import { STACKS_TESTNET } from '@stacks/network';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load mnemonic from settings/Testnet.toml (gitignored)
function loadMnemonic() {
  const tomlPath = join(__dirname, '../../settings/Testnet.toml');
  const content = readFileSync(tomlPath, 'utf-8');
  const match = content.match(/mnemonic\s*=\s*"([^"]+)"/);
  if (!match) throw new Error('Mnemonic not found in settings/Testnet.toml');
  return match[1];
}

export const DEPLOYER = 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC';
export const MNEMONIC = loadMnemonic();
export const NETWORK = STACKS_TESTNET;
export const USDCX = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx';

// Contract references
// NOTE: Use V3_1 contracts to avoid LP token accounting issues from v2/v3 sharing same LP token
export const CONTRACTS = {
  // V3 (original - shares LP token with v2, has accounting issues)
  lpToken: `${DEPLOYER}.sip013-lp-token`,
  pool: `${DEPLOYER}.multi-market-pool-v3`,

  // V3.1 (dedicated LP token - recommended for new markets)
  lpTokenV3_1: `${DEPLOYER}.sip013-lp-token-v1-1`,
  poolV3_1: `${DEPLOYER}.multi-market-pool-v3-1`,

  // Shared dependencies
  mathFixedPoint: `${DEPLOYER}.math-fixed-point`,
  pmAmmCore: `${DEPLOYER}.pm-amm-core-v2`,
};

// Default to V3.1 for new scripts (change this to switch versions)
export const POOL_CONTRACT = CONTRACTS.poolV3_1;
export const LP_TOKEN_CONTRACT = CONTRACTS.lpTokenV3_1;

// Helper to wait for transaction confirmation
export async function waitForTx(txId, maxAttempts = 30) {
  console.log(`Waiting for tx: ${txId}`);
  console.log(`Explorer: https://explorer.hiro.so/txid/${txId}?chain=testnet`);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000)); // 10 sec

    const response = await fetch(`https://api.testnet.hiro.so/extended/v1/tx/${txId}`);
    const data = await response.json();

    if (data.tx_status === 'success') {
      console.log('Transaction confirmed!');
      return data;
    } else if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
      console.log('Transaction FAILED:', data.tx_status);
      console.log('Error:', data.tx_result?.repr);
      throw new Error(`Transaction failed: ${data.tx_status}`);
    }

    console.log(`  Attempt ${i + 1}/${maxAttempts} - Status: ${data.tx_status || 'pending'}`);
  }

  throw new Error('Transaction not confirmed in time');
}

// Get current block height
export async function getBlockHeight() {
  const response = await fetch('https://api.testnet.hiro.so/extended/v2/blocks?limit=1');
  const data = await response.json();
  return data.results[0].height;
}
