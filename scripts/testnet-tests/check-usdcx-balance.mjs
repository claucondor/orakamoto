import { callReadOnlyFunction, cvToValue, principalCV } from '@stacks/transactions';
import { DEPLOYER, NETWORK } from './config.mjs';

async function main() {
  const result = await callReadOnlyFunction({
    network: NETWORK,
    contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    contractName: 'usdcx',
    functionName: 'get-balance',
    functionArgs: [principalCV(DEPLOYER)],
    senderAddress: DEPLOYER,
  });

  const value = cvToValue(result, true);
  const balance = BigInt(value.value || 0);
  
  console.log('USDCx Balance:', Number(balance) / 1000000, 'USDC');
}

main().catch(console.error);
