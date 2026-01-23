const {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  uintCV,
  standardPrincipalCV,
  noneCV,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardFungiblePostCondition,
} = require('@stacks/transactions');
const { STACKS_TESTNET } = require('@stacks/network');

const DEPLOYER_PK = 'bfba61ee21e8e532f9c05c574fefffc8efc5936c0cec69107a0b29d6aacdf61c01';
const DEPLOYER_ADDR = 'ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC';

const USDCX_ADDRESS = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
const USDCX_NAME = 'usdcx';
const USDCX_ASSET = 'usdcx-token';

const transfers = [
  { to: 'ST23FF3CP9D662CJ5PG2TH8NJNAQ2Y0R002BF7QAK', amount: 10000000, name: 'user1' },
  { to: 'ST14NQ2NWE26YVB4YR9Y82AY03KG00RTNSJNYHMW7', amount: 10000000, name: 'user2' },
  { to: 'ST1DPEBJA5AZZGW958NMV8QRBY9H9E1B3P107YCBX', amount: 10000000, name: 'user3' },
];

async function getNonce() {
  const res = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${DEPLOYER_ADDR}/nonces`);
  const data = await res.json();
  return data.possible_next_nonce;
}

async function transferUSDCx(to, amount, name, nonce) {
  console.log(`\nTransfiriendo 10 USDCx a ${name} (${to})...`);
  console.log(`Nonce: ${nonce}`);

  const txOptions = {
    contractAddress: USDCX_ADDRESS,
    contractName: USDCX_NAME,
    functionName: 'transfer',
    functionArgs: [
      uintCV(amount),
      standardPrincipalCV(DEPLOYER_ADDR),
      standardPrincipalCV(to),
      noneCV(),
    ],
    senderKey: DEPLOYER_PK,
    network: STACKS_TESTNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    nonce: nonce,
    fee: 10000n,
  };

  try {
    const tx = await makeContractCall(txOptions);
    const result = await broadcastTransaction({ transaction: tx, network: STACKS_TESTNET });

    if (result.error) {
      console.error(`❌ Error: ${result.error}`);
      console.error(`Reason: ${result.reason}`);
      return null;
    }

    const txid = result.txid || result;
    console.log(`✅ TX: ${txid}`);
    console.log(`   https://explorer.hiro.so/txid/${txid}?chain=testnet`);
    return txid;
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Transfiriendo USDCx a users de prueba');
  console.log('='.repeat(60));

  let nonce = await getNonce();
  console.log(`Nonce inicial: ${nonce}`);

  for (const t of transfers) {
    await transferUSDCx(t.to, t.amount, t.name, nonce);
    nonce++;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Transferencias enviadas. Espera ~1-2 min para confirmación.');
  console.log('='.repeat(60));
}

main();
