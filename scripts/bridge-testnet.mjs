import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { bytes32FromBytes, remoteRecipientCoder } from "./helpers.mjs";

// ============ Configuration ============
const config = {
  ETH_RPC_URL: "https://ethereum-sepolia.publicnode.com",
  PRIVATE_KEY: "0xb5df658e2fc14c0ad23220979863cf70e15bc83b41a1c08ee5e262258e2aec0a",

  // Contract addresses on Sepolia testnet
  X_RESERVE_CONTRACT: "008888878f94C0d87defdf0B07f46B93C1934442",
  ETH_USDC_CONTRACT: "1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",

  // Stacks testnet
  STACKS_DOMAIN: 10003,
  STACKS_RECIPIENT: "ST586FMJ5ZFHWCF3YSYVABAS9KRE9Y8QXB0HAVMT", // User wallet

  DEPOSIT_AMOUNT: "20.00", // 20 USDC
  MAX_FEE: "0",
};

// ============ ABIs ============
const X_RESERVE_ABI = [
  {
    name: "depositToRemote",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "value", type: "uint256" },
      { name: "remoteDomain", type: "uint32" },
      { name: "remoteRecipient", type: "bytes32" },
      { name: "localToken", type: "address" },
      { name: "maxFee", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
];

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
];

async function deposit() {
  const account = privateKeyToAccount(config.PRIVATE_KEY);
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(config.ETH_RPC_URL),
  });

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(config.ETH_RPC_URL),
  });

  console.log(`ETH Wallet: ${account.address}`);
  console.log(`Stacks Recipient: ${config.STACKS_RECIPIENT}`);

  // Check ETH balance
  const nativeBalance = await publicClient.getBalance({ address: account.address });
  console.log(`ETH Balance: ${(Number(nativeBalance) / 1e18).toFixed(6)} ETH`);
  if (nativeBalance === 0n) throw new Error("No ETH for gas");

  // Prepare deposit params
  const value = parseUnits(config.DEPOSIT_AMOUNT, 6);
  const maxFee = parseUnits(config.MAX_FEE, 6);
  const remoteRecipient = bytes32FromBytes(remoteRecipientCoder.encode(config.STACKS_RECIPIENT));
  const hookData = "0x";

  console.log(`\nDepositing ${config.DEPOSIT_AMOUNT} USDC → USDCx on Stacks testnet`);
  console.log(`Remote Recipient (encoded): ${remoteRecipient}`);

  // Check USDC balance
  const usdcBalance = await publicClient.readContract({
    address: `0x${config.ETH_USDC_CONTRACT}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`USDC Balance: ${(Number(usdcBalance) / 1e6).toFixed(6)} USDC`);

  if (usdcBalance < value) {
    throw new Error(`Insufficient USDC. Need: ${config.DEPOSIT_AMOUNT}, Have: ${(Number(usdcBalance) / 1e6).toFixed(6)}`);
  }

  // Approve xReserve
  console.log("\n1. Approving xReserve to spend USDC...");
  const approveTxHash = await client.writeContract({
    address: `0x${config.ETH_USDC_CONTRACT}`,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [`0x${config.X_RESERVE_CONTRACT}`, value],
  });
  console.log(`   Approve TX: ${approveTxHash}`);
  await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
  console.log("   ✅ Approved");

  // Deposit to remote
  console.log("\n2. Depositing to xReserve...");
  const depositTxHash = await client.writeContract({
    address: `0x${config.X_RESERVE_CONTRACT}`,
    abi: X_RESERVE_ABI,
    functionName: "depositToRemote",
    args: [
      value,
      config.STACKS_DOMAIN,
      remoteRecipient,
      `0x${config.ETH_USDC_CONTRACT}`,
      maxFee,
      hookData,
    ],
  });
  console.log(`   Deposit TX: ${depositTxHash}`);
  console.log("   ✅ Submitted!");

  console.log(`\n🎉 Bridge initiated! USDCx should arrive in ~15 minutes.`);
  console.log(`   Track on Etherscan: https://sepolia.etherscan.io/tx/${depositTxHash}`);
  console.log(`   Check Stacks balance: https://explorer.hiro.so/address/${config.STACKS_RECIPIENT}?chain=testnet`);
}

deposit().catch(console.error);
