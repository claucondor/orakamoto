import { pad, toHex, type Hex } from 'viem';

// Stacks address encoding for xReserve
function encodeStacksAddress(address: string): Uint8Array {
  // Parse Stacks address
  const version = address.startsWith('ST') ? 26 : 22; // testnet vs mainnet
  const addressBody = address.slice(2); // Remove ST/SP prefix

  // Decode c32 to get hash160
  const hash160 = c32ToHash160(addressBody);

  // Build 32-byte array: 11 zero bytes + 1 version byte + 20 hash bytes
  const result = new Uint8Array(32);
  result[11] = version;
  result.set(hash160, 12);

  return result;
}

// C32 alphabet
const C32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function c32ToHash160(c32Address: string): Uint8Array {
  // Simple c32 decode (without checksum validation for brevity)
  const bytes: number[] = [];
  let carry = 0;
  let carryBits = 0;

  for (let i = c32Address.length - 1; i >= 0; i--) {
    const char = c32Address[i].toUpperCase();
    const value = C32_ALPHABET.indexOf(char);
    if (value === -1) continue;

    carry = carry | (value << carryBits);
    carryBits += 5;

    while (carryBits >= 8) {
      bytes.unshift(carry & 0xff);
      carry = carry >> 8;
      carryBits -= 8;
    }
  }

  if (carryBits > 0) {
    bytes.unshift(carry);
  }

  // Return last 20 bytes (hash160)
  return new Uint8Array(bytes.slice(-20));
}

export function bytes32FromBytes(bytes: Uint8Array): Hex {
  return toHex(bytes);
}

export function encodeStacksRecipient(stacksAddress: string): Hex {
  const encoded = encodeStacksAddress(stacksAddress);
  return bytes32FromBytes(encoded);
}

// Contract addresses
export const BRIDGE_CONFIG = {
  sepolia: {
    xReserve: '0x008888878f94C0d87defdf0B07f46B93C1934442' as const,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const,
  },
  stacksDomain: 10003,
};

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
    outputs: [{ name: 'remaining', type: 'uint256' }],
  },
] as const;
