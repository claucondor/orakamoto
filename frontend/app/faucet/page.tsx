'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { openContractCall } from '@stacks/connect';
import { uintCV } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { useWalletStore, useTxStore } from '@/lib/store';
import { CONTRACTS, formatTokenAmount, parseTokenAmount } from '@/lib/constants';
import {
  Droplets,
  Wallet,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Coins,
  Gift,
} from 'lucide-react';

const FAUCET_AMOUNTS = [100, 500, 1000, 5000];

export default function FaucetPage() {
  const [mounted, setMounted] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const [isRequesting, setIsRequesting] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected, usdcxBalance, faucetRemaining, refreshBalance } = useWalletStore();
  const { setPendingTx, setTxSuccess, setTxError } = useTxStore();

  useEffect(() => {
    setMounted(true);
    if (address) {
      refreshBalance();
    }
  }, [address, refreshBalance]);

  const handleRequestTokens = async () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet');
      return;
    }

    const amountInMicro = parseTokenAmount(selectedAmount);
    if (amountInMicro > faucetRemaining) {
      setError(`You can only claim ${formatTokenAmount(faucetRemaining)} more USDCx`);
      return;
    }

    setError(null);
    setTxId(null);
    setIsRequesting(true);

    try {
      await openContractCall({
        network: new StacksTestnet(),
        contractAddress: CONTRACTS.USDCX_DEPLOYER,
        contractName: CONTRACTS.USDCX,
        functionName: 'faucet',
        functionArgs: [uintCV(Number(amountInMicro))],
        onFinish: (data) => {
          setTxId(data.txId);
          setPendingTx(data.txId);
          setTxSuccess(`Received ${selectedAmount} USDCx!`);
          setIsRequesting(false);
          // Refresh balance after a delay
          setTimeout(() => refreshBalance(), 3000);
        },
        onCancel: () => {
          setIsRequesting(false);
        },
      });
    } catch (err) {
      console.error('Faucet error:', err);
      setError(err instanceof Error ? err.message : 'Failed to request tokens');
      setTxError(err instanceof Error ? err.message : 'Failed to request tokens');
      setIsRequesting(false);
    }
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Droplets className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Testnet Faucet</h1>
          <p className="text-text-muted">
            Get free USDCx tokens to test trading on Orakamoto
          </p>
        </div>

        {/* Main Card */}
        <div className="card mb-6">
          {/* Balance Display */}
          {isConnected && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-dark-hover rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-4 h-4 text-brand-primary" />
                  <span className="text-sm text-text-muted">Your Balance</span>
                </div>
                <p className="text-2xl font-bold">${formatTokenAmount(usdcxBalance)}</p>
              </div>
              <div className="p-4 bg-dark-hover rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="w-4 h-4 text-yes" />
                  <span className="text-sm text-text-muted">Faucet Remaining</span>
                </div>
                <p className="text-2xl font-bold text-yes">${formatTokenAmount(faucetRemaining)}</p>
              </div>
            </div>
          )}

          {/* Amount Selection */}
          <div className="mb-6">
            <label className="label">Select Amount</label>
            <div className="grid grid-cols-4 gap-3">
              {FAUCET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setSelectedAmount(amount)}
                  disabled={isConnected && parseTokenAmount(amount) > faucetRemaining}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    selectedAmount === amount
                      ? 'border-brand-primary bg-brand-primary/10'
                      : 'border-dark-border hover:border-brand-primary/50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <p className="text-lg font-bold">${amount}</p>
                  <p className="text-xs text-text-muted">USDCx</p>
                </button>
              ))}
            </div>
          </div>

          {/* Success Message */}
          {txId && (
            <div className="mb-6 p-4 bg-yes/10 border border-yes/30 rounded-lg">
              <div className="flex items-center gap-2 text-yes mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Tokens Requested!</span>
              </div>
              <p className="text-sm text-text-muted mb-2">
                Your {selectedAmount} USDCx will arrive shortly.
              </p>
              <a
                href={`https://explorer.hiro.so/txid/${txId}?chain=testnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-brand-primary hover:underline"
              >
                View Transaction
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-no/10 border border-no/30 rounded-lg flex items-center gap-3 text-no">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Request Button */}
          <button
            onClick={handleRequestTokens}
            disabled={!isConnected || isRequesting || (isConnected && faucetRemaining === BigInt(0))}
            className="w-full py-4 rounded-xl font-bold text-lg bg-brand-primary text-white hover:bg-brand-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRequesting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Requesting...
              </>
            ) : !isConnected ? (
              <>
                <Wallet className="w-5 h-5" />
                Connect Wallet
              </>
            ) : faucetRemaining === BigInt(0) ? (
              'Faucet Limit Reached'
            ) : (
              <>
                <Droplets className="w-5 h-5" />
                Get {selectedAmount} USDCx
              </>
            )}
          </button>

          {/* Info */}
          <p className="text-center text-sm text-text-muted mt-4">
            Maximum 10,000 USDCx per wallet on testnet
          </p>
        </div>

        {/* Next Steps */}
        <div className="card">
          <h3 className="font-semibold mb-4">Next Steps</h3>
          <div className="space-y-3">
            <Link
              href="/markets"
              className="flex items-center justify-between p-4 bg-dark-hover rounded-lg hover:bg-dark-card transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-primary/10 rounded-lg flex items-center justify-center">
                  <Coins className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <p className="font-medium">Browse Markets</p>
                  <p className="text-sm text-text-muted">Find a market to trade</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-brand-primary transition-colors" />
            </Link>

            <Link
              href="/create"
              className="flex items-center justify-between p-4 bg-dark-hover rounded-lg hover:bg-dark-card transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-secondary/10 rounded-lg flex items-center justify-center">
                  <Gift className="w-5 h-5 text-brand-secondary" />
                </div>
                <div>
                  <p className="font-medium">Create a Market</p>
                  <p className="text-sm text-text-muted">Start your own prediction market</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-brand-primary transition-colors" />
            </Link>
          </div>
        </div>

        {/* STX Faucet Link */}
        <div className="mt-6 p-4 bg-dark-card border border-dark-border rounded-xl">
          <p className="text-sm text-text-muted mb-2">
            Need STX for transaction fees?
          </p>
          <a
            href="https://explorer.hiro.so/sandbox/faucet?chain=testnet"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-brand-primary hover:underline"
          >
            Get testnet STX from Hiro Faucet
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </main>
  );
}
