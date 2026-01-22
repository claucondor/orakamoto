#!/usr/bin/env node

/**
 * Bridge USDC from Ethereum Sepolia to USDCx on Stacks Testnet
 * Using Circle's xReserve protocol programmatically
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  keccak256,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Configuration
const config = {
  // Ethereum Sepolia
  ETHEREUM_RPC: "https://ethereum-sepolia.publicnode.com",
  ETHEREUM_PRIVATE_KEY: "0xb5df658e2fc14c0ad23220979863cf70e15bc83b41a1c08ee5e262258e2aec0a",

  // Contracts on Sepolia
  USDC_CONTRACT: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  XRESERVE_CONTRACT: "0x008888878f94C0d87defdf0B07f46B93C1934442",

  // Stacks
  STACKS_DOMAIN: 10003,  // Stacks domain ID in xReserve
  STACKS_RECIPIENT: "STC5KHM41H6WHAST7MWWDD807YSPRQKJ68T330BQ",

  // Deposit amount
  DEPOSIT_AMOUNT: "20", // USDC to bridge
};

// ERC-20 ABI (approve, balanceOf)
const ERC20_ABI = [
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

// xReserve ABI (depositToRemote)
const XRESERVE_ABI = [
  {
    inputs: [
      { name: "value", type: "uint256" },
      { name: "remoteDomain", type: "uint32" },
      { name: "remoteRecipient", type: "bytes32" },
      { name: "localToken", type: "address" },
      { name: "maxFee", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
    name: "depositToRemote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       PROGRAMMATIC USDC → USDCx BRIDGE                    ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log("║  From: Ethereum Sepolia                                   ║");
  console.log("║  To:   Stacks Testnet                                     ║");
  console.log(`║  Amount: ${config.DEPOSIT_AMOUNT} USDC                                      ║`);
  console.log(`║  Destination: ${config.STACKS_RECIPIENT}    ║`);
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("");

  // Setup account and clients
  const account = privateKeyToAccount(config.ETHEREUM_PRIVATE_KEY);
  console.log(`Using account: ${account.address}\n`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(config.ETHEREUM_RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(config.ETHEREUM_RPC),
  });

  // Step 1: Check USDC balance
  console.log("Step 1: Checking USDC balance...");
  const balance = await publicClient.readContract({
    address: config.USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`  ✓ Balance: ${formatUnits(balance, 6)} USDC`);

  const value = parseUnits(config.DEPOSIT_AMOUNT, 6);
  if (balance < value) {
    console.log(`  ✗ Insufficient balance! Need ${config.DEPOSIT_AMOUNT} USDC`);
    process.exit(1);
  }

  // Step 2: Check/set allowance
  console.log("\nStep 2: Checking xReserve allowance...");
  const allowance = await publicClient.readContract({
    address: config.USDC_CONTRACT,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, config.XRESERVE_CONTRACT],
  });
  console.log(`  Current allowance: ${formatUnits(allowance, 6)} USDC`);

  if (allowance < value) {
    console.log("  Approving xReserve to spend USDC...");
    const approveTx = await walletClient.writeContract({
      address: config.USDC_CONTRACT,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [config.XRESERVE_CONTRACT, value],
    });
    console.log(`  ✓ Approval tx: ${approveTx}`);

    console.log("  Waiting for confirmation...");
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log("  ✓ Approved!");
  } else {
    console.log("  ✓ Already approved");
  }

  // Step 3: Encode recipient address
  console.log("\nStep 3: Encoding Stacks recipient address...");

  // Convert Stacks address to bytes and hash it
  const encoder = new TextEncoder();
  const recipientBytes = encoder.encode(config.STACKS_RECIPIENT);
  const remoteRecipientBytes32 = keccak256(recipientBytes);

  // Encode as hex for hookData
  const hookData = "0x" + Buffer.from(recipientBytes).toString("hex");

  console.log(`  Recipient: ${config.STACKS_RECIPIENT}`);
  console.log(`  Bytes32 hash: ${remoteRecipientBytes32}`);
  console.log(`  Hook data: ${hookData}`);

  // Step 4: Calculate max fee (1% of deposit)
  const maxFee = value / 100n;
  console.log(`\nStep 4: Setting max fee to ${formatUnits(maxFee, 6)} USDC (1%)`);

  // Step 5: Call depositToRemote
  console.log("\nStep 5: Bridging USDC to Stacks...");
  console.log("  This will take approximately 15 minutes after confirmation...");

  const depositTx = await walletClient.writeContract({
    address: config.XRESERVE_CONTRACT,
    abi: XRESERVE_ABI,
    functionName: "depositToRemote",
    args: [
      value,                      // uint256 value
      config.STACKS_DOMAIN,       // uint32 remoteDomain (10003 for Stacks)
      remoteRecipientBytes32,     // bytes32 remoteRecipient (keccak256 of address)
      config.USDC_CONTRACT,       // address localToken
      maxFee,                     // uint256 maxFee
      hookData,                   // bytes hookData (hex-encoded address)
    ],
  });

  console.log(`  ✓ Bridge tx submitted: ${depositTx}`);

  console.log("  Waiting for confirmation...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);

  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  ✅ Bridge transaction successful!                        ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log(`║  Transaction: ${depositTx}  ║`);
  console.log(`║  Amount: ${config.DEPOSIT_AMOUNT} USDC → USDCx                              ║`);
  console.log(`║  Destination: ${config.STACKS_RECIPIENT}    ║`);
  console.log("║                                                           ║");
  console.log("║  ⏳ Waiting for bridge to complete (~15 minutes)          ║");
  console.log("║  Monitor your wallet with:                                ║");
  console.log("║  ./scripts/monitor-hackathon-wallet.sh                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
