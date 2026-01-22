const { generateWallet } = require('@stacks/wallet-sdk');
const { getAddressFromPrivateKey } = require('@stacks/transactions');
const { STACKS_TESTNET } = require('@stacks/network');

async function main() {
  const mnemonic = "concert steel wedding pill life long hurdle model glass cousin shy immune expire poet sword luxury stove mask quiz useful lift balance virus security";
  const wallet = await generateWallet({ secretKey: mnemonic, password: '' });
  const account = wallet.accounts[0];

  // Generate testnet address (ST prefix) from private key
  const testnetAddr = getAddressFromPrivateKey(account.stxPrivateKey, STACKS_TESTNET);
  console.log(JSON.stringify({ testnetAddress: testnetAddr, mnemonic }, null, 2));
}
main();
