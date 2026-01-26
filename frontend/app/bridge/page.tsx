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
    <main className="min-h-screen py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-white mb-8 transition-colors text-base"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-brand-secondary/10 flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="w-10 h-10 text-brand-secondary" />
          </div>
          <h1 className="text-4xl font-bold mb-3">Bridge USDC</h1>
          <p className="text-text-secondary text-lg">
            Bridge USDC from Ethereum to USDCx on Stacks
          </p>
        </div>

        {/* Network Selector */}
        <div className="card card-spacing mb-8">
          <label className="label text-base font-semibold text-text-secondary flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Network
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setNetwork('testnet')}
              className={`p-6 border-2 transition-all ${
                network === 'testnet'
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-dark-border hover:border-brand-primary/50'
              }`}
            >
              <p className="text-lg font-bold">Testnet</p>
              <p className="text-sm text-text-secondary">Sepolia → Stacks Testnet</p>
            </button>
            <button
              onClick={() => !isMainnetDisabled && setNetwork('mainnet')}
              disabled={isMainnetDisabled}
              className={`p-6 border-2 transition-all relative ${
                network === 'mainnet'
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-dark-border'
              } ${isMainnetDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-brand-primary/50'}`}
            >
              {isMainnetDisabled && (
                <Lock className="w-5 h-5 absolute top-3 right-3 text-text-secondary" />
              )}
              <p className="text-lg font-bold">Mainnet</p>
              <p className="text-sm text-text-secondary">Coming Soon</p>
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="card card-spacing mb-8">
          {/* Step 1: Connect ETH Wallet */}
          <div className="mb-8">
            <label className="label text-base font-semibold text-text-secondary">1. Connect Ethereum Wallet</label>
            {ethConnected ? (
              <div className="flex items-center justify-between p-6 bg-dark-hover">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-yes/10 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-yes" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{ethAddress?.slice(0, 6)}...{ethAddress?.slice(-4)}</p>
                    <p className="text-base text-text-secondary">
                      {chain?.name || 'Unknown'} | {usdcBalance ? formatUnits(usdcBalance, 6) : '0'} USDC
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => disconnect()}
                  className="text-base text-text-secondary hover:text-white font-semibold"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="w-full p-6 bg-dark-hover border-2 border-dark-border hover:border-brand-primary/50 transition-colors flex items-center justify-center gap-3 text-base"
              >
                <Wallet className="w-6 h-6" />
                Connect MetaMask
              </button>
            )}
          </div>

          {/* Step 2: Connect Stacks Wallet */}
          <div className="mb-8">
            <label className="label text-base font-semibold text-text-secondary">2. Connect Stacks Wallet (Destination)</label>
            {stacksConnected ? (
              <div className="flex items-center justify-between p-6 bg-dark-hover">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-yes/10 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-yes" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{stacksAddress?.slice(0, 6)}...{stacksAddress?.slice(-4)}</p>
                    <p className="text-base text-text-secondary">Stacks Testnet</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-dark-hover border-2 border-dark-border text-center">
                <p className="text-text-secondary mb-2 text-base">Connect Stacks wallet from header</p>
                <p className="text-sm text-text-secondary">Your USDCx will be sent to this address</p>
              </div>
            )}
          </div>

          {/* Step 3: Amount */}
          <div className="mb-8">
            <label className="label text-base font-semibold text-text-secondary">3. Amount to Bridge</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="input pr-24 py-4 text-base"
                min="0"
                step="0.01"
                disabled={!ethConnected || !stacksConnected}
              />
              <button
                onClick={() => usdcBalance && setAmount(formatUnits(usdcBalance, 6))}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-brand-primary hover:text-brand-primary/80 font-semibold"
                disabled={!usdcBalance}
              >
                MAX
              </button>
            </div>
            {ethConnected && (
              <p className="text-sm text-text-secondary mt-3">
                Available: {usdcBalance ? formatUnits(usdcBalance, 6) : '0'} USDC
              </p>
            )}
            {amount && !hasEnoughBalance && (
              <p className="text-sm text-no mt-3 font-semibold">Insufficient balance</p>
            )}
          </div>

          {/* Bridge Summary */}
          {amount && parseFloat(amount) > 0 && ethConnected && stacksConnected && (
            <div className="mb-8 p-6 bg-dark-hover">
              <div className="flex items-center justify-between mb-6">
                <div className="text-center">
                  <p className="text-base text-text-secondary">From</p>
                  <p className="text-xl font-bold">Ethereum</p>
                  <p className="text-base text-text-secondary">{amount} USDC</p>
                </div>
                <ArrowRight className="w-8 h-8 text-brand-primary" />
                <div className="text-center">
                  <p className="text-base text-text-secondary">To</p>
                  <p className="text-xl font-bold">Stacks</p>
                  <p className="text-base text-text-secondary">{amount} USDCx</p>
                </div>
              </div>
              <p className="text-sm text-text-secondary text-center">
                Estimated time: ~15 minutes via Circle xReserve
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-8 p-4 bg-no/10 border border-no/30 flex items-center gap-3 text-no">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <p className="text-base">{error}</p>
            </div>
          )}

          {/* Success */}
          {step === 'success' && bridgeTxHash && (
            <div className="mb-8 p-6 bg-yes/10 border border-yes/30">
              <div className="flex items-center gap-3 text-yes mb-3">
                <CheckCircle className="w-6 h-6" />
                <span className="text-lg font-bold">Bridge Initiated!</span>
              </div>
              <p className="text-base text-text-secondary mb-3">
                Your {amount} USDCx will arrive in ~15 minutes.
              </p>
              <a
                href={`https://sepolia.etherscan.io/tx/${bridgeTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-base text-brand-primary hover:underline font-semibold"
              >
                View on Etherscan
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Bridge Button */}
          <button
            onClick={handleSubmit}
            disabled={!canBridge || isApproving || isDepositing}
            className="w-full py-5 font-bold text-lg bg-brand-secondary text-white hover:bg-brand-secondary/90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="card card-spacing">
          <h3 className="text-xl font-bold mb-6">How Bridge Works</h3>
          <ol className="space-y-4 text-base text-text-secondary">
            <li className="flex gap-4">
              <span className="w-8 h-8 bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold flex-shrink-0 text-lg">1</span>
              <span>Connect your Ethereum wallet (MetaMask) with USDC</span>
            </li>
            <li className="flex gap-4">
              <span className="w-8 h-8 bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold flex-shrink-0 text-lg">2</span>
              <span>Connect your Stacks wallet (Leather) to receive USDCx</span>
            </li>
            <li className="flex gap-4">
              <span className="w-8 h-8 bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold flex-shrink-0 text-lg">3</span>
              <span>Approve and bridge your USDC via Circle xReserve</span>
            </li>
            <li className="flex gap-4">
              <span className="w-8 h-8 bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold flex-shrink-0 text-lg">4</span>
              <span>USDCx arrives in your Stacks wallet in ~15 minutes</span>
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
