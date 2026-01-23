'use client';

import { useState, useEffect } from 'react';
import { createPublicClient, createWalletClient, custom, http, parseUnits, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { encodeStacksRecipient, BRIDGE_CONFIG, XRESERVE_ABI, ERC20_ABI } from '@/lib/bridge-helpers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface BridgeProps {
  stacksAddress: string | null;
}

export default function Bridge({ stacksAddress }: BridgeProps) {
  const [ethAddress, setEthAddress] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [amount, setAmount] = useState<string>('10');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');

  // Connect MetaMask
  const connectEth = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask!');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setEthAddress(accounts[0]);

      // Switch to Sepolia
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }], // Sepolia chainId
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xaa36a7',
              chainName: 'Sepolia',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://sepolia.infura.io/v3/'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            }],
          });
        }
      }
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  // Fetch USDC balance
  useEffect(() => {
    if (!ethAddress) return;

    const fetchBalance = async () => {
      const client = createPublicClient({
        chain: sepolia,
        transport: http('https://ethereum-sepolia.publicnode.com'),
      });

      const balance = await client.readContract({
        address: BRIDGE_CONFIG.sepolia.usdc,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [ethAddress as `0x${string}`],
      });

      setUsdcBalance(formatUnits(balance, 6));
    };

    fetchBalance();
  }, [ethAddress]);

  // Execute bridge
  const executeBridge = async () => {
    if (!ethAddress || !stacksAddress || !amount) return;

    setLoading(true);
    setStatus('Preparing transaction...');
    setTxHash('');

    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum),
      });

      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http('https://ethereum-sepolia.publicnode.com'),
      });

      const value = parseUnits(amount, 6);
      const remoteRecipient = encodeStacksRecipient(stacksAddress);

      // Step 1: Approve
      setStatus('Approving USDC spend...');
      const approveHash = await walletClient.writeContract({
        address: BRIDGE_CONFIG.sepolia.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [BRIDGE_CONFIG.sepolia.xReserve, value],
        account: ethAddress as `0x${string}`,
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      setStatus('Approved! Now bridging...');

      // Step 2: Deposit to xReserve
      const depositHash = await walletClient.writeContract({
        address: BRIDGE_CONFIG.sepolia.xReserve,
        abi: XRESERVE_ABI,
        functionName: 'depositToRemote',
        args: [
          value,
          BRIDGE_CONFIG.stacksDomain,
          remoteRecipient,
          BRIDGE_CONFIG.sepolia.usdc,
          0n, // maxFee
          '0x', // hookData
        ],
        account: ethAddress as `0x${string}`,
      });

      setTxHash(depositHash);
      setStatus('Bridge initiated! USDCx will arrive in ~15 minutes.');

      // Update balance
      const newBalance = await publicClient.readContract({
        address: BRIDGE_CONFIG.sepolia.usdc,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [ethAddress as `0x${string}`],
      });
      setUsdcBalance(formatUnits(newBalance, 6));

    } catch (error: any) {
      console.error('Bridge error:', error);
      setStatus(`Error: ${error.message || 'Transaction failed'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 border rounded-lg bg-white shadow">
      <h2 className="text-2xl font-bold mb-4">Bridge USDC → USDCx</h2>
      <p className="text-sm text-gray-600 mb-4">Sepolia → Stacks Testnet</p>

      {/* ETH Wallet */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">Ethereum Wallet (Sepolia)</label>
        {ethAddress ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded">
            <p className="font-mono text-xs break-all">{ethAddress}</p>
            <p className="text-sm mt-1">Balance: <strong>{parseFloat(usdcBalance).toFixed(2)} USDC</strong></p>
          </div>
        ) : (
          <button
            onClick={connectEth}
            className="w-full p-3 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Connect MetaMask
          </button>
        )}
      </div>

      {/* Stacks Recipient */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">Stacks Recipient</label>
        {stacksAddress ? (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="font-mono text-xs break-all">{stacksAddress}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Connect Stacks wallet first</p>
        )}
      </div>

      {/* Amount */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2">Amount (USDC)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500"
          min="1"
          max={usdcBalance}
        />
      </div>

      {/* Bridge Button */}
      <button
        onClick={executeBridge}
        disabled={!ethAddress || !stacksAddress || loading || parseFloat(amount) <= 0}
        className="w-full p-4 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {loading ? 'Processing...' : `Bridge ${amount} USDC → USDCx`}
      </button>

      {/* Status */}
      {status && (
        <div className={`mt-4 p-3 rounded ${txHash ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <p className="text-sm">{status}</p>
          {txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              View on Etherscan →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
