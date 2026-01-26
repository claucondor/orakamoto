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
    <main className="min-h-screen py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-brand-primary/10 flex items-center justify-center mx-auto mb-6">
            <Droplets className="w-10 h-10 text-brand-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-3">Testnet Faucet</h1>
          <p className="text-text-secondary text-lg">
            Get free USDCx tokens to test trading on Orakamoto
          </p>
        </div>

        {/* Main Card */}
        <div className="card card-spacing mb-8">
          {/* Balance Display */}
          {isConnected && (
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="p-6 bg-dark-hover">
                <div className="flex items-center gap-3 mb-3">
                  <Coins className="w-6 h-6 text-brand-primary" />
                  <span className="text-base text-text-secondary font-semibold">Your Balance</span>
                </div>
                <p className="text-3xl font-bold">${formatTokenAmount(usdcxBalance)}</p>
              </div>
              <div className="p-6 bg-dark-hover">
                <div className="flex items-center gap-3 mb-3">
                  <Gift className="w-6 h-6 text-yes" />
                  <span className="text-base text-text-secondary font-semibold">Faucet Remaining</span>
                </div>
                <p className="text-3xl font-bold text-yes">${formatTokenAmount(faucetRemaining)}</p>
              </div>
            </div>
          )}

          {/* Amount Selection */}
          <div className="mb-8">
            <label className="label text-base font-semibold text-text-secondary">Select Amount</label>
            <div className="grid grid-cols-4 gap-4">
              {FAUCET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setSelectedAmount(amount)}
                  disabled={isConnected && parseTokenAmount(amount) > faucetRemaining}
                  className={`p-6 border-2 transition-all ${
                    selectedAmount === amount
                      ? 'border-brand-primary bg-brand-primary/10'
                      : 'border-dark-border hover:border-brand-primary/50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <p className="text-2xl font-bold">${amount}</p>
                  <p className="text-sm text-text-secondary">USDCx</p>
                </button>
              ))}
            </div>
          </div>

          {/* Success Message */}
          {txId && (
            <div className="mb-8 p-6 bg-yes/10 border border-yes/30">
              <div className="flex items-center gap-3 text-yes mb-3">
                <CheckCircle className="w-6 h-6" />
                <span className="text-lg font-bold">Tokens Requested!</span>
              </div>
              <p className="text-base text-text-secondary mb-3">
                Your {selectedAmount} USDCx will arrive shortly.
              </p>
              <a
                href={`https://explorer.hiro.so/txid/${txId}?chain=testnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-base text-brand-primary hover:underline font-semibold"
              >
                View Transaction
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-8 p-4 bg-no/10 border border-no/30 flex items-center gap-3 text-no">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <p className="text-base">{error}</p>
            </div>
          )}

          {/* Request Button */}
          <button
            onClick={handleRequestTokens}
            disabled={!isConnected || isRequesting || (isConnected && faucetRemaining === BigInt(0))}
            className="w-full py-5 font-bold text-lg bg-brand-primary text-white hover:bg-brand-primary/90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="text-center text-base text-text-secondary mt-6">
            Maximum 10,000 USDCx per wallet on testnet
          </p>
        </div>

        {/* Next Steps */}
        <div className="card card-spacing">
          <h3 className="text-xl font-bold mb-6">Next Steps</h3>
          <div className="space-y-4">
            <Link
              href="/markets"
              className="flex items-center justify-between p-6 bg-dark-hover hover:bg-dark-card transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-brand-primary/10 flex items-center justify-center">
                  <Coins className="w-7 h-7 text-brand-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold">Browse Markets</p>
                  <p className="text-base text-text-secondary">Find a market to trade</p>
                </div>
              </div>
              <ArrowRight className="w-6 h-6 text-text-secondary group-hover:text-brand-primary transition-colors" />
            </Link>

            <Link
              href="/create"
              className="flex items-center justify-between p-6 bg-dark-hover hover:bg-dark-card transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-brand-secondary/10 flex items-center justify-center">
                  <Gift className="w-7 h-7 text-brand-secondary" />
                </div>
                <div>
                  <p className="text-lg font-bold">Create a Market</p>
                  <p className="text-base text-text-secondary">Start your own prediction market</p>
                </div>
              </div>
              <ArrowRight className="w-6 h-6 text-text-secondary group-hover:text-brand-primary transition-colors" />
            </Link>
          </div>
        </div>

        {/* STX Faucet Link */}
        <div className="mt-8 p-6 bg-dark-card border-2 border-dark-border">
          <p className="text-base text-text-secondary mb-3">
            Need STX for transaction fees?
          </p>
          <a
            href="https://explorer.hiro.so/sandbox/faucet?chain=testnet"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-lg text-brand-primary hover:underline font-semibold"
          >
            Get testnet STX from Hiro Faucet
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      </div>
    </main>
  );
}
