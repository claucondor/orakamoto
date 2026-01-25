'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { openContractCall } from '@stacks/connect';
import { stringUtf8CV, uintCV, PostConditionMode } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { useWalletStore, useTxStore } from '@/lib/store';
import { CONTRACTS, formatTokenAmount, parseTokenAmount } from '@/lib/constants';
import { getCurrentBlockHeight } from '@/lib/contracts';
import {
  ArrowLeft,
  Plus,
  Calendar,
  Coins,
  HelpCircle,
  Loader2,
  AlertCircle,
  CheckCircle,
  Lightbulb,
} from 'lucide-react';

export default function CreateMarketPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Form state
  const [question, setQuestion] = useState('');
  const [deadlineMode, setDeadlineMode] = useState<'quick' | 'custom'>('quick');
  const [quickDuration, setQuickDuration] = useState<number | null>(null); // minutes
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [liquidity, setLiquidity] = useState('10');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // UI state
  const [currentBlock, setCurrentBlock] = useState(0);

  // Quick duration options
  const quickOptions = [
    { label: '5 min', minutes: 5 },
    { label: '30 min', minutes: 30 },
    { label: '1 hour', minutes: 60 },
    { label: '6 hours', minutes: 360 },
    { label: '1 day', minutes: 1440 },
    { label: '1 week', minutes: 10080 },
  ];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  const { address, isConnected, usdcxBalance, refreshBalance } = useWalletStore();
  const { setPendingTx, setTxSuccess, setTxError } = useTxStore();

  useEffect(() => {
    setMounted(true);
    getCurrentBlockHeight().then(setCurrentBlock);
    if (address) {
      refreshBalance();
    }
  }, [address, refreshBalance]);

  // Calculate deadline block height
  const calculateDeadlineBlock = () => {
    let minutesUntilDeadline = 0;

    if (deadlineMode === 'quick' && quickDuration) {
      minutesUntilDeadline = quickDuration;
    } else if (deadlineMode === 'custom' && deadlineDate && deadlineTime) {
      const deadlineDateTime = new Date(`${deadlineDate}T${deadlineTime}`);
      const now = new Date();
      minutesUntilDeadline = Math.floor((deadlineDateTime.getTime() - now.getTime()) / (1000 * 60));
    }

    if (minutesUntilDeadline <= 0) return 0;

    // Stacks with Nakamoto: ~10 seconds per block = 6 blocks per minute
    const blocksUntilDeadline = Math.floor(minutesUntilDeadline * 6);
    return currentBlock + blocksUntilDeadline;
  };

  // Format duration for display
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hour${minutes >= 120 ? 's' : ''}`;
    return `${Math.floor(minutes / 1440)} day${minutes >= 2880 ? 's' : ''}`;
  };

  const deadlineBlock = calculateDeadlineBlock();
  const resolutionDeadlineBlock = deadlineBlock + 1000; // ~2 days after deadline

  const liquidityAmount = parseFloat(liquidity) || 0;
  const liquidityInMicro = parseTokenAmount(liquidityAmount);

  const canCreate =
    isConnected &&
    question.length > 0 &&
    question.length <= 256 &&
    deadlineBlock > currentBlock &&
    liquidityAmount >= 1 &&
    liquidityInMicro <= usdcxBalance;

  const handleCreate = async () => {
    if (!canCreate) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await openContractCall({
        network: new StacksTestnet(),
        contractAddress: CONTRACTS.DEPLOYER,
        contractName: CONTRACTS.MULTI_MARKET_POOL,
        functionName: 'create-market',
        functionArgs: [
          stringUtf8CV(question),
          uintCV(deadlineBlock),
          uintCV(resolutionDeadlineBlock),
          uintCV(Number(liquidityInMicro)),
        ],
        postConditionMode: PostConditionMode.Allow,
        onFinish: (data) => {
          setTxId(data.txId);
          setPendingTx(data.txId);
          setTxSuccess('Market created successfully!');
          setIsSubmitting(false);
        },
        onCancel: () => {
          setIsSubmitting(false);
        },
      });
    } catch (err) {
      console.error('Create market error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create market');
      setTxError(err instanceof Error ? err.message : 'Failed to create market');
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  if (txId) {
    return (
      <main className="min-h-screen py-8">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card text-center py-12">
            <div className="w-16 h-16 bg-yes/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-yes" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Market Created!</h2>
            <p className="text-text-muted mb-6">
              Your prediction market has been submitted to the blockchain.
            </p>
            <div className="p-4 bg-dark-hover rounded-lg mb-6">
              <p className="text-sm text-text-muted mb-1">Transaction ID</p>
              <a
                href={`https://explorer.hiro.so/txid/${txId}?chain=testnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-brand-primary hover:underline break-all"
              >
                {txId}
              </a>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/markets"
                className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-all"
              >
                View Markets
              </Link>
              <button
                onClick={() => {
                  setTxId(null);
                  setQuestion('');
                  setDeadlineMode('quick');
                  setQuickDuration(null);
                  setDeadlineDate('');
                  setDeadlineTime('');
                  setLiquidity('10');
                  setShowAdvanced(false);
                }}
                className="px-6 py-3 bg-dark-hover border border-dark-border text-white rounded-xl font-bold hover:bg-dark-card transition-all"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Link
          href="/markets"
          className="inline-flex items-center gap-2 text-text-muted hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Markets
        </Link>

        <div className="card">
          <h1 className="text-2xl font-bold mb-2">Create Prediction Market</h1>
          <p className="text-text-muted mb-8">
            Create a new binary (YES/NO) market. You'll earn 10% of all trading fees (3% → 20% exponential).
          </p>

          {/* Question Input */}
          <div className="mb-6">
            <label className="label flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              Market Question
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will Bitcoin reach $100,000 by December 2025?"
              className="input min-h-[100px] resize-none"
              maxLength={256}
            />
            <div className="flex justify-between mt-2">
              <p className="text-xs text-text-muted">
                Ask a clear yes/no question about a future event
              </p>
              <p className={`text-xs ${question.length > 200 ? 'text-warning' : 'text-text-muted'}`}>
                {question.length}/256
              </p>
            </div>
          </div>

          {/* Deadline Input */}
          <div className="mb-6">
            <label className="label flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Trading Deadline
            </label>

            {/* Mode Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setDeadlineMode('quick')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  deadlineMode === 'quick'
                    ? 'bg-brand-primary text-white'
                    : 'bg-dark-hover text-text-secondary hover:text-white'
                }`}
              >
                Quick Select
              </button>
              <button
                onClick={() => setDeadlineMode('custom')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  deadlineMode === 'custom'
                    ? 'bg-brand-primary text-white'
                    : 'bg-dark-hover text-text-secondary hover:text-white'
                }`}
              >
                Custom Date
              </button>
            </div>

            {/* Quick Duration Options */}
            {deadlineMode === 'quick' && (
              <div className="grid grid-cols-3 gap-2">
                {quickOptions.map((option) => (
                  <button
                    key={option.minutes}
                    onClick={() => setQuickDuration(option.minutes)}
                    className={`py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                      quickDuration === option.minutes
                        ? 'bg-brand-secondary text-white ring-2 ring-brand-secondary/50'
                        : 'bg-dark-hover text-text-secondary hover:text-white hover:bg-dark-card'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {/* Custom Date/Time */}
            {deadlineMode === 'custom' && (
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="input"
                  min={new Date().toISOString().split('T')[0]}
                />
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="input"
                />
              </div>
            )}

            {/* Duration Summary */}
            {deadlineBlock > 0 && (
              <div className="mt-3 p-3 bg-yes/5 border border-yes/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">Trading ends in:</span>
                  <span className="text-lg font-bold text-yes">
                    {deadlineMode === 'quick' && quickDuration
                      ? formatDuration(quickDuration)
                      : `~${formatDuration(Math.floor((deadlineBlock - currentBlock) / 6))}`}
                  </span>
                </div>
              </div>
            )}

            {/* Advanced Block Info (Collapsible) */}
            {deadlineBlock > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-text-muted hover:text-white flex items-center gap-1"
                >
                  {showAdvanced ? '▼' : '▶'} Advanced: Block Details
                </button>
                {showAdvanced && (
                  <div className="mt-2 p-3 bg-dark-hover rounded-lg text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Current block:</span>
                      <span className="font-mono">{currentBlock.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-text-muted">Deadline block:</span>
                      <span className="font-mono">{deadlineBlock.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-text-muted">Blocks remaining:</span>
                      <span className="font-mono text-brand-primary">{(deadlineBlock - currentBlock).toLocaleString()}</span>
                    </div>
                    <p className="text-text-muted mt-2 pt-2 border-t border-dark-border">
                      Nakamoto upgrade: ~10 seconds per block
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Liquidity Input */}
          <div className="mb-6">
            <label className="label flex items-center gap-2">
              <Coins className="w-4 h-4" />
              Initial Liquidity (USDCx)
            </label>
            <div className="relative">
              <input
                type="number"
                value={liquidity}
                onChange={(e) => setLiquidity(e.target.value)}
                placeholder="10"
                className="input pr-20"
                min="1"
                step="1"
              />
              <button
                onClick={() => setLiquidity(formatTokenAmount(usdcxBalance).replace(/,/g, ''))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-primary hover:text-brand-primary/80"
              >
                MAX
              </button>
            </div>
            <div className="flex justify-between mt-2">
              <p className="text-xs text-text-muted">
                Minimum: 1 USDCx | Your balance: ${formatTokenAmount(usdcxBalance)}
              </p>
              {liquidityInMicro > usdcxBalance && (
                <p className="text-xs text-no">Insufficient balance</p>
              )}
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-brand-primary/5 border border-brand-primary/20 rounded-lg mb-6">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-brand-primary mb-1">Creator Benefits</p>
                <ul className="text-text-muted space-y-1">
                  <li>- Earn 10% of all trading fees from your market</li>
                  <li>- Receive LP tokens for your initial liquidity</li>
                  <li>- You control when the market resolves after deadline</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Preview */}
          {question && deadlineBlock > 0 && liquidityAmount >= 1 && (
            <div className="p-4 bg-dark-hover rounded-lg mb-6">
              <p className="text-sm font-medium mb-3">Market Preview</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Question</span>
                  <span className="text-right max-w-[60%] truncate">{question}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Trading Duration</span>
                  <span>
                    {deadlineMode === 'quick' && quickDuration
                      ? formatDuration(quickDuration)
                      : `~${formatDuration(Math.floor((deadlineBlock - currentBlock) / 6))}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Initial Liquidity</span>
                  <span>${liquidityAmount.toFixed(2)} USDCx</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Initial YES/NO Price</span>
                  <span>50% / 50%</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-no/10 border border-no/30 rounded-lg flex items-center gap-3 text-no">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={!canCreate || isSubmitting}
            className="w-full py-4 rounded-xl font-bold text-lg bg-brand-primary text-white hover:bg-brand-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Market...
              </>
            ) : !isConnected ? (
              'Connect Wallet to Create'
            ) : (
              <>
                <Plus className="w-5 h-5" />
                Create Market
              </>
            )}
          </button>

          {/* Connect Wallet Prompt */}
          {!isConnected && (
            <p className="text-center text-sm text-text-muted mt-4">
              Please connect your wallet to create a market
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
