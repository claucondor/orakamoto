'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { parseUnits, formatUnits } from 'viem';
import { useWalletStore } from '@/lib/store';
import {
  XRESERVE_CONTRACTS,
  USDC_CONTRACTS,
  STACKS_DOMAIN,
  ERC20_ABI,
  XRESERVE_ABI,
  encodeStacksAddress,
} from '@/lib/wagmi-config';
import {
  ArrowLeft,
  ArrowRight,
  Wallet,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Globe,
  Lock,
} from 'lucide-react';

export default function BridgePage() {
  const [mounted, setMounted] = useState(false);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'idle' | 'approving' | 'bridging' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);
  const [network, setNetwork] = useState<'testnet' | 'mainnet'>('testnet');

  // Stacks wallet
  const { address: stacksAddress, isConnected: stacksConnected } = useWalletStore();

  // ETH wallet (wagmi)
  const { address: ethAddress, isConnected: ethConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // Contract addresses based on network
  const usdcAddress = network === 'testnet' ? USDC_CONTRACTS.sepolia : USDC_CONTRACTS.mainnet;
  const xreserveAddress = network === 'testnet' ? XRESERVE_CONTRACTS.sepolia : XRESERVE_CONTRACTS.mainnet;
  const isMainnetDisabled = true; // Disable mainnet for now

  // Read USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: ethAddress ? [ethAddress] : undefined,
    query: { enabled: !!ethAddress },
  });

  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: ethAddress && xreserveAddress ? [ethAddress, xreserveAddress as `0x${string}`] : undefined,
    query: { enabled: !!ethAddress && !!xreserveAddress },
  });

  // Write contracts
  const { writeContract: approve, data: approveTxHash, isPending: isApproving } = useWriteContract();
  const { writeContract: deposit, data: depositTxHash, isPending: isDepositing } = useWriteContract();

  // Wait for transactions
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositTxHash });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle approve success
  useEffect(() => {
    if (approveSuccess && step === 'approving') {
      refetchAllowance();
      handleBridge();
    }
  }, [approveSuccess]);

  // Handle deposit success
  useEffect(() => {
    if (depositSuccess && step === 'bridging') {
      setStep('success');
      setBridgeTxHash(depositTxHash || null);
    }
  }, [depositSuccess, depositTxHash]);

  const amountInWei = amount ? parseUnits(amount, 6) : BigInt(0);
  const needsApproval = allowance !== undefined && amountInWei > allowance;
  const hasEnoughBalance = usdcBalance !== undefined && amountInWei <= usdcBalance;

  const handleApprove = async () => {
    if (!ethAddress || !stacksAddress) return;
    setError(null);
    setStep('approving');

    try {
      approve({
        address: usdcAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [xreserveAddress as `0x${string}`, amountInWei],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
      setStep('idle');
    }
  };

  const handleBridge = async () => {
    if (!ethAddress || !stacksAddress) return;
    setError(null);
    setStep('bridging');

    try {
      const remoteRecipient = encodeStacksAddress(stacksAddress);
      const maxFee = BigInt(0); // No fee for testnet

      deposit({
        address: xreserveAddress as `0x${string}`,
        abi: XRESERVE_ABI,
        functionName: 'depositToRemote',
        args: [
          amountInWei,
          STACKS_DOMAIN,
          remoteRecipient,
          usdcAddress as `0x${string}`,
          maxFee,
          '0x' as `0x${string}`,
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bridge failed');
      setStep('idle');
    }
  };

  const handleSubmit = () => {
    if (needsApproval) {
      handleApprove();
    } else {
      handleBridge();
    }
  };

  const canBridge =
    ethConnected &&
    stacksConnected &&
    amount &&
    parseFloat(amount) > 0 &&
    hasEnoughBalance &&
    step === 'idle';

  if (!mounted) return null;

  return (
    <main className="min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-text-muted hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-secondary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-8 h-8 text-brand-secondary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Bridge USDC</h1>
          <p className="text-text-muted">
            Bridge USDC from Ethereum to USDCx on Stacks
          </p>
        </div>

        {/* Network Selector */}
        <div className="card mb-6">
          <label className="label flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Network
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setNetwork('testnet')}
              className={`p-4 rounded-xl border-2 transition-all ${
                network === 'testnet'
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-dark-border hover:border-brand-primary/50'
              }`}
            >
              <p className="font-bold">Testnet</p>
              <p className="text-xs text-text-muted">Sepolia → Stacks Testnet</p>
            </button>
            <button
              onClick={() => !isMainnetDisabled && setNetwork('mainnet')}
              disabled={isMainnetDisabled}
              className={`p-4 rounded-xl border-2 transition-all relative ${
                network === 'mainnet'
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-dark-border'
              } ${isMainnetDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-brand-primary/50'}`}
            >
              {isMainnetDisabled && (
                <Lock className="w-4 h-4 absolute top-2 right-2 text-text-muted" />
              )}
              <p className="font-bold">Mainnet</p>
              <p className="text-xs text-text-muted">Coming Soon</p>
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="card mb-6">
          {/* Step 1: Connect ETH Wallet */}
          <div className="mb-6">
            <label className="label">1. Connect Ethereum Wallet</label>
            {ethConnected ? (
              <div className="flex items-center justify-between p-4 bg-dark-hover rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yes/10 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-yes" />
                  </div>
                  <div>
                    <p className="font-medium">{ethAddress?.slice(0, 6)}...{ethAddress?.slice(-4)}</p>
                    <p className="text-sm text-text-muted">
                      {chain?.name || 'Unknown'} | {usdcBalance ? formatUnits(usdcBalance, 6) : '0'} USDC
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => disconnect()}
                  className="text-sm text-text-muted hover:text-white"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="w-full p-4 bg-dark-hover rounded-lg border border-dark-border hover:border-brand-primary/50 transition-colors flex items-center justify-center gap-2"
              >
                <Wallet className="w-5 h-5" />
                Connect MetaMask
              </button>
            )}
          </div>

          {/* Step 2: Connect Stacks Wallet */}
          <div className="mb-6">
            <label className="label">2. Connect Stacks Wallet (Destination)</label>
            {stacksConnected ? (
              <div className="flex items-center justify-between p-4 bg-dark-hover rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yes/10 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-yes" />
                  </div>
                  <div>
                    <p className="font-medium">{stacksAddress?.slice(0, 6)}...{stacksAddress?.slice(-4)}</p>
                    <p className="text-sm text-text-muted">Stacks Testnet</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-dark-hover rounded-lg border border-dark-border text-center">
                <p className="text-text-muted mb-2">Connect Stacks wallet from header</p>
                <p className="text-xs text-text-muted">Your USDCx will be sent to this address</p>
              </div>
            )}
          </div>

          {/* Step 3: Amount */}
          <div className="mb-6">
            <label className="label">3. Amount to Bridge</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="input pr-20"
                min="0"
                step="0.01"
                disabled={!ethConnected || !stacksConnected}
              />
              <button
                onClick={() => usdcBalance && setAmount(formatUnits(usdcBalance, 6))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-primary hover:text-brand-primary/80"
                disabled={!usdcBalance}
              >
                MAX
              </button>
            </div>
            {ethConnected && (
              <p className="text-xs text-text-muted mt-2">
                Available: {usdcBalance ? formatUnits(usdcBalance, 6) : '0'} USDC
              </p>
            )}
            {amount && !hasEnoughBalance && (
              <p className="text-xs text-no mt-2">Insufficient balance</p>
            )}
          </div>

          {/* Bridge Summary */}
          {amount && parseFloat(amount) > 0 && ethConnected && stacksConnected && (
            <div className="mb-6 p-4 bg-dark-hover rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="text-center">
                  <p className="text-sm text-text-muted">From</p>
                  <p className="font-bold">Ethereum</p>
                  <p className="text-sm text-text-muted">{amount} USDC</p>
                </div>
                <ArrowRight className="w-6 h-6 text-brand-primary" />
                <div className="text-center">
                  <p className="text-sm text-text-muted">To</p>
                  <p className="font-bold">Stacks</p>
                  <p className="text-sm text-text-muted">{amount} USDCx</p>
                </div>
              </div>
              <p className="text-xs text-text-muted text-center">
                Estimated time: ~15 minutes via Circle xReserve
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-no/10 border border-no/30 rounded-lg flex items-center gap-3 text-no">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Success */}
          {step === 'success' && bridgeTxHash && (
            <div className="mb-6 p-4 bg-yes/10 border border-yes/30 rounded-lg">
              <div className="flex items-center gap-2 text-yes mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Bridge Initiated!</span>
              </div>
              <p className="text-sm text-text-muted mb-2">
                Your {amount} USDCx will arrive in ~15 minutes.
              </p>
              <a
                href={`https://sepolia.etherscan.io/tx/${bridgeTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-brand-primary hover:underline"
              >
                View on Etherscan
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Bridge Button */}
          <button
            onClick={handleSubmit}
            disabled={!canBridge || isApproving || isDepositing}
            className="w-full py-4 rounded-xl font-bold text-lg bg-brand-secondary text-white hover:bg-brand-secondary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApproving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Approving...
              </>
            ) : isDepositing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Bridging...
              </>
            ) : needsApproval ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Approve & Bridge
              </>
            ) : !ethConnected ? (
              'Connect ETH Wallet'
            ) : !stacksConnected ? (
              'Connect Stacks Wallet'
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Bridge to Stacks
              </>
            )}
          </button>
        </div>

        {/* Info */}
        <div className="card">
          <h3 className="font-semibold mb-4">How Bridge Works</h3>
          <ol className="space-y-3 text-sm text-text-muted">
            <li className="flex gap-3">
              <span className="w-6 h-6 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold flex-shrink-0">1</span>
              <span>Connect your Ethereum wallet (MetaMask) with USDC</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold flex-shrink-0">2</span>
              <span>Connect your Stacks wallet (Leather) to receive USDCx</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold flex-shrink-0">3</span>
              <span>Approve and bridge your USDC via Circle xReserve</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold flex-shrink-0">4</span>
              <span>USDCx arrives in your Stacks wallet in ~15 minutes</span>
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
