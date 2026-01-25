// Check all USDCx transfers related to the contract

const transactions = [
  { name: 'Create Market 1', txid: '4f8f65c67ecb9417bb80a471405c5e82d89392b82fc941889e3476c0780f1a7f' },
  { name: 'Buy YES', txid: '10534da11beefc6b113017d07134d6679fb5d8da52a37b2aa04f435e5837f056' },
  { name: 'Buy NO', txid: '3e607eab3b0026aac005a7727a7b5843423c23c776bf3c023b5b7f9de53aec0c' },
  { name: 'Claim', txid: '3b9e14161ff67782f106f3872123dbba5d190f538be74571bff4610669805c20' },
];

async function checkTx(tx) {
  try {
    const response = await fetch(`https://api.testnet.hiro.so/extended/v1/tx/0x${tx.txid}`);
    const data = await response.json();
    
    console.log(`\n${tx.name}:`);
    console.log(`  Status: ${data.tx_status}`);
    console.log(`  Result: ${data.tx_result?.repr}`);
    
    if (data.events) {
      const ftEvents = data.events.filter(e => e.event_type === 'ft_transfer_event');
      ftEvents.forEach(event => {
        const amount = Number(event.asset?.amount) / 1000000;
        console.log(`  Transfer: ${amount} USDC`);
        console.log(`    From: ${event.asset?.sender}`);
        console.log(`    To: ${event.asset?.recipient}`);
      });
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}

async function main() {
  console.log('===========================================');
  console.log('USDCx Flow Analysis');
  console.log('===========================================');
  
  for (const tx of transactions) {
    await checkTx(tx);
  }
}

main().catch(console.error);
