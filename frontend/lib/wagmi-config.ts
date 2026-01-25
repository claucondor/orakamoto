import { http, createConfig } from 'wagmi';
import { sepolia, mainnet } from 'wagmi/chains';

export const wagmiConfig = createConfig({
  chains: [sepolia, mainnet],
  transports: {
    [sepolia.id]: http('https://ethereum-sepolia.publicnode.com'),
    [mainnet.id]: http('https://eth.llamarpc.com'),
  },
});

// xReserve contract addresses
export const XRESERVE_CONTRACTS = {
  sepolia: '0x008888878f94C0d87defdf0B07f46B93C1934442',
  mainnet: '0x0000000000000000000000000000000000000000', // TODO: Add mainnet address
};

// USDC contract addresses
export const USDC_CONTRACTS = {
  sepolia: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  mainnet: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
};

// Stacks domain ID for xReserve
export const STACKS_DOMAIN = 10003;

// ERC20 ABI for approve and balanceOf
export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// xReserve ABI for depositToRemote
export const XRESERVE_ABI = [
  {
    name: 'depositToRemote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'value', type: 'uint256' },
      { name: 'remoteDomain', type: 'uint32' },
      { name: 'remoteRecipient', type: 'bytes32' },
      { name: 'localToken', type: 'address' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

// Encode Stacks address to bytes32 for xReserve
// This uses the same encoding as the working bridge-testnet.mjs script
export function encodeStacksAddress(stacksAddress: string): `0x${string}` {
  // c32 decode the Stacks address to get the hash160
  const c32Alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // Remove version prefix (ST or SP)
  const address = stacksAddress.substring(2);

  // c32 decode
  let result = BigInt(0);
  for (const char of address) {
    const index = c32Alphabet.indexOf(char.toUpperCase());
    if (index === -1) continue;
    result = result * BigInt(32) + BigInt(index);
  }

  // Convert to bytes32 (padded)
  const hex = result.toString(16).padStart(40, '0');
  return `0x000000000000000000000000${hex}` as `0x${string}`;
}
